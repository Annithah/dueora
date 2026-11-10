# DueOra API (v1)

Base URL: `https://<your-api-host>/api/v1` (local: `http://localhost:4000/api/v1`).
All bodies are JSON. Dates without time are `YYYY-MM-DD`. **Money is always US dollars as integer cents**
(`amountCents: 152300` = $1,523.00) — there are no currency fields anywhere.

## Conventions

| Header | Meaning |
|---|---|
| `Authorization: Bearer <accessToken>` | Required on every route except `/auth/*` (login/register/refresh/forgot/reset) and `/public/*`. Access tokens last 15 minutes. |
| `X-Workspace-Id: <workspaceId>` | Selects the workspace for workspace-scoped routes. Not a member → **404** (existence is never revealed). |
| `X-Request-Id` | Optional; echoed back. Every response carries one for support. |

**Errors** always look like:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Some fields are invalid", "details": [{ "path": "email", "message": "Enter a valid email address" }], "requestId": "…" } }
```

Common codes: `VALIDATION_ERROR` (400), `BAD_REQUEST` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403),
`NOT_FOUND` (404), `CONFLICT` (409), `HAS_HISTORY` (409), `LAST_ADMIN` (409), `INVITE_INVALID` (410),
`TOO_MANY_REQUESTS` (429), `INTERNAL_ERROR` (500). Write bodies are strict: unknown fields are rejected (400).

**Roles** (`backend/src/domain/permissions.ts`):

| Role | Can |
|---|---|
| `ADMIN` | Everything, incl. members, invites and workspace settings |
| `FINANCE` | Manage subscriptions, payments, companies, categories and reports; reveal subscription keys. Not members. |
| `VIEWER` | Read-only (incl. reports). Receives reminders. Sees subscription keys masked only. |

**Pagination** (subscriptions and payment history): `page` (from 1) and `limit` (default **10**, max 50).
Responses: `{ items, page, limit, total, hasMore }`.

## Health

| Method | Path | Notes |
|---|---|---|
| GET | `/health` (no `/api/v1` prefix) | `{ status, database, apiVersion, time }`; 503 when the DB is unreachable. |

## Auth — `/auth`

Rate-limited per IP + email (login 10/15 min, register 5/h, codes 10/15 min).

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/register` | `{ name, email, password (≥8) }` | 201 `{ accessToken, refreshToken, expiresIn, user }` — signed in straight away, no email verification |
| POST | `/auth/login` | `{ email, password }` | `{ accessToken, refreshToken, expiresIn, user }` |
| POST | `/auth/refresh` | `{ refreshToken }` | New pair. Each refresh token works once (stored hashed); reusing an old one revokes the whole session family. |
| POST | `/auth/logout` | `{ refreshToken }` | 204 |
| POST | `/auth/password/forgot` | `{ email }` | Always 202 (never reveals whether the account exists) |
| POST | `/auth/password/reset` | `{ email, code, newPassword }` | 204; signs out all sessions |

## Me — `/me` 🔒

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/me` | — | `{ id, name, email, emailVerified, workspaces: [{ id, name, type, timezone, role }] }` |
| PATCH | `/me` | `{ name }` | Updated user |
| POST | `/me/password` | `{ currentPassword, newPassword }` | 204; signs out all sessions |

## Workspaces — `/workspaces` 🔒

| Method | Path | Role | Body / notes |
|---|---|---|---|
| GET | `/workspaces` | any | My workspaces |
| POST | `/workspaces` | any | `{ name, type: COMPANY\|PERSONAL, timezone (IANA, default Africa/Kigali), firstCompanyName? }` → creator becomes ADMIN; a first company is created (named `firstCompanyName`, else the workspace name, or "Personal") |
| POST | `/workspaces/accept-invite` | any | `{ token }` — the signed-in user's email must match the invite |
| GET | `/workspaces/current` | member | `{ id, name, type, timezone, reminderHour, quietHoursStart, quietHoursEnd, defaultReminderOffsets, memberCount, companyCount, subscriptionCount, myRole }` |
| PATCH | `/workspaces/current` | ADMIN | `{ name?, type?, timezone?, reminderHour (0–23)?, quietHoursStart?, quietHoursEnd? (minutes after midnight, both or neither), defaultReminderOffsets? (int days, negative = after due) }` |
| DELETE | `/workspaces/current` | ADMIN | `{ confirmName }` must equal the workspace name. Permanent. |
| GET | `/workspaces/current/members` | member | `[{ id, userId, name, email, role, joinedAt }]` |
| PATCH | `/workspaces/current/members/:membershipId` | ADMIN | `{ role }`; the last admin can't be demoted (409 `LAST_ADMIN`) |
| DELETE | `/workspaces/current/members/:membershipId` | ADMIN (or yourself, to leave) | |
| GET | `/workspaces/current/invites` | ADMIN | Pending invites |
| POST | `/workspaces/current/invites` | ADMIN | `{ email, role (default VIEWER) }` — emails a link `dueora://invite?token=…` (valid 7 days) |
| DELETE | `/workspaces/current/invites/:id` | ADMIN | Revoke |

