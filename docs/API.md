# DueOra API (v1)

Base URL: `https://<your-api-host>/api/v1` (local: `http://localhost:4000/api/v1`).
All bodies are JSON unless noted. Dates without time are `YYYY-MM-DD`. Money is an integer
`amountMinor` in the currency's smallest unit plus an ISO 4217 `currency`.

## Conventions

| Header | Meaning |
|---|---|
| `Authorization: Bearer <accessToken>` | Required on every route except `/auth/*` (login/register/refresh/forgot/reset) and `/public/*`. Access tokens last 15 minutes. |
| `X-Org-Id: <workspaceId>` | Selects the workspace for workspace-scoped routes. Not a member → **404** (existence is never revealed). |
| `X-Request-Id` | Optional; echoed back. Every response carries one for support. |

**Errors** always look like:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Some fields are invalid", "details": [{ "path": "email", "message": "Enter a valid email address" }], "requestId": "…" } }
```

Common codes: `VALIDATION_ERROR` (400), `BAD_REQUEST` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403),
`NOT_FOUND` (404), `CONFLICT` (409), `INVITE_INVALID` (410), `FILE_TOO_LARGE` (413),
`TOO_MANY_REQUESTS` (429), `INTERNAL_ERROR` (500).

**Roles**: `ADMIN` · `FINANCE` · `DEPARTMENT` · `EMPLOYEE` — see `backend/src/domain/permissions.ts`.

## Health

| Method | Path | Notes |
|---|---|---|
| GET | `/health` (no `/api/v1` prefix) | `{ status, database, apiVersion, time }`; 503 when the DB is unreachable. |

## Auth — `/auth`

Rate-limited per IP + email (login 10/15 min, register 5/h, codes 10/15 min).

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/register` | `{ name, email, password (≥8) }` | 201 `{ accessToken, refreshToken, expiresIn, user }`; emails a 6-digit verification code |
| POST | `/auth/login` | `{ email, password }` | `{ accessToken, refreshToken, expiresIn, user }` |
| POST | `/auth/refresh` | `{ refreshToken }` | New pair. Each refresh token works once; reusing an old one revokes the whole session family. |
| POST | `/auth/logout` | `{ refreshToken }` | 204 |
| POST | `/auth/verify-email/request` 🔒 | — | 202 (max one code per minute) |
| POST | `/auth/verify-email` 🔒 | `{ code }` | Updated `user` |
| POST | `/auth/password/forgot` | `{ email }` | Always 202 (never reveals whether the account exists) |
| POST | `/auth/password/reset` | `{ email, code, newPassword }` | 204; signs out all sessions |

Codes expire after 15 minutes and lock after 5 wrong attempts.

## Me — `/me` 🔒

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/me` | — | `{ id, name, email, phone, avatarUrl, emailVerified, workspaces: [{ id, name, type, logoUrl, defaultCurrency, timezone, role, departmentId }] }` |
| PATCH | `/me` | `{ name?, phone? }` | Updated user |
| POST | `/me/password` | `{ currentPassword, newPassword }` | 204; signs out all sessions |

## Workspaces — `/workspaces` 🔒

| Method | Path | Role | Body / notes |
|---|---|---|---|
| GET | `/workspaces` | any | My workspaces |
| POST | `/workspaces` | any | `{ name, type: COMPANY\|PERSONAL, defaultCurrency, timezone }` → creator becomes ADMIN |
| POST | `/workspaces/accept-invite` | any | `{ token }` — the signed-in user's email must match the invite |
| GET | `/workspaces/current` | member | Workspace incl. departments, exchange rates, `myRole` |
| PATCH | `/workspaces/current` | ADMIN | `{ name?, type?, defaultCurrency?, timezone?, reminderHour (0–23)?, quietHoursStart?, quietHoursEnd? (minutes after midnight, both or neither), defaultReminderOffsets? (int days, negative = after due) }` |
| DELETE | `/workspaces/current` | ADMIN | `{ confirmName }` must equal the workspace name. Permanent. |
| POST | `/workspaces/current/logo` | ADMIN | multipart `file` (PNG/JPG/WebP, ≤ 5 MB, type checked by content) |
| DELETE | `/workspaces/current/logo` | ADMIN | |
| PUT | `/workspaces/current/exchange-rates/:currency` | ADMIN, FINANCE | `{ rate }` — 1 unit of `:currency` = `rate` units of the default currency |
| DELETE | `/workspaces/current/exchange-rates/:currency` | ADMIN, FINANCE | |
| GET | `/workspaces/current/departments` | member | |
| POST | `/workspaces/current/departments` | ADMIN | `{ name }` |
| PATCH / DELETE | `/workspaces/current/departments/:id` | ADMIN | Delete fails (409) while department officers belong to it |
| GET | `/workspaces/current/members` | member | |
| PATCH | `/workspaces/current/members/:membershipId` | ADMIN | `{ role?, departmentId? }`; DEPARTMENT needs a department; the last admin can't be demoted (409 `LAST_ADMIN`) |
| DELETE | `/workspaces/current/members/:membershipId` | ADMIN (or yourself, to leave) | Their assigned obligations become unassigned |
| GET | `/workspaces/current/invites` | ADMIN | Pending invites |
| POST | `/workspaces/current/invites` | ADMIN | `{ email, role, departmentId? }` — emails a link `dueora://invite?token=…` (valid 7 days) |
| DELETE | `/workspaces/current/invites/:id` | ADMIN | Revoke |

