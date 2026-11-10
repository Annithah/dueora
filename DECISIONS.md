# Decisions

Decisions made during the build that the brief or requirements didn't settle. Newest at the bottom.

## D1 — SQLite for development and tests; Postgres in production (Phase 0)
**Context:** Docker isn't installed on the dev machine; the owner chose SQLite for local work.
**Decision:**
- Prisma runs with the SQLite provider locally and in tests. Production uses Postgres (Neon or the host's managed Postgres). The schema is kept portable, and a small script switches the datasource provider and driver adapter for production builds.
- `docker-compose.yml` (Postgres 16) is kept for optional production-parity testing once Docker is available.
- SQLite has no scalar lists, so `Obligation.reminderOffsets` and `NotificationPreference.mutedObligationIds` are stored as `Json` (validated with zod at the boundary).
**Consequence:** anything Postgres-specific (array operators, `ON CONFLICT` nuances, advisory locks) is avoided in application code.

## D2 — Database-backed job queue instead of pg-boss (Phase 0)
**Context:** pg-boss only runs on Postgres, which conflicts with D1.
**Decision:** a small job queue built on a Prisma `Job` table: atomic claim (`updateMany … where status = PENDING and runAt <= now`), retries with exponential backoff (max 5), and an in-process cron tick every 15 minutes. It works on both SQLite and Postgres and keeps the "no Redis" property. If we later go Postgres-only, the queue interface can be swapped for pg-boss without touching callers.

## D3 — Tooling versions (Phase 0)
- Expo SDK 58 (latest at time of build), React Native 0.88, React 19.3.
- TypeScript pinned to `~6.0` in both apps: `typescript-eslint` doesn't support TS ≥ 6.1 yet.
- Prisma pinned to stable `7.10.x` (npm's `latest` tag currently points at an 8.0 release candidate).
- npm workspaces are not used: Expo's Metro bundler is simplest with a self-contained `mobile/node_modules`. A root `package.json` provides convenience scripts (`npm run check`).
- npm 11 install-script allowlist: `esbuild` approved (needed by tsx/vitest); `@parcel/watcher` denied (prebuilt binaries are used, no node-gyp build needed).

## D4 — Repository root (Phase 0)
The repo root is this working folder (`Monitor_App`); the GitHub remote is `Annithah/dueora`. Commits use a repo-local git identity (`Annithah <uwihirweannitha@gmail.com>`), as agreed, because no global identity was configured.

## D5 — Design sources (Phase 1)
- No screenshots were supplied, so the 40 screenshots in `design/` were captured from the Figma prototype (https://rouge-warm-77431112.figma.site/) in a browser. Its stylesheet is saved as `design/prototype-styles.css` and used as the precise spec (sizes, radii, shadows, dark palette).
- `docs/requirements.md` was written from the owner's build brief, since no separate requirements file was provided. If a fuller document arrives it replaces this one.
- **Minimum text size 11px.** The prototype uses 7–10px labels (fine on a desktop mock-up, too small on a phone). The app keeps the hierarchy but enforces ≥ 11px and honours OS font scaling.
- **Status colours: two tones.** The brief's colours (Paid `#22A06B`, Upcoming `#3B82F6`, Due soon `#F59E0B`, Due today `#EA580C`, Overdue `#DC2626`, Partially paid `#7C3AED`) are used for dots, icons, charts and swatches. Badge *text* on soft backgrounds uses the prototype's darker tones (`#157A53`, `#2469CF`, `#A35900`, `#BB4109`, `#C82020`, `#6D36CC` — the prototype's tones, nudged darker where needed) so it passes 4.5:1 contrast; `src/theme/contrast.test.ts` enforces this.
- The prototype's "Design system" entry in the More menu is a designer showcase; in the app that slot becomes "Notification settings".

## D6 — Schema details (Phase 2)
- **Dates without time are `YYYY-MM-DD` strings** (`startDate`, `nextDueDate`, `cycleDueDate`, `paidOn`). They sort correctly as text, range filters are simple string comparisons, and no timezone can shift a due date. Validated with zod at the API boundary.
- **JSON columns have no database default.** Prisma 7 emits invalid SQL for `@default` on SQLite `Json` columns, so the application always sets `reminderOffsets`, `mutedObligationIds`, `data`, `meta` and `payload` explicitly.
- **`Obligation.icon` (optional)** overrides the category icon, so a domain can show a blue globe and hosting a teal server while both sit under "Hosting & domains".
- **Additions beyond the brief's model**, all needed by the features it describes: `Invite`, `RefreshToken` (hashed, rotation family), `EmailToken` (hashed 6-digit codes), `ExchangeRate` (org-defined rate for converted dashboard totals; `Decimal`), `OrgReminderRun` (atomic "today's reminders processed" claim per org), `Job` (queue, D2), `Notification.sendAfter` (quiet hours) and `Notification.pushTicketId` (receipt checks), `PaymentRecord.organizationId` (denormalised for scoping).
- **Prisma 7 driver adapters:** `better-sqlite3` for `file:` URLs, `pg` for `postgres://` URLs, chosen at runtime in `src/db/client.ts`.
- **Demo seed password** comes from `SEED_ADMIN_PASSWORD`; if unset, a random one is generated and printed (no credentials in the repo).

## D7 — Mobile navigation (Phase 2)
- Expo Router with `Stack.Protected` guards: signed-out users see welcome → onboarding → auth; signed-in users see the `(app)` group (tabs + modals). `src/app/index.tsx` redirects to the right place.
- Custom tab bar matching the prototype (raised teal "+" between Payments and Calendar, unread badge on Alerts), built on `expo-router/tabs`.
- Tokens are stored with `expo-secure-store` (Keychain/Keystore). The API client refreshes once on 401 with a single shared refresh, then retries; a rejected refresh signs the user out.
- Release builds refuse a non-https `EXPO_PUBLIC_API_URL`.

## D8 — Auth, roles and workspaces (Phase 3)
- **Tokens:** HS256 JWT access tokens (15 min, `jose`). Refresh tokens are opaque 256-bit random strings stored as SHA-256 hashes, valid 30 days, **rotated on every use**. Presenting an already-rotated token revokes the whole login family (theft detection). Password reset and password change sign out every session.
- **Email codes:** 6-digit, hashed, 15-minute expiry, 5 attempts, one new code per minute. Forgot-password never reveals whether an account exists; login returns the same error for an unknown email and a wrong password (and spends the same argon2 time).
- **Workspace selection** is a request header (`X-Org-Id`), so switching workspaces is instant and stateless. Non-members get **404**, never 403, so workspace ids can't be probed.
- **Permissions** live in one pure module (`domain/permissions.ts`). Interpretations of the brief:
  - Reports and audit log: ADMIN and FINANCE only. DEPARTMENT "views others" via the obligation lists, not financial reports.
  - Platforms and custom categories: ADMIN, FINANCE and DEPARTMENT can create them, since department officers need them to file their own obligations.
  - Recording payments follows "manage" rights: ADMIN/FINANCE on everything, DEPARTMENT on their department's obligations; EMPLOYEE is view-only.
  - Editing/deleting a payment record: ADMIN and FINANCE only (as the brief states).
  - A workspace always keeps at least one ADMIN. Anyone can leave a workspace; removing a member unassigns their obligations so reminders fall back to admins/finance.
- **Invites** are tied to the invited email: a signed-in user with a different email can't redeem the link. Accepting via the emailed link also marks the address verified.
- **Uploads** are checked by magic bytes (not the client's MIME type), capped at 5 MB, and stored privately. Workspace logos are the one public file type, served from `/api/v1/public/logos/:orgId` so emails can show them.
- **Mobile:** the email-verification step is required for new sign-ups who create a workspace (as in the prototype). Invited users skip it, because accepting the emailed invite proves the address.

## D9 — Scheduling and status rules (Phase 4)
- **A part-paid cycle past its due date is OVERDUE**, not PARTIALLY_PAID: it's the more urgent fact. The API always returns `paidMinor` and `remainingMinor`, so the UI can still say "$120 of $240 paid".
- **Overdue obligations don't roll forward on their own.** The cycle stays open until it's paid (or archived), so an unpaid renewal never silently disappears. Paying advances exactly one cycle (Phase 5).
- **Weekly follow-ups** continue after the last configured after-due offset (default −7 → −14, −21, …). If an obligation has no after-due offsets, no follow-ups are sent.
- **Anchor day** defaults to the day of the next due date. Sending `anchorDay: 31` explicitly gives "last day of the month" behaviour.
- **Status filtering is done in memory** after computing status for "today", because status depends on the workspace's local date. A workspace has hundreds of obligations at most, and the query is capped at 5,000 rows.
- **Deleting an obligation with payment history is refused** (409); archiving keeps the history, as the brief requires.

## D10 — Payments (Phase 5)
- **Payments always attach to the open cycle.** To record an older missed cycle, record it now: it closes the open (oldest unpaid) cycle first, which is the order bills are actually settled in.
- **Default amount = remaining balance** for the cycle, so "Full payment" in the app needs no maths.
- **Overpaying is allowed** (prices change); the cycle simply closes.
- **Recalculation after edit/delete only ever reopens the cycle immediately before the open one**, and only if the edited/deleted payment belonged to it and nothing has been paid on the open cycle. This undoes a mistaken "paid" without rewinding history further.
- **Payment dates can't be in the future**; payment currency must equal the obligation's currency.
- **Receipts are uploaded in a second request** after the payment is created. A failed upload never loses the payment, and the app can retry it.
- **Text search runs in application code** over the workspace's obligations, because `contains` is case-sensitive on Postgres but not on SQLite (Prisma's `mode: 'insensitive'` isn't available for SQLite).

## D11 — Notifications (Phase 6)
- **Email channel policy:** email goes out for *key moments* (7 days before, the due date, the first overdue reminder) and as the fallback whenever a user has no active push device. Sending every reminder by email *and* push would be spam; the user can still turn email off entirely. Digests always include one email.
- **Payment-recorded notices** go to ADMIN and FINANCE (not the person who recorded it) in-app and by push. No email, to keep inboxes calm.
- **Planning runs on every worker cycle** (≈5 s) rather than through a queued "cron" job. It's exactly-once per workspace-day thanks to the `OrgReminderRun` unique claim, so it's safe with any number of workers, and reminders go out within seconds of the reminder hour. Receipt checks and pruning run once per 15-minute slot.
- **Catch-up window** starts at the previous run's local date. A brand-new workspace starts from yesterday, so it never receives a burst of historic reminders on day one.
- **Quiet hours** use the workspace's wall clock. The end instant is computed from the current UTC offset, so a DST change *inside* a quiet window can shift delivery by an hour. That's acceptable, and it's documented here.
- **Attempts are counted on the notification**, not the job, so a resend triggered by a failed receipt can't loop forever (max 5).
- **SQLite tuning:** WAL journal mode + `synchronous=NORMAL` + 10 s busy timeout, so the API and worker processes can share the development database. Test databases are created in the OS temp folder, because the project lives in a synced OneDrive folder and fsyncs there were about 50× slower.
- **expo-server-sdk 8 requires Node ≥ 22.12**, so the production Docker image uses Node 22.
- **Push in development:** `registerDevice` quietly does nothing until an EAS project id exists (`eas init`), so the app runs fine without push credentials.

## D12 — Screens and client data (Phase 7)
- **Charts are drawn with react-native-svg** (bar, smooth line, donut) instead of react-native-gifted-charts. That matches the prototype's simple charts exactly, avoids another native-adjacent dependency on RN 0.88, and keeps them accessible: each chart has a spoken summary.
- **The calendar is a custom grid** rather than react-native-calendars, for the prototype's look (Monday-first, status dots, teal selected day) and for consistent Day/Week/Month/Year views. Date maths uses date-fns.
- **Offline:** TanStack Query's cache is persisted to AsyncStorage for 7 days, and cleared on sign-out. Offline is read-only; mutations need a connection.
- **Dashboard totals** show per-currency amounts. The big number on a summary card is the single currency when there's one, otherwise the converted total in the workspace's default currency.
- **Biometric lock is a device setting** (stored locally, not in the account). It locks on launch and after 30 s in the background.
- **The "Record" quick action** opens the Payments list, since a payment has to be chosen first. Recording itself lives on the payment detail screen, as in the prototype.
- **Reports and Team** appear in More only for roles that can use them (Reports: Admin/Finance; Team: everyone except Employees).
- **Protected file downloads** (receipts, report exports) go through expo-file-system with the bearer token, then the system share sheet. A cheap authenticated call first makes sure the token is fresh.

## D13 — Hardening and deployment (Phase 8)
- **Route-level security sweep:** `backend/test/security.test.ts` lists every registered route and checks: no token → 401, forged token → 401, a signed-in user of another workspace → 404. New routes are covered automatically.
- **Production database:** `npm run db:pg:migration` derives `prisma/postgres/schema.prisma` from the SQLite schema and writes the matching Postgres migration offline (`prisma migrate diff`, no database needed). A test fails if the two schemas drift. The Docker image generates the Postgres client and runs `prisma migrate deploy` on start. `prisma` moved to runtime dependencies for that reason.
- **Hosting recommendation:** one always-on container (API + worker) on Railway Hobby (≈ $5/mo) with Railway Postgres, or Render Starter + Postgres Basic (≈ $13/mo, `render.yaml`). Free tiers that sleep, and auto-suspending free databases, are rejected because reminders must fire on time.
- **Additional indexes:** `PaymentRecord(organizationId, cycleDueDate)` for calendar/reports and `Notification(userId, organizationId, channel, readAt)` for unread counts.
- **App icons and splash** are rendered from the brand mark by `mobile/scripts/generate-icons.mjs` (resvg), so they stay consistent with the in-app logo. The monochrome layer doubles as the white Android notification icon.
- **Bundle check:** the exported Android bundle was scanned for server secrets; only `EXPO_PUBLIC_API_URL` is present.
- **Not verified locally:** the Docker image (Docker isn't installed on the build machine) and push delivery on a physical device (needs the Expo/Firebase accounts). The compiled server (`node dist/server.js`) was run and checked; the Dockerfile only adds the Postgres client generation and `migrate deploy` on top of that.

---

# v2 brief — subscriptions, companies, USD (3 Nov 2026)

The owner issued a revised brief. The existing build was reworked rather than rewritten: everything that still
fits (auth, scheduling engine, notification pipeline, UI kit) was kept and renamed; features the brief removes
were deleted. Where a v2 decision contradicts an earlier one, the v2 decision wins.

## D14 — Database: SQLite everywhere, by the owner's choice (supersedes D1)
**Context:** the brief asks for PostgreSQL + pg-boss. PostgreSQL 18 is installed locally, but the owner chose
SQLite ("we are using the sqlite database").
**Decision:**
- SQLite in development, tests **and production** (`DATABASE_URL=file:/data/dueora.db` on a persistent disk).
  One always-on container runs the API and the reminder worker (WAL mode lets both share the file).
- The Postgres flavour is kept as an option: `prisma/postgres/` (schema + migrations, generated from the
  SQLite schema and kept in sync by a test) and `docker build --build-arg DB_PROVIDER=postgres`.
- **pg-boss is not used** (it requires Postgres). The database-backed job queue from D2 stays: atomic claims,
  exponential backoff (max 5), stale-lock recovery, singleton keys — the same guarantees, no Redis.
- The dev database moved to `backend/dueora.db` (fresh schema). The old `backend/dev.db` (v1 schema, demo
  data) was left untouched on disk; it is git-ignored and can be deleted by the owner.

## D15 — Roles and reports
- Roles are ADMIN, FINANCE, VIEWER (replaces D8's four roles). Departments are gone.
- **VIEWER can read reports and export them.** The brief says VIEWER is "read-only"; reports are read-only
  data and viewers already see every amount on the dashboard. Writes, member management and revealing
  subscription keys stay with ADMIN/FINANCE.
- Companies and custom categories: ADMIN and FINANCE.
- Any role can mute reminders for themselves (it changes nothing for others).

## D16 — Companies
- A workspace is created with a first company (named in setup; defaults to the workspace name, or "Personal").
- `DELETE /companies/:id` deletes an unused company and **archives** one with subscriptions (`archivedAt`).
  Archived companies are hidden from the Add form and filters but keep their subscriptions and history; they
  can be restored. An archived company can't receive new subscriptions.

## D17 — Subscription keys
- AES-256-GCM with a random 96-bit IV per value, stored as `v1.<iv>.<tag>.<ciphertext>`. The AES key and a
  separate HMAC key are derived from `SUBSCRIPTION_KEY_SECRET` with HKDF.
- `subscriptionKeyHash` is an **HMAC** (not plain SHA-256) of the normalised key (upper-case, no spaces or
  dashes), so search is exact-match only and a database dump can't be brute-forced without the secret.
- Responses always carry the masked form; the plain value comes only from `GET /subscriptions/:id/key`
  (ADMIN/FINANCE, `Cache-Control: no-store`, every reveal audit-logged with no value). The app fetches it with
  a mutation, so it never lands in the persisted query cache, and re-masks it after 30 seconds.
- Logs redact `subscriptionKey` fields and request bodies; audit entries record changed field names only.

## D18 — Dates
- New subscription: `startDate` defaults to today (workspace timezone) and the first due date **is** the start
  date when it's today or later. A start date in the past rolls forward whole cycles to the first date on or
  after today (`calculateNextDueDate`). One-time subscriptions keep their date even if past (still owed).
- Editing start date or frequency re-derives the due date **only while no payment exists**; after that the
  recorded cycles define the schedule (the user can still set the date explicitly).
- The app mirrors the calculation (`mobile/src/lib/schedule.ts`) to show the date live; the server is the
  source of truth. Once the user picks a date by hand, auto-calculation stops until they tap
  "Calculate automatically".

## D19 — Lists, sorting and filters
- Subscriptions list: statuses depend on the workspace's "today", so the server loads the workspace's
  subscriptions (capped at 5,000), computes status, filters, sorts and returns one page (default 10). That is
  still server-side pagination from the app's point of view and keeps status filters exact.
- Due-date sort puts COMPLETED one-time subscriptions after everything that is still due.
- `frequency` filters by unit (weekly / monthly-quarterly / yearly / one-time) — the four buckets people think in.
- History pages in SQL (`skip/take`) and returns `totalCents` for the active filter.
- Search is debounced (300 ms) and runs on the server, so it covers every page, not just loaded rows.

## D20 — Notifications
- Recipients are all workspace members (minus mutes and disabled channels), replacing D11's assignee/role logic.
- Copy labels subscriptions as "Company · Name" and always shows USD with cents.
- Payment-recorded notices go to every member except the person who recorded it, and don't name that person
  (no ownership in the UI). Who recorded what stays in the internal audit log.

## D21 — Removed features
Attachments/receipts, logo uploads, file storage (local/S3/R2), currencies and exchange rates, departments,
assignees, "created by", phone and avatar on profiles, and the demo seed are gone from schema, API and app.
The default categories (9, from the brief) are inserted by `npm run db:seed` and idempotently at server start.

## D22 — Tests without demo data
Tests build their own fixtures through the public API (`backend/test/helpers/fixture.ts`) in a throw-away
SQLite database per file. The year-long reminder simulation runs on that fixture. Fixture names are neutral
("Alpha News", "Beta Radio"); `npm run check:no-sample-data` scans `mobile/src` (tests excluded) for the
brief's sample names and amounts.

## D23 — OneDrive and Node 24 (environment)
The project folder is synced by OneDrive "Files On-Demand". Node 24 on Windows reports those cloud
placeholder files as symlinks, so Jest skipped unchanged test files and Metro failed with `EINVAL: readlink`.
Files under `mobile/` (excluding `node_modules`) were rewritten in place to make them regular files (content
unchanged). `mobile/node_modules` still has ~62k placeholders; rewriting them would trigger a large OneDrive
re-upload, so that was left to the owner: mark the folder "Always keep on this device", or move the project
outside OneDrive (recommended), or reinstall `node_modules` after pausing sync.

## D24 — No email verification at sign-up (4 Nov 2026)
The owner asked to remove email verification: without a configured email provider the code never reached
users and blocked sign-up. Sign-up now signs the user in and goes straight to workspace setup. The
`/auth/verify-email` endpoints, the verify screen and the verification email were removed. The
`emailVerifiedAt` column and `VERIFY_EMAIL` enum value stay (no migration); accepting an invite or resetting
a password still marks the address verified. Password reset keeps its emailed code, so it still needs
`RESEND_API_KEY` in production.

---

# Master prompt (10 Nov 2026)

The owner issued `DUEORA_MASTER_PROMPT` as the single source of truth. Where it differs from earlier briefs or
decisions, the master prompt wins, except where noted below.

## D25 — Production database: managed PostgreSQL (supersedes D14 for production)
The master prompt asks for PostgreSQL in production. The Postgres flavour already existed (D13/D14): schema
and migrations generated from the SQLite schema and kept in sync by a test. Production now deploys with
`DB_PROVIDER=postgres` against the host's managed Postgres. Development and tests stay on SQLite (fast,
no server needed, already 500+ tests). The database-backed job queue (D2) stays instead of pg-boss: it gives
the same guarantees (atomic claims, backoff, max 5 attempts, singleton keys) and works on both databases, so
the test suite keeps exercising the real queue. Swapping to pg-boss later only touches `src/jobs/queue.ts`.

## D26 — Email verification is optional, never blocking (refines D24)
The master prompt lists email verification; the owner removed it on 4 Nov because it blocked sign-up when
email wasn't configured. Both hold: sign-up goes straight to workspace setup, and Profile offers
"Verify my email" (6-digit code). `/auth/verify-email/request` and `/auth/verify-email` are back.

## D27 — Event notifications go to ADMIN and FINANCE (supersedes D20's payment rule)
PAYMENT_RECORDED, PRICE_CHANGE, AUTO_RENEW_NOTICE and BUDGET_ALERT go to ADMIN and FINANCE members only
(never the person who caused them); TEAM goes to ADMIN. They are in-app + push, no email, built by one helper
(`notifications/events.ts`). Dedupe keys now include the notification type.

## D28 — Budgets
"Spent" for a month = paid in the month + still due in the month (unpaid parts of cycles whose due date falls
in it), so an alert arrives before the money is gone. One alert at the chosen percentage and one at 100% per
budget per month (only the highest threshold crossed is sent). A budget is unique per (workspace, scope)
where scope is `all` or the category id, because NULLs never collide in unique indexes.

## D29 — Spreadsheet import
- Preview and commit both re-read the uploaded file with the same mapping, so the server never trusts rows
  sent back by the client. Nothing is written until commit; only valid rows are imported.
- Templates are header-only (no sample rows, rule 13). Up to 1,000 rows and 2 MB per file.
- Slashed dates are read day-first (20/10/2026) unless impossible. A past date on a recurring row means the
  last renewal and rolls forward to the next one. Unknown companies and categories are created; an empty
  category is guessed from keywords (shown as a warning, editable afterwards).

## D30 — Account deletion
Password + typing DELETE. Workspaces where the user is the only member are deleted. Shared workspaces are
left; if the user was their only admin, the longest-standing member becomes admin. Personal data is erased
and the user row becomes an anonymous tombstone so the internal audit log of shared workspaces stays intact.

## D31 — Default categories
The 11 defaults from the master prompt: Transport and Education & training were added; the 9 existing ones
kept their ids, so no data moves.
