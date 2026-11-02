# DueOra — Progress

Legend: `[x]` done · `[ ]` to do · `[~]` partially done / blocked (see note)

## Phase 0 — Foundation
- [x] Repo structure (`mobile/`, `backend/`, `docs/`, `design/`)
- [x] Root README (description + setup)
- [x] `docs/requirements.md` present (written from the brief — DECISIONS.md D5)
- [x] ESLint, Prettier, TypeScript (strict) configs for both apps
- [x] `.editorconfig`, `.gitignore`, `.env.example` (both apps)
- [x] `docker-compose.yml` with Postgres 16 (for production parity; dev uses SQLite — see DECISIONS.md)
- [x] Lint / type-check / tests pass, commit

## Phase 1 — Design implementation foundation
- [x] Study `design/` screenshots, write `docs/UI_MAP.md`
- [x] Theme tokens (light/dark), typography (Plus Jakarta Sans)
- [x] UI components: Button, Input, Select, DatePicker field, Chip, StatusBadge, Card, ListItem, BottomSheet, EmptyState, Skeleton, Avatar, CategoryIcon, AmountText, Countdown ring, Toast
- [x] Illustrations (onboarding, empty states) and Lottie assets (success)
- [x] Lint / type-check / tests pass, commit

## Phase 2 — Project setup
- [x] Expo Router: tabs (Home, Payments, Calendar, Alerts, More) + floating "+", auth stack, onboarding stack
- [x] Express skeleton: zod env config, error handler, request logging, `/health`, `/api/v1`
- [x] Prisma schema, first migration, seed script
- [x] Mobile API client (token refresh) + TanStack Query provider
- [x] Lint / type-check / tests pass, commit

## Phase 3 — Auth, workspaces, roles
- [x] Register, login, logout, refresh, forgot/reset password, email verification, profile update
- [x] Workspaces: create, update info/logo, switch
- [x] Invites, roles, departments, remove members
- [x] Role permissions (ADMIN / FINANCE / DEPARTMENT / EMPLOYEE)
- [x] Cross-organization isolation tests
- [x] Lint / type-check / tests pass, commit

## Phase 4 — Obligations and scheduling engine
- [x] CRUD obligations, platforms, categories; archive/unarchive
- [x] `domain/schedule.ts`: nextDueDate, computeStatus, reminderDates (org timezone)
- [x] Exhaustive engine tests (>95% coverage)
- [x] Lint / type-check / tests pass, commit

## Phase 5 — Payments and history
- [x] Record full/partial payment with receipt upload
- [x] Cycle completion → advance nextDueDate / COMPLETED
- [x] Edit/delete payment (ADMIN/FINANCE) + recalculation + AuditLog
- [x] History endpoint: search, filters, pagination
- [x] Lint / type-check / tests pass, commit

## Phase 6 — Notifications
- [x] `docs/NOTIFICATIONS.md`
- [x] Scheduler (15-min cron, org-local reminder hour, catch-up, quiet hours)
- [x] Dedupe keys with unique constraint (insert-then-send)
- [x] Recipients resolution + mutes/channel prefs
- [x] Digest grouping (>3 reminders)
- [x] Push (expo-server-sdk, receipts, token deactivation, retries) + email (Resend) + IN_APP
- [x] Mobile: permission flow, token registration, Android channels, deep links, foreground toast, settings
- [x] Year-long fake-clock simulation test
- [x] Lint / type-check / tests pass, commit

## Phase 7 — Screens, dashboard, calendar, reports
- [x] Onboarding, auth, workspace setup
- [x] Dashboard (aggregated endpoint)
- [x] Payments list, add/edit, detail, record-payment sheet
- [x] Calendar
- [x] Alerts
- [x] History, Reports (PDF/Excel export)
- [x] Team, Profile, Company, Categories, Notification settings, Security, Dark mode, Help
- [x] Skeletons, empty/error states, offline banner, query persistence
- [x] Lint / type-check / tests pass, commit

