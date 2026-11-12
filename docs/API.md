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
`NOT_FOUND` (404), `CONFLICT` (409), `HAS_HISTORY` (409), `HAS_BILLS` (409), `LAST_ADMIN` (409), `INVITE_INVALID` (410),
`TOO_MANY_REQUESTS` (429), `INTERNAL_ERROR` (500). Write bodies are strict: unknown fields are rejected (400).

**Roles** (`backend/src/domain/permissions.ts`):

| Role | Can |
|---|---|
| `ADMIN` | Everything, incl. members, invites and workspace settings |
| `FINANCE` | Manage bills, payments, categories and reports; reveal account references. Not members, not companies. |
| `VIEWER` | Read-only (incl. reports). Receives reminders. Sees account references masked only. |

**Pagination** (bills and payment history): `page` (from 1) and `limit` (default **10**, max 50).
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
| POST | `/auth/logout-all` 🔒 | — | 204; revokes every session and deactivates push tokens |
| POST | `/auth/verify-email/request` 🔒 | — | 202; emails a 6-digit code. Optional — never blocks sign-up (D26) |
| POST | `/auth/verify-email` 🔒 | `{ code }` | Updated user (`emailVerified: true`) |

## Me — `/me` 🔒

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/me` | — | `{ id, name, email, emailVerified, locale, workspaces: [{ id, name, type, timezone, role }] }` |
| PATCH | `/me` | `{ name?, locale? (en\|fr\|rw) }` | Updated user |
| DELETE | `/me` | `{ password, confirm: "DELETE" }` | `{ deletedWorkspaces, leftWorkspaces }` — see DECISIONS D30 |
| POST | `/me/password` | `{ currentPassword, newPassword }` | 204; signs out all sessions |

## Workspaces — `/workspaces` 🔒

| Method | Path | Role | Body / notes |
|---|---|---|---|
| GET | `/workspaces` | any | My workspaces |
| POST | `/workspaces` | any | `{ name, type: COMPANY\|PERSONAL, timezone (IANA — the app sends the phone's; default UTC), firstCompanyName? }` → creator becomes ADMIN; a first company is created (named `firstCompanyName`, else the workspace name, or "Personal") |
| POST | `/workspaces/accept-invite` | any | `{ token }` — the signed-in user's email must match the invite |
| GET | `/workspaces/current` | member | `{ id, name, type, timezone, reminderHour, quietHoursStart, quietHoursEnd, defaultReminderOffsets, memberCount, companyCount, billCount, myRole, myAccess: { allCompanies, companies: [{ companyId, role }] } }` |
| PATCH | `/workspaces/current` | ADMIN | `{ name?, type?, timezone?, reminderHour (0–23)?, quietHoursStart?, quietHoursEnd? (minutes after midnight, both or neither), defaultReminderOffsets? (int days, negative = after due), aiEnabled? }` |
| GET | `/workspaces/current/export?format=json\|xlsx` | ADMIN, FINANCE | Everything in the workspace as a download. Account references only masked. |
| DELETE | `/workspaces/current` | ADMIN | `{ confirmName }` must equal the workspace name. Permanent. |
| GET | `/workspaces/current/members` | member | `[{ id, userId, name, email, role, allCompanies, companies: [{ companyId, role }], joinedAt }]` |
| PATCH | `/workspaces/current/members/:membershipId` | ADMIN | `{ role, allCompanies?, companies? }` (see **Company access**); the last admin can't be demoted (409 `LAST_ADMIN`) |
| DELETE | `/workspaces/current/members/:membershipId` | ADMIN (or yourself, to leave) | |
| GET | `/workspaces/current/invites` | ADMIN | Pending invites |
| POST | `/workspaces/current/invites` | ADMIN | `{ email, role (default VIEWER), allCompanies?, companies? }` — emails a link `dueora://invite?token=…` (valid 7 days) |
| DELETE | `/workspaces/current/invites/:id` | ADMIN | Revoke |

## Public — `/public` (no auth)

| Method | Path | Notes |
|---|---|---|
| GET | `/public/invites/preview?token=` | `{ workspace: { name }, invitedBy, email, role, expiresAt }`; 410 if invalid/expired |
| GET · POST | `/public/unsubscribe?token=` | Signed one-click link from every email footer; turns email off for that workspace. HTML page; 400 for a bad token. |

## Companies & categories 🔒 (workspace)

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/companies?includeArchived=true` | member | Only the companies the caller can see: `[{ id, name, shortName, color, description, reminderOffsets, reminderHour, monthlyBudgetCents, archived, archivedAt, billCount, myRole, createdAt }]` (archived hidden unless asked; `shortName` falls back to the initials) |
| GET | `/companies/:id` | member with access | The same fields + `members: [{ membershipId, userId, name, email, role, allCompanies }]` (who can see it) |
| POST | `/companies` | ADMIN | `{ name, color?, shortName?, description?, reminderOffsets?, reminderHour?, monthlyBudgetCents? }` — names are unique per workspace (409) |
| PATCH | `/companies/:id` | ADMIN | Any of the fields above (null clears an optional one) |
| POST | `/companies/:id/archive` | ADMIN | Hidden from pickers and the switcher; bills and history kept |
| POST | `/companies/:id/unarchive` | ADMIN | |
| DELETE | `/companies/:id` | ADMIN | 204 — only a company **without bills** (409 `HAS_BILLS` otherwise: archive it); a workspace keeps at least one company |

### Company access

An ADMIN sees every company. Any other member has either **all companies** (current and future,
with their membership role) or a **chosen list**, each with its own role (`FINANCE` or `VIEWER`):

```json
{ "role": "FINANCE", "allCompanies": false, "companies": [{ "companyId": "…", "role": "FINANCE" }, { "companyId": "…", "role": "VIEWER" }] }
```

With a list, at least one company is required (400) and the membership role becomes the strongest
company role. Everything follows it: lists, details, dashboard, calendar, reports and exports,
history and search, AI tools, import (rows for other companies are errors; only admins create
companies) and notifications (reminders and bill events go only to members who can see that bill's
company). A company outside the caller's access is a 404, so ids can't be probed. Workspace and
category budgets and the full data export add up every company, so they need "all companies"
(`GET /budgets` returns `[]` otherwise).

### Categories (per company) and custom fields

Categories belong to one company, with one level of sub-categories. "Manage" = ADMIN or FINANCE **in that company**.
Nothing is seeded: `POST /companies` takes `categoryStart` (`{ mode: 'empty' }` default · `{ mode: 'suggestions', names?, withSubcategories? }` · `{ mode: 'copy', fromCompanyId }`); a new workspace's first company starts with the suggestions (`POST /workspaces` takes `categoryStart` too).

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/categories?companyId=&includeArchived=true` | member | Visible companies' categories (one company with `companyId`): `[{ id, companyId, parentId, parent, name, icon, color, description, sortOrder, defaults: { frequencyUnit, frequencyInterval, amountType, reminderOffsets, paymentMethod }, archived, billCount }]` |
| GET | `/categories/suggestions` | member | The list in `backend/src/config/categorySuggestions.ts` (`name, icon, color, children`) |
| POST | `/categories` | manage | `{ companyId, name, icon?, color?, parentId?, description?, subcategories?: string[], defaultFrequencyUnit?, defaultFrequencyInterval?, defaultAmountType?, defaultReminderOffsets?, defaultPaymentMethod? }` — names unique per company (409); a sub-category can't have children (400) |
| PATCH | `/categories/:id` | manage | Any field above except `companyId`/`subcategories` |
| POST | `/categories/reorder` | manage | `{ companyId, ids }` — one level at a time |
| POST | `/categories/:id/archive` · `/unarchive` | manage | Archiving a parent archives its sub-categories (restoring brings them back) |
| POST | `/categories/:id/merge` | manage | `{ intoId }` (same company): bills, sub-categories and budget move, then it is deleted |
| DELETE | `/categories/:id?moveToId=` | manage | 204. With bills it needs `moveToId` (409 `CATEGORY_IN_USE` otherwise); sub-categories become top level |
| GET | `/custom-fields?companyId=` | member | `[{ id, companyId, name, type: TEXT\|NUMBER\|DATE\|DROPDOWN, options, categoryIds (null = all bills), required, sortOrder }]` |
| POST | `/custom-fields?companyId=` | manage | `{ name, type, options? (DROPDOWN: ≥ 2), categoryIds?, required? }` — at most 10 per company (409 `LIMIT_REACHED`) |
| PATCH · DELETE | `/custom-fields/:id` | manage | Deleting leaves old values on bills; they are no longer shown or exported |

Bills carry `customValues: { [fieldId]: value }` — checked against the company's fields (types, dropdown options, required ones for the bill's category; unknown keys dropped).

## Bills — `/bills` 🔒 (workspace)

Everything you pay is a bill. It belongs to one **company** and one **category**. Its current cycle
ends on `nextDueDate`. Every response includes the computed `paymentStatus` for "today" in the workspace
timezone: `UPCOMING` · `DUE_SOON` (≤ 7 days) · `DUE_TODAY` · `OVERDUE` · `PARTIALLY_PAID` · `PAID` · `ARCHIVED`,
plus `daysUntilDue`, `paidCents`, `remainingCents`, `cycleLengthDays` and `frequencyLabel` ("Quarterly").

The **account reference** (license key, account number, customer ID…) is always returned masked:
`accountReference: { hasKey: true, last4: "4F7A", masked: "••••••4F7A" }` or `null`.

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/bills` | member | Query: `page`, `limit` (default 10), `sort`, `q`, `status`, `companyId`, `categoryId`, `frequency`, `dueFrom`, `dueTo` (see below) → `{ items, page, limit, total, hasMore }` |
| POST | `/bills` | ADMIN, FINANCE | Body below |
| GET | `/bills/:id` | member | Adds `muted` (for you), `reminders` (current cycle plan with `sent` flags), `history` (latest 10 payments) and `historyTotal` |
| GET | `/bills/:id/reference` | ADMIN, FINANCE | `{ value }` — the plain key (`Cache-Control: no-store`); every reveal is audit-logged. VIEWER → 403. |
| PATCH | `/bills/:id` | ADMIN, FINANCE | Any create field. `accountReference: null` removes the key. A changed start date/frequency re-derives `nextDueDate` while no payment exists; an explicit `nextDueDate` re-anchors the schedule. |
| POST | `/bills/:id/archive` · `/unarchive` | ADMIN, FINANCE | Archived bills stop reminders and leave the default list |
| DELETE | `/bills/:id` | ADMIN, FINANCE | 409 `HAS_HISTORY` if payments exist — archive instead |

List query:

| Param | Values |
|---|---|
| `sort` | `due_asc` (default — soonest first, so overdue lead) · `due_desc` · `amount_desc` · `amount_asc` · `name_asc` · `recent` |
| `q` | Case-insensitive search over name, provider, company, category and notes, **plus exact account-reference match** (ignoring case, spaces and dashes; never partial) |
| `status` | Comma list, e.g. `OVERDUE,DUE_SOON`; `ARCHIVED` for archived |
| `companyId`, `categoryId` | Comma lists of ids |
| `frequency` | Comma list of `WEEK`, `MONTH`, `YEAR`, `ONCE` |
| `dueFrom`, `dueTo` | Next due date range (inclusive) |

Create body:

```json
{
  "name": "Hosting", "companyId": "…", "categoryId": "…",
  "provider": "Hosting provider", "description": null,
  "accountReference": "LIC-0000-0000",
  "amountCents": 152300,
  "frequencyUnit": "YEAR", "frequencyInterval": 1,
  "startDate": "2026-11-03", "nextDueDate": "2027-11-03", "anchorDay": 3,
  "reminderOffsets": [30, 14, 7, 3, 1, 0, -1, -3, -7],
  "autoRenew": false, "isTrial": false, "trialEndsOn": null,
  "defaultPaymentMethod": "BANK_TRANSFER"
}
```

`isTrial: true` requires `trialEndsOn`. Changing `amountCents` records a PriceChange (shown as
`priceHistory` on the detail) and notifies the other ADMIN/FINANCE members. Recording a payment without
`method` uses `defaultPaymentMethod` (else OTHER). `POST /bills/:id/snooze { days | until }` and
`DELETE /bills/:id/snooze` pause the caller's reminders for the current cycle (any role); the detail
returns `snoozedUntil`.

Only `name`, `companyId`, `categoryId`, `amountCents` and `frequencyUnit` are required. `startDate` defaults
to today (workspace timezone). `nextDueDate` defaults to the **first due date on or after today**, counting
whole cycles from `startDate` (`calculateNextDueDate`). `anchorDay` defaults to that day of the month;
`reminderOffsets` to the workspace defaults.

Frequencies: weekly (`WEEK`,1), every 2 weeks (`WEEK`,2), monthly (`MONTH`,1), every 2 months (`MONTH`,2),
quarterly (`MONTH`,3), every 6 months (`MONTH`,6), yearly (`YEAR`,1), custom (any unit × N), one-time (`ONCE`).
Month-end anchors are kept: anchor 31 → 31 Jan, 28/29 Feb, 31 Mar, 30 Apr …

### Cycles and variable amounts

Bills have `amountType: FIXED | VARIABLE` (for VARIABLE, `amountCents` is the estimate). Each cycle may store its own amount
(`BillCycle`): set for a variable bill's real bill, and written when a cycle closes, so past cycles keep their amounts.
Bill responses add `cycleAmountCents`, `isEstimate`, `daysOverdue`, `outstandingCents`, `overdueCents`, `overdueCycles`,
`missedCycles` — a recurring bill unpaid for several cycles owes **every** missed cycle (payments go to the oldest).

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/bills/:id/cycles?from=&to=` | member | Default a year back to a year ahead: `cycles: [{ dueDate, kind: closed\|current\|missed\|future, expectedCents, isEstimate, paidCents, remainingCents, state, daysOverdue }]` |
| PUT | `/bills/:id/cycles/:dueDate` | ADMIN, FINANCE (company) | `{ amountCents }` — the open cycle or a later one (400 for closed cycles or dates off the schedule). Returns the bill |
| POST | `/bills/:id/payments` | | also takes `paidInFull: true` — closes the cycle at the paid amount (a variable bill's real bill, a discount) |

`GET /bills` also filters by `amountType` and `customField` + `customValue` (text matches partially); `q` searches custom values.

## Budgets — `/budgets` 🔒 (workspace)

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/budgets` | member | `[{ id, categoryId, category, monthlyLimitCents, alertAtPercent, month, paidCents, dueCents, spentCents, percent, state: OK\|WARNING\|OVER }]` — spent = paid this month + still due this month |
| PUT | `/budgets` | ADMIN, FINANCE | `{ categoryId: null (whole workspace) \| id, monthlyLimitCents, alertAtPercent? (10–100, default 80) }` — creates or replaces; checks alerts at once |
| DELETE | `/budgets/:id` | ADMIN, FINANCE | |

## Import — `/import` 🔒 (workspace, ADMIN/FINANCE)

| Method | Path | Notes |
|---|---|---|
| GET | `/import/template?format=xlsx\|csv` | Header-only template |
| POST | `/import/preview` | `{ fileName, contentBase64 (≤ 2 MB), mapping? { company, category, name, provider, amount, frequency, nextDueDate: columnIndex } }` → `{ headers, mapping (suggested when omitted), missingColumns, total, valid, rows: [{ line, values, parsed, errors, warnings }] }`. Writes nothing. |
| POST | `/import/commit` | Same body → 201 `{ imported, skipped, createdCompanies, createdCategories }` |

## Feedback — `/feedback` 🔒

| POST | `/feedback` | `{ message, appVersion?, platform? }` → 201. Rate limited 10/h. |
|---|---|---|

## Payments 🔒 (workspace)

A payment always belongs to the bill's **current cycle** (`cycleDueDate`). When the cycle's total
reaches the amount due, the cycle closes and `nextDueDate` moves forward one cycle automatically (one-time
bills become `COMPLETED`). Partial payments leave the cycle open (`PARTIALLY_PAID`). History is never
lost when a new cycle begins.

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/bills/:id/payments` | ADMIN, FINANCE | `{ method: MOBILE_MONEY\|BANK_TRANSFER\|CARD\|CASH\|OTHER, amountCents? (default: remaining), paidOn? (default: today; not in the future), reference?, notes? }` → `{ payment, bill, cycleCompleted, cycleReopened }` |
| GET | `/payments` | member | History. Query: `page`, `limit` (default 10), `sort` (`paid_desc` default · `paid_asc` · `amount_desc` · `amount_asc`), `q` (bill, provider, company, category or reference), `from`, `to` (date paid), `companyId`, `categoryId` (comma lists), `billId`, `method` → `{ items, page, limit, total, hasMore, totalCents }` |
| GET | `/payments/:id` | member | |
| PATCH | `/payments/:id` | ADMIN, FINANCE | `{ amountCents?, paidOn?, method?, reference?, notes? }` — recalculates the cycle (may close or reopen it); audit-logged with before/after |
| DELETE | `/payments/:id` | ADMIN, FINANCE | May reopen the cycle it had closed; audit-logged → `{ bill, cycleReopened }` |

There are no attachments, receipts or file uploads.

## Notifications 🔒

Design: `docs/NOTIFICATIONS.md`. Everything below except `/devices` is per workspace (`X-Workspace-Id`).

| Method | Path | Notes |
|---|---|---|
| GET | `/notifications` | The Alerts inbox (in-app channel), newest first. Query: `unreadOnly=true`, `page`, `pageSize`. → `{ items: [{ id, type, title, body, data, billId, cycleDueDate, offsetDays, readAt, createdAt }], total, unreadCount }` |
| POST | `/notifications/:id/read` | 204 |
| POST | `/notifications/read-all` | `{ updated }` |
| GET · PATCH | `/notifications/preferences` | `{ pushEnabled, emailEnabled, inAppEnabled, digestEnabled, weeklySummary, monthlySummary, budgetAlerts, teamActivity, mutedBillIds, companies: { [companyId]: { reminders?, events?, summaries? } } }` — `companies` replaces the map; only visible companies are kept; false = off |
| POST | `/bills/:id/mute` · `/unmute` | Stop/resume reminders for one bill (for you only; any role) |
| POST | `/notifications/test` | Sends "🔔 Test from DueOra" now (push if you have a device, else email). Rate-limited. → `{ queued, channel, devices }` |
| POST | `/devices` | `{ expoPushToken, platform: ios\|android\|web }` — register/refresh this phone |
| DELETE | `/devices` | `{ expoPushToken }` — on logout |

Notification `type`s: `REMINDER` · `DUE_TODAY` · `OVERDUE` · `PAYMENT_RECORDED` · `DIGEST` · `SYSTEM`.
Push payloads carry `data.url` (`dueora://bills/:id`), `billId`, `notificationId`, `type`.
Notifications never contain account references.

## Dashboard, calendar, reports 🔒 (workspace)

Money blocks are `{ amountCents, count }` (USD).

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/views/:view?companyId=&days=&month=` | member | Tracking views from the cycle engine: `upcoming` (`days` 7/30/60/90, default 30), `this-month`, `next-month`, `outstanding`, `overdue` (+ `ageing` 0–30/31–60/61–90/90+), `paid` (`month` YYYY-MM), `obligations` (upcoming with `nextReminder`). `{ view, from, to, today, totals: { count, expectedCents, paidCents, remainingCents, estimatedCents }, byCompany, items: [cycle + bill + nextReminder] }` |
| GET | `/dashboard?companyId=` | member | Optional `companyId` (the company switcher; default = every company the caller can see). `today`, `localHour`, `summary` (`overdue` — every missed cycle counts, `dueThisWeek`, `dueThisMonth`, `outstanding`, `paidThisMonth` + `changePercent`), `thisMonth` (total/paid/left), `lastMonth` (due, paid on time/late, unpaid), `cashflow` (6 past months paid + this month + 3 projected), `companies` (this month per company), `segments` (Bills-tab counts), `needsAttention` (top 5, most urgent first) + `needsAttentionCount`, `next30Days` (sorted by due date), `spending` (12 months), `byCategory` and `byCompany` (last 12 months, with `share` %), `counts` (`active`, `total`, `overdue`, `upcoming30`) |
| GET | `/calendar?from=&to=&companyId=` | member | ≤ 400 days. `events: [{ date, billId, name, company, categoryIcon, categoryColor, amountCents, status, kind: paid\|current\|future }]` |
| GET | `/reports?period=month\|year&year=&month=&companyId=` | member | `totals` (`committed`, `paid`, `outstanding`, `overdue`), `byCategory`, `byCompany`, `months`, `forecast` (next 12 months), `overdue`, `outstanding`, `payments`, `company`, and `analysis`: `due`, `timing` (paid on time / late, still unpaid), `paidInPeriodCents`, `previous` (period before + `changePercent`), `byMethod`, `variable` (estimate vs actual), `perCompany`, `ageing`, `upcoming` (30/60/90), `categories` (sub-categories rolled up), `cycles` (with custom fields) |
| GET | `/reports/export?format=pdf\|xlsx&period=…&companyId=` | member | File download named after the workspace and company. PDF: summary, payment report, per company, variable bills, ageing, coming up, tables. Excel: Summary (company, period, generated date), Due in period (custom fields as columns), one sheet per company for "All companies", Payment report, Payments, Outstanding, Forecast |
