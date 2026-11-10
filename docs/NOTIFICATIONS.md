# Notifications — design

Reliable reminders are DueOra's most important feature. This document describes how they are
planned, de-duplicated, delivered and tested. Code lives in `backend/src/notifications/` and
`backend/src/jobs/`; the scheduling maths is in `backend/src/domain/schedule.ts`.

## Goals

1. **Right day, right hour, right timezone.** Reminders go out once the workspace's local time reaches
   its `reminderHour` (default 09:00), computed in the workspace's IANA timezone.
2. **Never twice.** No reminder can be sent twice — not after a crash, a retry, or with two workers running.
3. **Never stale.** Paying, archiving or muting stops reminders immediately, even ones already queued.
4. **Never a burst.** After downtime, each subscription gets only its most relevant missed reminder.
5. **Never spammy.** More than 3 reminders for a person in one run become one grouped push + one digest email.
6. **Visible.** Every notification is also stored in-app (Alerts tab, unread badge).
7. **Never leaky.** Copy, push payloads and emails never contain a subscription key.

## What people are notified about

| Type | When | Who | Channels |
|---|---|---|---|
| `REMINDER` | The subscription's offsets before the due date (workspace default 30, 14, 7, 3, 1 days) | every member not muted/snoozed | in-app, push; email at key moments or when no phone |
| `DUE_TODAY` | On the due date at the reminder hour | every member | same |
| `OVERDUE` | 1, 3 and 7 days after, then weekly until paid or archived | every member | same (high-importance channel) |
| `TRIAL_ENDING` | 3 days and 1 day before `trialEndsOn` | every member | same |
| `AUTO_RENEW_NOTICE` | 7 days before an auto-renew charge | ADMIN, FINANCE | same |
| `PAYMENT_RECORDED` | When someone records a payment | ADMIN, FINANCE (not the recorder) | in-app, push |
| `PRICE_CHANGE` | When an amount changes | ADMIN, FINANCE (not the editor) | in-app, push |
| `BUDGET_ALERT` | Month's paid + still due reaches the alert % — and again at 100% | ADMIN, FINANCE | in-app, push |
| `WEEKLY_DIGEST` | Mondays at the reminder hour: the week ahead + one DueOra AI line | opted in (`weeklySummary`) | in-app, push (digest channel), email |
| `MONTHLY_SUMMARY` | The 1st: last month's spend, this month, biggest price changes | opted in (`monthlySummary`) | in-app, push, email |
| `TEAM` | Invite accepted, role changed | ADMIN (`teamActivity`) | in-app, push (team channel) |
| `DIGEST` | More than 3 reminders for one person in one run | that person (`digestEnabled`) | one push + one email instead of many |
| `SYSTEM` | Test notification, important app messages | the person | push, email, in-app |

Every notification is stored in-app (when in-app is on), so it shows in Alerts with an unread badge.

## Moving parts

```
 ┌──────────────── worker process (always on) ───────────────────┐
 │  every 5 s (workOnce):                                         │
 │   1. plan reminders ──► for each workspace:                    │
 │        local time ≥ reminderHour and not yet run today?        │
 │        └─► claim WorkspaceReminderRun(ws, localDate) (uniq)     │
 │            └─► plan → recipients → insert Notification rows    │
 │                (unique dedupeKey) → enqueue delivery jobs      │
 │   2. once per 15-minute slot: check push receipts, prune jobs  │
 │   3. run due jobs:                                             │
 │        notify.push  ──► Expo push (chunks, tickets)            │
 │        notify.email ──► Resend                                 │
 └────────────────────────────────────────────────────────────────┘
```

* **Job queue** (`jobs/queue.ts`): a `Job` table in the same database (SQLite; Postgres when built
  for it), no Redis — pg-boss needs Postgres, so this small queue gives the same guarantees on SQLite. Workers claim a job with a conditional update (`status = PENDING → RUNNING`),
  so two workers can never run the same job. Failures retry with exponential backoff
  (30 s × 2ⁿ, up to 5 attempts). Jobs stuck in RUNNING for 10 minutes (crashed worker) are released.