## Phase 8 — Testing, hardening, deployment
- [ ] Integration tests for every route (roles + isolation)
- [ ] Mobile component tests + `docs/QA_CHECKLIST.md`
- [ ] Security pass
- [ ] Performance: indexes, pagination, aggregated dashboard
- [ ] Dockerfile, Render/Railway config, eas.json
- [ ] `docs/DEPLOYMENT.md`
- [ ] Final README + summary

## Phase summaries

### Phase 0 — Foundation ✅
- Repo initialised (`main`, remote `Annithah/dueora`, repo-local git identity).
- `mobile/`: Expo SDK 58 TypeScript app (strict), app identity set (DueOra, `com.dueora.app`, scheme `dueora`, automatic light/dark), ESLint (expo flat + prettier), Jest (`jest-expo`) + React Native Testing Library.
- `backend/`: ESM TypeScript (strict, NodeNext), ESLint (typescript-eslint + prettier), Vitest with v8 coverage, tsx for dev.
- Root: README, `.editorconfig`, `.prettierrc.json`, `.gitattributes` (LF), `.gitignore`, `docker-compose.yml` (Postgres 16, optional), `npm run check` to run everything.
- Deviations from the brief are recorded in DECISIONS.md: SQLite for dev/tests (D1), a DB-backed job queue instead of pg-boss (D2), pinned tool versions (D3).
- Open: `docs/requirements.md` and `design/` screenshots not yet provided.

### Phase 1 — Design implementation foundation ✅
- Captured all 40 prototype screens into `design/` (plus the prototype stylesheet as the exact spec) and wrote `docs/UI_MAP.md`: every screen, its route, components and navigation.
- `mobile/src/theme`: one token file (palette, light/dark schemes, 8pt spacing, radii, elevation, motion, type scale), status styles (icon + label for every status), category badge visuals, `ThemeProvider` with system/light/dark preference, Plus Jakarta Sans font map.
- `mobile/src/components/ui`: Text, Button, IconButton, Input, Select (bottom-sheet picker), DatePickerField, Chip, StatusBadge (pulses when overdue), Card, ListItem, BottomSheet, EmptyState, Skeleton/SkeletonList, Avatar (initials, stable colours), CategoryIcon, AmountText, CountdownRing (animated SVG), Toast (store + host), Segmented, Switch, SectionHeader, Logo, SuccessCheck.
- Original SVG illustration set (11 scenes: onboarding ×3, empty payments, all caught up, empty calendar, no results, offline, error, notifications, team) and a hand-built Lottie success animation (`assets/lottie/success-check.json`).
- Money helpers on integer minor units (`formatMoney`, `parseMoneyInput`) and date-only helpers.
- Tests: 94 passing — includes a WCAG contrast test over both palettes (which caught four badge tones below 4.5:1; fixed), money/date formatting and component behaviour. `expo-doctor` 20/20.
- Respects reduced-motion for every animation; all touch targets ≥ 44px; icon-only buttons require an accessibility label.

### Phase 2 — Project setup ✅
- **Backend:** Express 5 app factory with injected context (env, db, logger, clock), zod-validated env (`https` enforced in production), helmet, CORS, rate limiting, pino request logging with request ids, JSON error handler (validation / Prisma / malformed JSON), `/health` with a DB round-trip, versioned `/api/v1`.
- **Database:** full Prisma 7 schema (brief model + supporting tables, D6), first migration, SQLite via driver adapter (Postgres adapter ready for production).
- **Seed:** `npm run db:seed` loads "Kigali Today Ltd" — 4 users (Admin, Finance, Department, Employee), 2 platforms, 2 departments, the 6 obligations from the brief plus monthly, weekly, quarterly, 6-monthly and one-time items, payment history (incl. a partial payment) and an RWF→USD exchange rate.
- **Mobile:** Expo Router with protected groups, welcome/splash and 3-slide onboarding (built), auth stack, tab layout with custom tab bar + floating "+", placeholder screens for later phases; API client with single-flight token refresh, SecureStore session store, TanStack Query provider; Plus Jakarta Sans loaded at startup.
- **Tests:** backend 15 (health, env, seed), mobile 104 (+ API client). Android bundle export succeeds.

