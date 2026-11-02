# Notifications — design

Reliable reminders are DueOra's most important feature. This document describes how they are
planned, de-duplicated, delivered and tested. Code lives in `backend/src/notifications/` and
`backend/src/jobs/`; the scheduling maths is in `backend/src/domain/schedule.ts`.

## Goals

1. **Right day, right hour, right timezone.** Reminders go out once the workspace's local time reaches
   its `reminderHour` (default 09:00), computed in the workspace's IANA timezone.
2. **Never twice.** No reminder can be sent twice — not after a crash, a retry, or with two workers running.
3. **Never stale.** Paying, archiving or muting stops reminders immediately, even ones already queued.
4. **Never a burst.** After downtime, each obligation gets only its most relevant missed reminder.
5. **Never spammy.** More than 3 reminders for a person in one run become one grouped push + one digest email.
6. **Visible.** Every notification is also stored in-app (Alerts tab, unread badge).

## Moving parts

```
 ┌──────────────── worker process (always on) ───────────────────┐
 │  every 5 s (workOnce):                                         │
 │   1. plan reminders ──► for each workspace:                    │
 │        local time ≥ reminderHour and not yet run today?        │
 │        └─► claim OrgReminderRun(org, localDate)   (unique)     │
 │            └─► plan → recipients → insert Notification rows    │
 │                (unique dedupeKey) → enqueue delivery jobs      │
 │   2. once per 15-minute slot: check push receipts, prune jobs  │
 │   3. run due jobs:                                             │
 │        notify.push  ──► Expo push (chunks, tickets)            │
 │        notify.email ──► Resend                                 │
 └────────────────────────────────────────────────────────────────┘
```

* **Job queue** (`jobs/queue.ts`): a `Job` table in the same database (Postgres in production, SQLite in
  development), no Redis. Workers claim a job with a conditional update (`status = PENDING → RUNNING`),
  so two workers can never run the same job. Failures retry with exponential backoff
  (30 s × 2ⁿ, up to 5 attempts). Jobs stuck in RUNNING for 10 minutes (crashed worker) are released.
* **Scheduler** (`notifications/scheduler.ts`): the brief's "every 15 minutes" cron. Planning is cheap and
  exactly-once per workspace-day (the `OrgReminderRun` claim), so workers simply attempt it every cycle;
  receipt checks and pruning run once per 15-minute slot. Reminders therefore go out within seconds of
  the workspace's reminder hour.
* **Worker process** (`src/worker.ts`, `npm run worker`): can run as its own service or inside the API
  process (`RUN_WORKER_IN_API=true`). Several instances can run at once safely.

## Planning a day's reminders

For each workspace, on each tick:

1. Compute local time in the workspace's timezone. Before `reminderHour` → nothing to do.
2. **Claim the day**: insert `OrgReminderRun(organizationId, localDate)`. The unique constraint means
   only one worker ever processes a workspace's day; everyone else skips.
3. `since` = the previous run's local date (or yesterday for a brand-new workspace).
4. For every **ACTIVE** obligation whose current cycle isn't fully paid:
   `mostRecentMissedReminder(nextDueDate, reminderOffsets, since, today)`.
   - Normal day: `since` = yesterday, so this is "the reminder due today", if any.
   - After downtime: `since` is days ago, so it returns only the **latest** missed reminder
     (e.g. "due in 2 days" rather than the 7-day and 3-day ones). The message is phrased from *today's*
     point of view.
   - Offsets come from the obligation (defaults `30, 14, 7, 3, 1, 0, −1, −3, −7`). After the last
     after-due offset, reminders continue **weekly** (−14, −21, …) until paid or archived.
5. **Recipients**: the assignee, every ADMIN and FINANCE member, and DEPARTMENT members of the
   obligation's department — minus anyone who muted the obligation.
6. Group by person. For each person:
   * **In-app**: one `IN_APP` notification per reminder (always).
   * If **digest is on and they have more than 3 reminders** in this run → one grouped push
     ("4 payments need attention this week 🔔") and one digest email listing them.
   * Otherwise, per reminder:
     * **Push** if push is enabled and they have an active device.
     * **Email** if email is enabled and either they have no active push device (fallback) or it's a
       key moment — 7 days before, the due date, or the first overdue reminder.

## No duplicates, ever

Every notification row has a deterministic, unique `dedupeKey`:

```
reminders:        {orgId}:{obligationId}:{cycleDueDate}:{offsetDays}:{userId}:{channel}
digests:          {orgId}:digest:{localDate}:{userId}:{channel}
payment recorded: {orgId}:{obligationId}:{cycleDueDate}:payment-{paymentId}:{userId}:{channel}
test:             {orgId}:test:{timestamp}:{userId}:{channel}
```

**Insert, then send.** A delivery job is only enqueued after the row is inserted; if the insert hits the
unique constraint, that message already exists and is skipped. Delivery jobs carry the notification id
and are themselves idempotent (a row already `SENT`/`DELIVERED` is never re-sent). This holds across
restarts, retries and concurrent workers — the year-long simulation runs two schedulers at once to prove it.

## Stopping immediately

A delivery job re-checks, right before sending, that the obligation is still ACTIVE, the cycle is still
unpaid, and the recipient hasn't muted it or disabled the channel. If not, the notification is marked
`FAILED` with the reason (`cancelled: paid`, `cancelled: muted`, …) and nothing is sent. That covers
reminders waiting out quiet hours or a retry backoff.

## Quiet hours

Workspaces can set quiet hours (e.g. 22:00–07:00 local). Anything that would go out inside the window
gets `sendAfter` = the end of the window and its job's `runAt` is set to that instant. In-app entries are
created immediately (they make no noise).

## Delivery

**Push** (`notifications/push.ts`, `expo-server-sdk`):

* Messages are built per active device token and sent in Expo's recommended chunks.
* Android channels: `reminders` (default importance) and `overdue` (high importance, distinct
  vibration) — the app creates them on startup.
* Payload `data.url = dueora://payments/{obligationId}` so tapping opens the payment.
* **Tickets** are stored on the notification. Errors: `DeviceNotRegistered` deactivates that token;
  network/5xx/429 throw so the queue retries with backoff (max 5).
* **Receipts** are fetched by `push.receipts` ≈15 minutes later: `ok` → `DELIVERED`;
  `DeviceNotRegistered` → token deactivated; other errors → the push is retried (until 5 attempts).

**Email** (`notifications/email.ts`, Resend): branded, mobile-friendly HTML with the workspace logo,
amount, due date, a status badge and an "Open in DueOra" button (deep link). Network/429/5xx errors retry;
other errors fail permanently and are logged on the notification.

## Message copy

Short, specific and human:

| When | Example |
|---|---|
| Before | ⏰ KigaliToday hosting is due in 7 days — $1,523 on Tue, 20 Oct. |
| Tomorrow | ⏰ KigaliToday hosting is due tomorrow — $1,523. |
| Due today | 📅 Today: KT Radio domain — 18,880 RWF. |
| Overdue | ⚠️ Cloudflare (KigaliToday) is 3 days overdue — $240. Tap to record the payment. |
| Payment recorded (admins/finance) | ✅ Anitha recorded $132 for KT Radio hosting. Next due: 02 Oct 2028. |
| Digest | 🔔 4 payments need attention this week |

The amount shown is what's still owed on the cycle (after partial payments).

## Mobile

* Permission is requested **after the first obligation is created**, on an explanation screen
  ("Never miss a due date"), not on first launch.
* The Expo push token is registered on login and app start (`POST /devices`) and unregistered on logout.
* Android channels `reminders` and `overdue` are created at startup.
* Tapping a notification deep-links to the payment detail. Foreground notifications show an in-app toast.
* Settings → Notifications: push / email / digest toggles, quiet hours, reminder hour, and
  **Send test notification**.
* Push on Android requires a development or production build (not Expo Go) and FCM credentials —
  see `docs/DEPLOYMENT.md`.

## Testing

* `schedule.test.ts` — the pure engine (offsets, weekly follow-ups, catch-up), 100% coverage.
* `queue.test.ts` — claiming, retries with backoff, stale-lock recovery, singleton keys.
* `notifications.test.ts` — API: inbox, read state, preferences, mute, devices, test push.
* **`reminders.simulation.test.ts`** — a full year (2 Nov 2026 → 1 Nov 2027) with a fake clock ticking
  every 15 minutes over the seed workspace. It asserts the exact reminders: correct days and local hour,
  correct recipients, no duplicates (two schedulers run concurrently), reminders stop after payment and
  when muted, catch-up after a simulated outage sends one message per obligation, digests kick in, and
  timezone changes are respected.