* **Scheduler** (`notifications/scheduler.ts`): the brief's "every 15 minutes" cron. Planning is cheap and
  exactly-once per workspace-day (the `WorkspaceReminderRun` claim), so workers simply attempt it every cycle;
  receipt checks and pruning run once per 15-minute slot. Reminders therefore go out within seconds of
  the workspace's reminder hour.
* **Worker process** (`src/worker.ts`, `npm run worker`): can run as its own service or inside the API
  process (`RUN_WORKER_IN_API=true`). Several instances can run at once safely.

## Planning a day's reminders

For each workspace, on each tick:

1. Compute local time in the workspace's timezone. Before `reminderHour` → nothing to do.
2. **Claim the day**: insert `WorkspaceReminderRun(workspaceId, localDate)`. The unique constraint means
   only one worker ever processes a workspace's day; everyone else skips.
3. `since` = the previous run's local date (or yesterday for a brand-new workspace).
4. For every **ACTIVE** subscription whose current cycle isn't fully paid:
   `mostRecentMissedReminder(nextDueDate, reminderOffsets, since, today)`.
   - Normal day: `since` = yesterday, so this is "the reminder due today", if any.
   - After downtime: `since` is days ago, so it returns only the **latest** missed reminder
     (e.g. "due in 2 days" rather than the 7-day and 3-day ones). The message is phrased from *today's*
     point of view.
   - Offsets come from the subscription (defaults `30, 14, 7, 3, 1, 0, −1, −3, −7`). After the last
     after-due offset, reminders continue **weekly** (−14, −21, …) until paid or archived.
   - Trials (`TRIAL_OFFSETS` 3, 1 before `trialEndsOn`) and auto-renew notices (`AUTO_RENEW_OFFSETS` 7
     before `nextDueDate`) are planned the same way, so they get catch-up for free.
5. **Recipients**: every workspace member — ADMIN, FINANCE and VIEWER — minus anyone who muted the
   subscription (channels they turned off are skipped per person). Auto-renew notices go to ADMIN and
   FINANCE only. **Snoozes**: a person with an active snooze for that cycle gets nothing about it until the
   snooze ends; on the day it ends they get one reminder (unless a scheduled one goes out that day anyway).
7. After reminders, the same run sends the **weekly digest** (if a Monday fell in the window), the
   **monthly summary** (if a 1st did) and checks **budgets** (`summaries.ts`, `modules/budgets`).
6. Group by person. For each person:
   * **In-app**: one `IN_APP` notification per reminder (always).
   * If **digest is on and they have more than 3 reminders** in this run → one grouped push
     ("🔔 4 subscriptions need attention this week") and one digest email listing them.
   * Otherwise, per reminder:
     * **Push** if push is enabled and they have an active device.
     * **Email** if email is enabled and either they have no active push device (fallback) or it's a
       key moment — 7 days before, the due date, or the first overdue reminder.

## No duplicates, ever

Every notification row has a deterministic, unique `dedupeKey`:

```
{workspaceId}:{subscriptionId}:{type}:{cycleDueDate}:{offsetDays}:{userId}:{channel}

reminders/trials/auto-renew: ws:sub:REMINDER:2026-11-20:3:user:PUSH
digest of busy days:         ws:-:DIGEST:2026-11-02:-:user:EMAIL
weekly / monthly:            ws:-:WEEKLY_DIGEST:2026-11-02:-:user:IN_APP · ws:-:MONTHLY_SUMMARY:2026-12:-:user:PUSH
events:                      ws:sub:PAYMENT_RECORDED:2026-11-20:payment-{id}:user:PUSH
budget:                      ws:-:BUDGET_ALERT:-:budget-{id}-{month}-{threshold}:user:IN_APP
```

Always seven parts (`-` for "not applicable"); a test checks it.

**Insert, then send.** A delivery job is only enqueued after the row is inserted; if the insert hits the
unique constraint, that message already exists and is skipped. Delivery jobs carry the notification id
and are themselves idempotent (a row already `SENT`/`DELIVERED` is never re-sent). This holds across
restarts, retries and concurrent workers — the year-long simulation runs two schedulers at once to prove it.