### Phase 3 — Auth, workspaces, roles ✅
- **Auth API:** register, login, logout, refresh (rotating, reuse detection), email verification and password reset with 6-digit emailed codes, profile update, change password; per-IP+email rate limits on credential routes; argon2id hashing.
- **Workspaces API:** create (Company/Personal), update company info, reminder hour, quiet hours and default offsets, logo upload (magic-byte checked, 5 MB), exchange rates, delete with name confirmation; departments; members (change role/department, remove, leave, last-admin guard); invites (email link, preview, accept, revoke, 7-day expiry, email-bound); audit log entries.
- **Services:** mailer (Resend in production, log in development, memory in tests) with branded mobile-friendly HTML templates; private storage (local disk / S3-compatible R2).
- **Permissions:** pure role module + middleware; per-role tests; **cross-organization isolation tests** (non-members get 404 on every workspace route, foreign ids are never found through your own workspace).
- **Mobile:** login, sign-up, forgot/reset password, email verification, workspace setup (type, name, logo, currency, timezone), invite team, invite deep link (`dueora://invite?token=`) for signed-in and signed-out users, log out.
- `docs/API.md` started. Tests: backend 125, mobile 108.

### Phase 4 — Obligations and scheduling engine ✅
- `backend/src/domain/schedule.ts`: pure calendar maths on ISO dates — `nextDueDate` / `previousDueDate` for weekly, every N weeks, monthly, quarterly, 6-monthly, yearly, custom and one-time; month-end anchors (31 → Feb 28/29 → Mar 31) and leap years; `todayIn` / `localTimeIn` for any IANA timezone; `computeStatus` (UPCOMING, DUE_SOON ≤ 7 days, DUE_TODAY, OVERDUE, PARTIALLY_PAID, PAID, ARCHIVED); `reminderDates`, full `reminderSchedule` with weekly overdue follow-ups, `reminderDueOn`, and `mostRecentMissedReminder` for catch-up.
- **52 engine tests, 100% statement/branch/function/line coverage**, enforced by a ≥ 95% threshold in `vitest.config.ts`.
- Obligations API: list (status computed in the workspace timezone, filters, search, pagination, employee scoping), create/edit with workspace-scoped reference checks and department rules, detail (reminder plan, history, attachments), archive/unarchive, delete only without history.
- Platforms and categories CRUD (built-ins protected, in-use categories protected).
- Integration tests on the seeded Kigali Today workspace (27) + isolation tests extended to obligations/platforms/categories.

### Phase 5 — Payments and history ✅
- Record full or partial payments against the current cycle (amount defaults to the remaining balance, date defaults to today in the workspace timezone, currency must match).
- Cycle completion advances `nextDueDate` by exactly one cycle (month-end anchors respected); one-time obligations become COMPLETED. The advance is a conditional update, so concurrent payments can't double-advance (tested).
- Edit/delete (ADMIN/FINANCE) recalculates: a cycle closes when it's fully paid and reopens when the payment that closed it is reduced or removed. Never more than the adjacent cycle. Before/after values go to the AuditLog.
- History endpoint: search (case-insensitive on SQLite and Postgres), date range, category, provider, platform, method, pagination, per-currency totals; employees see only their assignments.
- Receipts and contracts: upload (magic-byte checked, 5 MB), download with safe headers, delete (files removed from storage with their payment).
- 25 payment tests, including role and cross-workspace isolation checks. Backend total: 238.

