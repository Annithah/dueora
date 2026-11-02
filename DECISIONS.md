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