## Stopping immediately

A delivery job re-checks, right before sending, that the subscription is still ACTIVE, the cycle is still
unpaid, the recipient hasn't muted or **snoozed** it or disabled the channel (and, for trial and auto-renew
notices, that the trial / auto-renew is still on). If not, the notification is marked
`FAILED` with the reason (`cancelled: paid`, `cancelled: muted`, …) and nothing is sent. That covers
reminders waiting out quiet hours or a retry backoff.

## Quiet hours

Workspaces can set quiet hours (e.g. 22:00–07:00 local). Anything that would go out inside the window
gets `sendAfter` = the end of the window and its job's `runAt` is set to that instant. In-app entries are
created immediately (they make no noise).

## Delivery

**Push** (`notifications/push.ts`, `expo-server-sdk`):

* Messages are built per active device token and sent in Expo's recommended chunks.
* Android channels: `reminders` (default), `overdue` (high importance, distinct vibration), `digest`
  (low) and `team` (low) — the app creates them on startup; the server picks one per type.
* Reminder, due-today and overdue pushes carry the category `subscription-reminder` → **Mark as paid**,
  **Snooze**, **Open** buttons on the phone.
* `badge` = the user's unread in-app count, so the app icon shows it.
* Payload: `url`, `subscriptionId`, `cycleDueDate`, `type`, `notificationId` and `dedupeKey` (without the
  channel) — the app uses the last one to cancel its local backup for the same event.
* **Tickets** are stored on the notification. Errors: `DeviceNotRegistered` deactivates that token;
  network/5xx/429 throw so the queue retries with backoff (max 5).
* **Receipts** are fetched by `push.receipts` ≈15 minutes later: `ok` → `DELIVERED`;
  `DeviceNotRegistered` → token deactivated; other errors → the push is retried (until 5 attempts).

**Email** (`emails/reminder.ts`, Resend): branded, mobile-friendly HTML with the DueOra logo, company,
subscription, USD amount, due date, a status badge and an "Open in DueOra" button (deep link). Every email
footer has a **Notification preferences** link and a signed one-click **Unsubscribe** link
(`/api/v1/public/unsubscribe?token=…`, HMAC with the server secret; turns email off for that workspace).
Network/429/5xx errors retry; other errors fail permanently and are logged on the notification.