### Phase 6 — Notifications ✅
- `docs/NOTIFICATIONS.md` describes the whole design.
- **Scheduler and planner:** each workspace's day is claimed atomically (`OrgReminderRun`) once its local time reaches `reminderHour`. One reminder per obligation per run (the latest due since the previous run, which also covers catch-up). Weekly overdue follow-ups. Recipients are the assignee, ADMIN, FINANCE and the department's officers, minus mutes. Digest above 3 reminders. Quiet hours delay sending.
- **No duplicates:** deterministic unique `dedupeKey`, insert-then-send, idempotent delivery jobs, and a re-check right before sending (paid/archived/muted messages are cancelled).
- **Delivery:** Expo push (chunks, tickets, receipts after ~15 min, `DeviceNotRegistered` deactivation, retries with backoff up to 5 attempts, email fallback). Resend email (branded reminder, digest and payment-recorded templates with status badge and "Open in DueOra"). Every notification is also stored in-app.
- **Database-backed job queue** with atomic claims, backoff, stale-lock recovery, singleton keys and pruning. Worker process (`npm run worker`) or in-API (`RUN_WORKER_IN_API=true`).
- **API:** inbox with unread count, read/read-all, preferences, mute/unmute, device registration, test notification.
- **Mobile:** permission explainer screen (shown after the first obligation), token registration on start/sign-in and removal on logout, Android `reminders`/`overdue` channels, tap-to-open deep links, foreground toasts, unread badge, Notification settings (push/email/digest toggles, reminder time, quiet hours, default reminders, "Send test notification"), `eas.json` profiles, `app.config.ts` for FCM, FCM setup steps in `docs/DEPLOYMENT.md`.
- **Tests:** 15 queue/format tests, 18 notification behaviour tests, and the **year-long simulation**: 15-minute ticks from 2 Nov 2026 to 1 Nov 2027, with payments, a mute, an archive, a 6-day worker outage, a timezone move and two racing schedulers. It is checked against an independent oracle (14 assertions, about 3 minutes).
- SQLite now runs in WAL mode (API and worker can share the dev database) and test databases live in the OS temp folder, which made the suite about 15× faster.

### Phase 7 — Screens, dashboard, calendar, reports ✅
- **Backend:** one aggregated `GET /dashboard`; `GET /calendar` (projected, open and paid cycles); `GET /reports` (monthly and annual: committed, paid, outstanding, overdue, by category, 12-month forecast); PDF (pdfkit) and Excel (exceljs) export. Currency conversion uses decimal maths with the workspace's exchange rates, and currencies without a rate are flagged rather than guessed.
- **Mobile, every prototype screen wired to the API:**
  - **Home:** greeting, company avatar, unread bell, workspace switcher, summary cards per currency plus a converted total, needs attention, quick actions, 12-month bar chart, category donut, next-30-days timeline, pull-to-refresh.
  - **Payments:** search, status chips, grouped by project.
  - **Add/Edit payment:** the five-section form, with frequency presets and custom intervals, reminder chips, assignee and department, inline project creation and contract attachments. The notification explainer appears after the first payment.
  - **Payment detail:** hero, countdown ring, renewal details, reminder schedule with sent ticks, history timeline, attachments that open in the share sheet, and mute/archive/delete options.
  - **Record payment:** full or partial, date, method, reference, receipt by file or camera, notes. Then the Lottie success screen.
  - **Calendar** (day/week/month/year with status dots) and **Alerts** (Today / This week / Earlier, mark read, unread badge, offline banner).
  - **History** (search, date range, category and project filters, month totals) and **Reports** (monthly/annual, forecast line, donut, export PDF/Excel via the share sheet).
  - **Settings:** Team & roles (members, role and department changes, removal, invites, departments), Profile, Company info (logo, currency, timezone, exchange rates, delete workspace), Categories & projects, Security (change password, biometric lock), Notifications, Help, and dark mode.
- **States:** every list has skeletons, illustrated empty states, retryable error states and an offline banner. TanStack Query data is saved to device storage (7 days), so the app opens instantly and works read-only offline.
- **Tests:** backend 15 new (insights), mobile 122 total. Android bundle export and expo-doctor 20/20.