## Public — `/public` (no auth)

| Method | Path | Notes |
|---|---|---|
| GET | `/public/invites/preview?token=` | `{ workspace: { name }, invitedBy, email, role, expiresAt }`; 410 if invalid/expired |

## Companies & categories 🔒 (workspace)

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/companies?includeArchived=true` | member | `[{ id, name, color, archived, subscriptionCount }]` (archived hidden unless asked) |
| POST | `/companies` | ADMIN, FINANCE | `{ name, color? }` — names are unique per workspace (409) |
| PATCH | `/companies/:id` | ADMIN, FINANCE | `{ name?, color? }` |
| DELETE | `/companies/:id` | ADMIN, FINANCE | Deleted when unused → `{ deleted: true, archived: false }`; **archived** when it has subscriptions → `{ deleted: false, archived: true }` |
| POST | `/companies/:id/unarchive` | ADMIN, FINANCE | |
| GET | `/categories` | member | 9 built-in (`isDefault: true`) + this workspace's custom ones, with `subscriptionCount` |
| POST · PATCH /:id · DELETE /:id | `/categories` | ADMIN, FINANCE | `{ name, icon, color }`. Built-ins can't be changed; in-use categories can't be deleted (409). |

## Subscriptions — `/subscriptions` 🔒 (workspace)

Everything you pay is a subscription. It belongs to one **company** and one **category**. Its current cycle
ends on `nextDueDate`. Every response includes the computed `paymentStatus` for "today" in the workspace
timezone: `UPCOMING` · `DUE_SOON` (≤ 7 days) · `DUE_TODAY` · `OVERDUE` · `PARTIALLY_PAID` · `PAID` · `ARCHIVED`,
plus `daysUntilDue`, `paidCents`, `remainingCents`, `cycleLengthDays` and `frequencyLabel` ("Quarterly").

The **subscription key** (license key, account number, customer ID…) is always returned masked:
`subscriptionKey: { hasKey: true, last4: "4F7A", masked: "••••••4F7A" }` or `null`.

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/subscriptions` | member | Query: `page`, `limit` (default 10), `sort`, `q`, `status`, `companyId`, `categoryId`, `frequency`, `dueFrom`, `dueTo` (see below) → `{ items, page, limit, total, hasMore }` |
| POST | `/subscriptions` | ADMIN, FINANCE | Body below |
| GET | `/subscriptions/:id` | member | Adds `muted` (for you), `reminders` (current cycle plan with `sent` flags), `history` (latest 10 payments) and `historyTotal` |
| GET | `/subscriptions/:id/key` | ADMIN, FINANCE | `{ value }` — the plain key (`Cache-Control: no-store`); every reveal is audit-logged. VIEWER → 403. |
| PATCH | `/subscriptions/:id` | ADMIN, FINANCE | Any create field. `subscriptionKey: null` removes the key. A changed start date/frequency re-derives `nextDueDate` while no payment exists; an explicit `nextDueDate` re-anchors the schedule. |
| POST | `/subscriptions/:id/archive` · `/unarchive` | ADMIN, FINANCE | Archived subscriptions stop reminders and leave the default list |
| DELETE | `/subscriptions/:id` | ADMIN, FINANCE | 409 `HAS_HISTORY` if payments exist — archive instead |

List query:

| Param | Values |
|---|---|
| `sort` | `due_asc` (default — soonest first, so overdue lead) · `due_desc` · `amount_desc` · `amount_asc` · `name_asc` · `recent` |
| `q` | Case-insensitive search over name, provider, company, category and notes, **plus exact subscription-key match** (ignoring case, spaces and dashes; never partial) |
| `status` | Comma list, e.g. `OVERDUE,DUE_SOON`; `ARCHIVED` for archived |
| `companyId`, `categoryId` | Comma lists of ids |
| `frequency` | Comma list of `WEEK`, `MONTH`, `YEAR`, `ONCE` |
| `dueFrom`, `dueTo` | Next due date range (inclusive) |

Create body:

```json
{
  "name": "Hosting", "companyId": "…", "categoryId": "…",
  "provider": "Hosting provider", "description": null,
  "subscriptionKey": "LIC-0000-0000",
  "amountCents": 152300,
  "frequencyUnit": "YEAR", "frequencyInterval": 1,
  "startDate": "2026-11-03", "nextDueDate": "2027-11-03", "anchorDay": 3,
  "reminderOffsets": [30, 14, 7, 3, 1, 0, -1, -3, -7]
}
```

Only `name`, `companyId`, `categoryId`, `amountCents` and `frequencyUnit` are required. `startDate` defaults
to today (workspace timezone). `nextDueDate` defaults to the **first due date on or after today**, counting
whole cycles from `startDate` (`calculateNextDueDate`). `anchorDay` defaults to that day of the month;
`reminderOffsets` to the workspace defaults.