**Retries**: exponential backoff, at most 5 attempts per notification (counted on the row, so receipt-driven
resends can't loop). **Email fallback**: a push for someone with no active device becomes an email.

**Local backup reminders** (`notifications/backup.ts`, `GET /notifications/backup`): the due-day and overdue
events of the next 14 days for the caller, at the reminder hour (after quiet hours), with the same key as
the server notification. Delivered, paid, muted and snoozed events are left out. The app replaces all its
scheduled backups with this list after every sync (start, workspace switch, returning to the app) and
cancels a backup as soon as the matching push arrives — so critical reminders show even if the phone was
offline when the push was sent, without doubling up.

## Message copy

Short, specific, human and always in USD — the subscription is labelled "Company · Name":

| When | Example |
|---|---|
| Before | ⏰ {Company} · {Subscription} is due in {n} days — {amount} on {weekday, date}. |
| Tomorrow | ⏰ {Company} · {Subscription} is due tomorrow — {amount} on {weekday, date}. |
| Due today | 📅 Today: {Company} · {Subscription} — {amount}. |
| Overdue | ⚠️ {Company} · {Subscription} is {n} days overdue — {amount}. Tap to record the payment. |
| Payment recorded | ✅ {amount} recorded for {Company} · {Subscription}. Next due: {date}. |
| Trial ending | 🎁 Your free trial of {Subscription} ends in {n} days — cancel or keep it? |
| Auto-renew | 🔁 {Company} · {Subscription} will renew automatically on {date} for {amount}. |
| Price change | 📈 {Company} · {Subscription} went from {old} to {new}. |
| Budget | 📊 You've used {pct}% of your {Category} budget this month. |
| Weekly digest | 🗓️ Your week ahead — {n} subscriptions due this week — {total} in total. {AI line} |
| Monthly summary | 📈 {Month} in review — You paid {amount} in {Month}. This month: {n} subscriptions, {total}. |
| Team | 🎉 {Name} accepted your invite as {Role}. · 👥 {Name} is now {Role}. |
| Busy day | 🔔 {n} subscriptions need attention this week |

The amount shown is what's still owed on the cycle (after partial payments). Payment notices don't name who
recorded the payment (no ownership in the UI). These examples are copy specs, not data — the app ships none.

## Mobile

* Permission is requested **after the first subscription is created**, on an explanation screen
  ("Never miss a due date"), not on first launch. If it was denied, Alerts shows a gentle banner with
  **Enable notifications** (opens the phone's settings).
* The Expo push token is registered on login and app start (`POST /devices`) and unregistered on logout
  (and on "Log out from all devices").
* Android channels `reminders`, `overdue`, `digest`, `team` and the action category are created at startup.
* Tapping a notification deep-links to the right screen (subscription, calendar, reports, budgets, team).
  **Mark as paid** opens the subscription with the Record payment sheet; **Snooze** opens the snooze choices
  (tomorrow, in 3 days, next week). Foreground notifications show an in-app toast.
* The app icon badge shows the unread count. Alerts groups Today / This week / Earlier; swipe left to mark read.
* Settings → Notifications: push / email / in-app / busy-day grouping, weekly digest, monthly summary,
  budget alerts, team activity, reminder hour, quiet hours, default offsets, and **Send test notification**
  (one push, one email and one in-app alert). Mute and snooze live on the subscription detail.
* Push on Android requires a development or production build (not Expo Go) and FCM credentials —
  see `docs/DEPLOYMENT.md`.

## Testing

* `schedule.test.ts` — the pure engine (offsets, weekly follow-ups, catch-up), 100% coverage.
* `queue.test.ts` — claiming, retries with backoff, stale-lock recovery, singleton keys.
* `notifications.test.ts` — the daily run, recipients, quiet hours, retries, receipts, catch-up, digests, payment notices, inbox, preferences, mute, devices, test push.
* `subscriptionKeys.security.test.ts` — keys never appear in notifications, push payloads, emails or logs.
* **`notifications.year.test.ts`** — a full year for three fictional organisations in Auckland, New York and
  London: every reminder on the right local day for every member, a due-today and 7-day reminder for all 12
  cycles, no overdue after paying, 1/3/7-then-weekly overdue until archived and nothing after, globally
  unique 7-part dedupe keys, and workspace isolation.
* **`notifications.extras.test.ts`** — five weeks in São Paulo: trial-ending (3 and 1 days), auto-renew to
  managers only, snooze (skip while active, one reminder when it ends), stop after payment, one budget alert
  per manager (and 79.98% doesn't count as 80%), weekly digests on every Monday for opted-in people (push +
  email), the monthly summary on the 1st, team notices, local backup schedule + DST conversion, and the
  three-channel test notification.
* **`reminders.simulation.test.ts`** — a full year (2 Nov 2026 → 1 Nov 2027) with a fake clock ticking
  every 15 minutes over a test-only fixture workspace (isolated test database). It asserts the exact reminders: correct days and local hour,
  correct recipients, no duplicates (two schedulers run concurrently), reminders stop after payment and
  when muted, catch-up after a simulated outage sends one message per subscription, digests kick in, and
  timezone changes are respected.

## How to test on your phone

1. Install the preview APK (see `docs/INSTALL.md`), sign in, and add your first subscription — DueOra asks
   for notification permission right after. Tap **Allow**.
2. Settings → Notifications → **Send test notification**. Within a few seconds you get a push ("🔔 Test from
   DueOra"), an email, and a new entry in Alerts (bell on Home).
3. To see a real reminder, add a subscription due **tomorrow** with the "1 day" reminder on, and set the
   workspace's daily reminder time to the next hour (Settings → Notifications → Daily reminder time). At
   that hour you'll get "⏰ … is due tomorrow". Long-press it (or expand it) to see **Mark as paid**,
   **Snooze** and **Open**.
4. Turn on airplane mode before a due date: the local backup still shows the due-day reminder at the
   reminder hour.