## Public — `/public` (no auth)

| Method | Path | Notes |
|---|---|---|
| GET | `/public/invites/preview?token=` | `{ organization: { name, logoUrl }, invitedBy, email, role, expiresAt }`; 410 if invalid/expired |
| GET | `/public/logos/:orgId` | Workspace logo image (used in emails and the app header) |

## Obligations — `/obligations` 🔒 (workspace)

An obligation is something you pay repeatedly (or once). Its **current cycle** ends on `nextDueDate`.
Every response includes the computed `paymentStatus` for "today" in the workspace's timezone:
`UPCOMING` · `DUE_SOON` (≤ 7 days) · `DUE_TODAY` · `OVERDUE` · `PARTIALLY_PAID` · `PAID` · `ARCHIVED`,
plus `daysUntilDue`, `paidMinor` and `remainingMinor` for the current cycle, `cycleLengthDays`,
`frequencyLabel` ("Quarterly"), and `icon` (the obligation's own icon, or its category's).

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/obligations` | member (EMPLOYEE: assigned only) | Query: `q`, `status` (comma list, e.g. `OVERDUE,DUE_SOON`; `ARCHIVED` for archived), `platformId`, `categoryId`, `departmentId`, `assignedToMe=true`, `page`, `pageSize` (≤ 200). Sorted by next due date. → `{ items, page, pageSize, total }` |
| POST | `/obligations` | ADMIN, FINANCE, DEPARTMENT (own department) | Body below. `nextDueDate` defaults to `startDate`; `anchorDay` defaults to its day; `reminderOffsets` to the workspace defaults. |
| GET | `/obligations/:id` | can view | Adds `reminders` (current cycle plan with `sent` flags, weekly follow-ups once overdue), `history` (latest 10 payments) and `attachments`. |
| PATCH | `/obligations/:id` | can manage | Any create field. Changing `nextDueDate` re-anchors unless `anchorDay` is sent. |
| POST | `/obligations/:id/archive` · `/unarchive` | can manage | Archived items stop reminders and leave the default list. |
| DELETE | `/obligations/:id` | ADMIN, FINANCE | 409 `HAS_HISTORY` if payments exist — archive instead. |

Create body:

```json
{
  "name": "Hosting", "provider": "AWS", "description": null, "icon": "cloud",
  "amountMinor": 152300, "currency": "USD",
  "frequencyUnit": "MONTH", "frequencyInterval": 3,
  "startDate": "2026-10-20", "nextDueDate": "2027-01-20", "anchorDay": 20,
  "reminderOffsets": [30, 14, 7, 3, 1, 0, -1, -3, -7],
  "platformId": "…", "categoryId": "…", "departmentId": null, "assigneeUserId": "…"
}
```

Frequencies: weekly (`WEEK`,1), every N weeks (`WEEK`,N), monthly (`MONTH`,1), quarterly (`MONTH`,3),
every 6 months (`MONTH`,6), yearly (`YEAR`,1), custom (any unit × N), one-time (`ONCE`).
Month-end anchors are kept: anchor 31 → 31 Jan, 28/29 Feb, 31 Mar, 30 Apr …

## Platforms & categories 🔒 (workspace)

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/platforms` | member | With `obligationCount` |
| POST · PATCH /:id · DELETE /:id | `/platforms` | ADMIN, FINANCE, DEPARTMENT | `{ name, color: "#RRGGBB" }`. Deleting keeps the obligations (ungrouped). |
| GET | `/categories` | member | 8 built-in (`isDefault: true`) + this workspace's custom ones |
| POST · PATCH /:id · DELETE /:id | `/categories` | ADMIN, FINANCE, DEPARTMENT | `{ name, icon, color }`. Built-ins can't be changed; in-use categories can't be deleted (409). |

_Payments, notifications, dashboard and reports are documented as they are built (Phases 5–7)._