Frequencies: weekly (`WEEK`,1), every 2 weeks (`WEEK`,2), monthly (`MONTH`,1), every 2 months (`MONTH`,2),
quarterly (`MONTH`,3), every 6 months (`MONTH`,6), yearly (`YEAR`,1), custom (any unit × N), one-time (`ONCE`).
Month-end anchors are kept: anchor 31 → 31 Jan, 28/29 Feb, 31 Mar, 30 Apr …

## Payments 🔒 (workspace)

A payment always belongs to the subscription's **current cycle** (`cycleDueDate`). When the cycle's total
reaches the amount due, the cycle closes and `nextDueDate` moves forward one cycle automatically (one-time
subscriptions become `COMPLETED`). Partial payments leave the cycle open (`PARTIALLY_PAID`). History is never
lost when a new cycle begins.

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/subscriptions/:id/payments` | ADMIN, FINANCE | `{ method: MOBILE_MONEY\|BANK_TRANSFER\|CARD\|CASH\|OTHER, amountCents? (default: remaining), paidOn? (default: today; not in the future), reference?, notes? }` → `{ payment, subscription, cycleCompleted, cycleReopened }` |
| GET | `/payments` | member | History. Query: `page`, `limit` (default 10), `sort` (`paid_desc` default · `paid_asc` · `amount_desc` · `amount_asc`), `q` (subscription, provider, company, category or reference), `from`, `to` (date paid), `companyId`, `categoryId` (comma lists), `subscriptionId`, `method` → `{ items, page, limit, total, hasMore, totalCents }` |
| GET | `/payments/:id` | member | |
| PATCH | `/payments/:id` | ADMIN, FINANCE | `{ amountCents?, paidOn?, method?, reference?, notes? }` — recalculates the cycle (may close or reopen it); audit-logged with before/after |
| DELETE | `/payments/:id` | ADMIN, FINANCE | May reopen the cycle it had closed; audit-logged → `{ subscription, cycleReopened }` |

There are no attachments, receipts or file uploads.

## Notifications 🔒

Design: `docs/NOTIFICATIONS.md`. Everything below except `/devices` is per workspace (`X-Workspace-Id`).

| Method | Path | Notes |
|---|---|---|
| GET | `/notifications` | The Alerts inbox (in-app channel), newest first. Query: `unreadOnly=true`, `page`, `pageSize`. → `{ items: [{ id, type, title, body, data, subscriptionId, cycleDueDate, offsetDays, readAt, createdAt }], total, unreadCount }` |
| POST | `/notifications/:id/read` | 204 |
| POST | `/notifications/read-all` | `{ updated }` |
| GET · PATCH | `/notifications/preferences` | `{ pushEnabled, emailEnabled, digestEnabled, mutedSubscriptionIds }` |
| POST | `/subscriptions/:id/mute` · `/unmute` | Stop/resume reminders for one subscription (for you only; any role) |
| POST | `/notifications/test` | Sends "🔔 Test from DueOra" now (push if you have a device, else email). Rate-limited. → `{ queued, channel, devices }` |
| POST | `/devices` | `{ expoPushToken, platform: ios\|android\|web }` — register/refresh this phone |
| DELETE | `/devices` | `{ expoPushToken }` — on logout |

Notification `type`s: `REMINDER` · `DUE_TODAY` · `OVERDUE` · `PAYMENT_RECORDED` · `DIGEST` · `SYSTEM`.
Push payloads carry `data.url` (`dueora://subscriptions/:id`), `subscriptionId`, `notificationId`, `type`.
Notifications never contain subscription keys.

## Dashboard, calendar, reports 🔒 (workspace)

Money blocks are `{ amountCents, count }` (USD).

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/dashboard` | member | `today`, `localHour`, `summary` (`overdue`, `dueThisWeek`, `dueThisMonth`, `paidThisMonth` + `changePercent`), `needsAttention` (top 5, most urgent first) + `needsAttentionCount`, `next30Days` (sorted by due date), `spending` (12 months), `byCategory` and `byCompany` (last 12 months, with `share` %), `counts` (`active`, `total`, `overdue`, `upcoming30`) |
| GET | `/calendar?from=&to=` | member | ≤ 400 days. `events: [{ date, subscriptionId, name, company, categoryIcon, categoryColor, amountCents, status, kind: paid\|current\|future }]` |
| GET | `/reports?period=month\|year&year=&month=` | member | `totals` (`committed`, `paid`, `outstanding`, `overdue`), `byCategory`, `byCompany`, `months`, `forecast` (next 12 months), `overdue`, `outstanding`, `payments` |
| GET | `/reports/export?format=pdf\|xlsx&period=…` | member | File download. PDF: branded summary + tables. Excel: Summary, Payments, Outstanding, Forecast sheets with numeric USD amounts |
