# DueOra — Progress

Legend: `[x]` done · `[ ]` to do · `[~]` done with a caveat (see note)

The first build (v1, 2 Nov 2026) followed an earlier brief. On 3 Nov 2026 the owner issued the **v2 brief**
(subscriptions, companies, USD only, no ownership/attachments, 10-per-page lists with sort & filter, encrypted
subscription keys, no demo data). This checklist tracks v2. Phase 9 (Play Store) is out of scope.

## Phase 0 — Foundation
- [x] Repo structure (`mobile/`, `backend/`, `docs/`, `design/`), root README
- [x] `docs/requirements.md` rewritten from the v2 brief
- [x] ESLint, Prettier, strict TypeScript, `.editorconfig`, `.gitignore`, `.env.example` (both apps, incl. `SUBSCRIPTION_KEY_SECRET`)
- [~] `docker-compose.yml` with Postgres 16 — kept as an option; the owner chose SQLite (DECISIONS D14)

## Phase 1 — Design implementation foundation
- [x] `docs/UI_MAP.md` updated: screens, components, navigation, and every dropped design element
- [x] Theme tokens light/dark, Plus Jakarta Sans
- [x] Components: Button, Input, Select, **DateField with quick-pick chips**, Chip, StatusBadge, Card, ListItem, BottomSheet, **SearchBar with Sort and Filter**, **SortSheet**, **FilterSheet**, **ActiveFilters**, EmptyState, Skeleton, Avatar, CategoryIcon (incl. Social media badge), AmountText (USD), CountdownRing, Toast
- [x] Original illustrations + Lottie success animation

## Phase 2 — Project setup
- [x] Expo Router tabs (Home, Subscriptions, Calendar, Alerts, More) + floating "+" (hidden for viewers), auth & onboarding stacks
- [x] Express skeleton: zod env, error handler, pino, `/health`, `/api/v1`
- [x] Prisma schema per the v2 data model, fresh first migration
- [x] Seed inserts the 9 default categories only (also idempotently at server start)
- [x] Mobile API client with token refresh, TanStack Query provider

## Phase 3 — Auth, workspace, companies, roles
- [x] Register, login, logout, refresh, forgot/reset (email code), profile (name) — email verification removed at sign-up (4 Nov 2026)
- [x] Create workspace (Company/Personal + first company), settings, switch
- [x] Companies: create, rename, colour, delete when unused / archive otherwise, restore
- [x] Invites by email; roles ADMIN / FINANCE / VIEWER
- [x] Isolation tests: one workspace can never read or modify another's data

## Phase 4 — Subscriptions and the scheduling engine
- [x] CRUD, archive/unarchive, custom categories
- [x] Form: name, company (+ New company), category with icons, provider, subscription key (masked, show/hide), USD amount, 9 frequency presets, start date = today, auto next due date (editable), reminder chips, notes
- [x] `GET /subscriptions?page=&limit=10&sort=&q=&status=&companyId=&categoryId=&frequency=&dueFrom=&dueTo=` → items + total + hasMore
- [x] `calculateNextDueDate`, `advance`, `computeStatus`, `reminderDates` in `backend/src/domain/schedule.ts`; month-end & leap years; workspace-timezone "today"
- [x] Engine tests with ≥ 95% coverage enforced
- [x] Subscription key: AES-256-GCM at rest, HMAC search hash, masked everywhere, reveal endpoint for ADMIN/FINANCE only (audited)

## Phase 5 — Payments and history
- [x] Full/partial payments (USD, date paid defaults to today, method, reference, notes)
- [x] Cycle paid → next due date advances; one-time → COMPLETED; partial → PARTIALLY_PAID
- [x] Edit/delete (ADMIN/FINANCE) with recalculation + AuditLog
- [x] History: 10 per page, search, sort (paid newest/oldest, amount), filters (date range, company, category), USD total

## Phase 6 — Notifications
- [x] `docs/NOTIFICATIONS.md` updated
- [x] Scheduler, reminder hour, default offsets + weekly follow-ups, stop on pay/archive/mute, catch-up, quiet hours
- [x] Deterministic dedupe key with unique constraint (insert-then-send), safe with concurrent workers
- [x] Recipients: all members minus mutes / disabled channels
- [x] Digest above 3 reminders (one push + one email)
- [x] Push (chunks, tickets, receipts, DeviceNotRegistered, retries ≤ 5) + email fallback + IN_APP
- [x] Copy in the brief's style, USD, "Company · Subscription"; payment notices don't name the recorder
- [x] Mobile: permission after first subscription, token registration, Android channels, deep link to subscription, toasts, settings + test notification
- [~] Push on a physical device not verified (needs the owner's Expo/Firebase accounts)
- [x] Year-long simulation on a test-only fixture: right days, recipients, no duplicates, stop after payment, catch-up, digest, timezone

## Phase 7 — Screens, dashboard, calendar, reports
- [x] Onboarding, auth, workspace setup (name, type, timezone, first company)
- [x] Dashboard: greeting + switcher, human headline, summary cards (USD), needs attention, 30-day timeline by due date, monthly trend, by category, **by company**, quick actions, pull-to-refresh, empty state
- [x] Subscriptions list: search + Sort + Filter, active chips, due-date order, 10 per page with load more
- [x] Add/Edit, Detail (countdown, schedule, masked key with Show/Copy, history), Record payment + success animation
- [x] Calendar, Alerts, History, Reports (PDF/Excel, by company), Settings (Profile, Workspace, Companies, Categories, Team, Notifications, Security, Dark mode, Help)
- [x] Skeletons, empty states, error + retry, offline banner, persisted cache

## Phase 8 — Testing, hardening and deployment
- [x] Backend integration tests for every route, roles, isolation, pagination, sorting/filtering (route sweep included)
- [x] Mobile component tests (search/sort/filter, date quick picks, rows, forms) + `docs/QA_CHECKLIST.md`
- [x] No hardcoded/mock data: `npm run check:no-sample-data`; database holds only default categories after setup (`npm run db:check-empty`, test)
- [x] Security tests: keys encrypted in the DB, never in logs/notifications/emails/audit log, masked for VIEWER; auth rate limits; strict validation; HTTPS-only API in production; no secrets in the mobile bundle (only `EXPO_PUBLIC_API_URL`)
- [x] `backend/Dockerfile` (multi-stage, SQLite on `/data` by default, Postgres build arg, migrations on start)
- [x] `render.yaml` (Starter + 1 GB disk), `backend/railway.json`, `eas.json` (development, preview APK, production AAB), DueOra / `com.dueora.app` / icons & splash
- [x] `docs/DEPLOYMENT.md` rewritten
- [~] Docker image not built locally (Docker isn't installed); Android bundle export blocked locally by OneDrive placeholders in `node_modules` (DECISIONS D23)

## Phase summaries

### v2 rework (3 Nov 2026) ✅
- **Backend** (`feat(backend): rework API around subscriptions, companies and USD`): Obligation → Subscription,
  Organization → Workspace; companies; USD cents; three roles; encrypted subscription keys with a reveal
  endpoint and exact-key search; `calculateNextDueDate`/`advance`; server-side pages of 10 with sort and
  filters for subscriptions and history; attachments, storage, currencies, departments, assignees and the demo
  seed removed; notifications to all members with "Company · Subscription" USD copy.
- **Mobile** (`feat(mobile): rework app around subscriptions, companies and USD`): Subscriptions tab with
  SearchBar/Sort/Filter/chips and load more; new form with auto due dates and quick picks; masked key with
  Show/Copy; USD everywhere; Companies screen; Workspace settings; three-role Team screen; dashboard and
  reports by company; viewers get a read-only app.
- **Hardening & docs**: SQLite production image with a persistent disk, categories-only seeding at start,
  data and sample-data checks, deployment guide, API reference, notifications design, QA checklist, UI map.
- **Tests:** backend 439 (incl. the year simulation and key-security suite), mobile 130. Lint and type-check
  clean (mobile type-check also needs Expo's generated route types refreshed — restart `expo start` once).

---

# Master prompt — remaining work (audit 10 Nov 2026)

Audit of the code against `DUEORA_MASTER_PROMPT` (the new single source of truth). `[x]` exists and works ·
`[ ]` missing · `[!]` broken or contradicts the master prompt.

## Part 0 — Product rules
- [x] Subscriptions core; companies with "+ New company"; categories with icons; no projects/platforms; USD cents
- [x] Auto dates + quick-pick chips; no ownership fields; no attachments; due-date sort; 10/page; search + Sort + Filter + chips
- [x] Subscription key AES-256-GCM, masked, Show/Copy, reveal ADMIN/FINANCE only, HMAC exact search
- [x] Light mode default; Light/Dark/System in Settings > Appearance
- [x] Hardcoded sample names removed from backend comments/tests; API default timezone is UTC (the app sends the phone's)
- [x] Default categories: 11 seeded (was 9; master prompt lists 11 (adds Utilities, Transport, Education & training; "Communication & internet")
- [ ] Gentle pulse on overdue rows; smooth list transitions (check animation on payment exists)

## Part 1 — Core app
- [x] Register, login, logout, refresh, forgot/reset, profile; workspace create/switch/settings; companies; invites; 3 roles
- [x] Email verification: optional, non-blocking (D26)
- [x] User.locale, User.deletedAt; Workspace.aiEnabled
- [x] Subscription: autoRenew, isTrial, trialEndsOn, defaultPaymentMethod (form toggles + payment method default)
- [x] Scheduling engine (≥ 95% coverage) — [ ] TRIAL/auto-renew helper dates
- [x] Payments full/partial, advance, COMPLETED, edit/delete + audit
- [x] PriceChange model + price history on detail
- [x] Bulk import (CSV/Excel template, mapping, preview, import)
- [x] Budgets (workspace / per category) — dashboard bar in Part 3
- [x] Reports monthly/annual/outstanding/overdue/category/company/12-month forecast + PDF/Excel
- [x] Data export (Excel/JSON), delete account, logout from all devices

## Part 2 — Notifications
- [x] REMINDER / DUE_TODAY / OVERDUE / PAYMENT_RECORDED / digest, dedupe key, catch-up, quiet hours, retries, receipts, email fallback, in-app
- [x] Types TRIAL_ENDING, AUTO_RENEW_NOTICE, PRICE_CHANGE, BUDGET_ALERT, WEEKLY_DIGEST, MONTHLY_SUMMARY, TEAM
- [x] PAYMENT_RECORDED goes to ADMIN + FINANCE only (D27)
- [x] Dedupe key `workspace:subscription:type:cycle:offset:user:channel` everywhere (7 parts, tested)
- [x] ReminderSnooze; NotificationPreference inApp/weeklySummary/monthlySummary/budgetAlerts/teamActivity
- [x] Push action buttons (Mark as paid / Snooze / Open), channels reminders/overdue/digest/team, app badge, local backup reminders, denied-permission banner, unregister on logout
- [~] Push on a physical device still to be verified with the owner's Expo/Firebase accounts (Part 7)
- [x] Email unsubscribe/preferences link (signed one-click link)
- [x] Tests: year in 3 timezones + trial, auto-renew, budget, weekly/monthly summaries, snooze, backups

## Part 3 — Screens & UX
- [x] Splash, onboarding (first launch), welcome, auth, workspace setup, 5-slot tab bar with raised "+", bell in header
- [x] Dashboard cards, needs attention, timeline, trend, category donut, by company, quick actions, pull-to-refresh
- [x] Dashboard: templated greeting, budget progress, Record payment quick action, 3×2 quick actions
- [ ] Dashboard: AI insight card, "Ask AI" quick action, sparkle button (Part 4)
- [x] Detail: price history, snooze; Settings: Budgets, Language, Import, Data & privacy, About (version, legal links), "View intro again"
- [ ] Settings → DueOra AI (Part 4)
- [~] i18n (i18next) set up with language picker; main screens in English/French/Kinyarwanda; other screens still English inline (see docs/TRANSLATIONS.md)
- [x] Alerts: Today / This week / Earlier grouping, swipe to mark read
- [x] Help: FAQ from the shared knowledge base (`/help/articles`), search, "Send feedback" stored in backend

## Part 4 — DueOra AI
- [ ] Everything: `@google/genai` backend, streaming `/ai/chat`, tools, confirmations, memory, feedback, usage, rate limit, insights, knowledge base, eval tests, chat UI

## Part 5 — Security & monitoring
- [x] Rate limits, zod, HTTPS, route sweep, isolation, key security, bundle scan
- [ ] Sentry (backend + mobile, env-driven, off without DSN); tests for export/deletion

## Part 6 — Deploy
- [x] Dockerfile, render.yaml, railway.json, DEPLOYMENT.md
- [!] Production on SQLite (D14); master prompt asks managed PostgreSQL → switch production to Postgres (D25)
- [ ] Legal pages (`docs/legal/`), live `/health` (needs the owner's hosting account)

## Part 7 — APK
- [x] Name, package, icons, splash, EAS profiles — [ ] expo-updates channel `preview`, versionCode, GitHub Release, QR code, `docs/INSTALL.md`

## Part 8 — Play Store prep
- [ ] `docs/PLAY_STORE.md`

---

# Finalize — remaining work (audit 11 Nov 2026)

Audit against the **Finalize** brief (company-based bills, tracking, reports and notifications; it wins over the
master prompt where they differ) and the master prompt. `[x]` exists and works · `[ ]` missing · `[!]` broken or
contradicts the brief. `DUEORA_MASTER_PROMPT.md` is not in the repo; the master-prompt audit above (10 Nov) is
used as its summary.

## State at the start
- Backend 616 tests, mobile 153, lint and type-check clean. The uncommitted DueOra AI work (master prompt Part 4)
  was complete and passing; committed on its own (`feat(ai): …`) before this work started.
- [!] `npm run check:no-sample-data` fails: the AI system prompt's formatting example uses a design amount ($1,523.00).

## Part 1 — "Subscription" → "Bill"
- [x] Model `Subscription`, enum `SubscriptionStatus`, columns `subscriptionId`, `mutedSubscriptionIds`, the
      `subscriptionKey*` columns, routes `/subscriptions`, services, mobile types/hooks/screens, tab label,
      notification/email copy, report labels, AI prompt/tools/knowledge base, en/fr/rw strings all say "subscription".
      Done in `fb41a4d refactor: rename Subscription to Bill` (model is now `Bill`).
- [x] Subscription key → bill's optional "Reference / account number" (named `accountReference` in code because
      payments already have a `reference` field), same encryption, masking, reveal rules.

## Part 2 — Companies
- [x] Company: name, colour, archivedAt; create/rename/colour/archive/unarchive; delete only when unused.
- [x] DELETE on a company with bills is refused (409 `HAS_BILLS`); archive is its own action. Admins only (D35).
- [x] Short name/initials, description, per-company reminder offsets and hour, monthly budget (stored and edited;
      the reminder planner using the per-company offsets/hour is Part 7).
- [~] Company detail screen: Overview, Members, Settings. Bills opens the Bills list on that company; Categories and
      "category start options at creation" wait for Part 3.
- [x] Global company switcher on Home, Bills, Calendar, Reports (and report exports), remembered per workspace on
      the device.
- [ ] "All companies" breakdown tables per the brief (dashboard and reports already have `byCompany`; the new
      views are Parts 5–6).
- [x] `CompanyAccess` (FINANCE | VIEWER per company) or all companies; the admin picks them when inviting or editing
      a member. Enforced in lists, details, dashboard, calendar, reports, exports, history/search, payments,
      import, budgets, AI tools/insight/chat context and notifications (reminders, events, summaries).
      `test/companyAccess.test.ts` covers isolation.

## Part 3 — Categories per company, custom fields
- [x] Categories belong to a company (D36): no seeded or hardcoded categories; suggestions in
      `backend/src/config/categorySuggestions.ts`.
- [x] `Category.companyId`, icon picker, one level of sub-categories, description, bill defaults (frequency, amount
      type, offsets, payment method), sort order/reorder, archive, merge, move-then-delete.
- [x] "Start empty / pick from suggestions / copy from another company" when creating a company.
- [x] Bill form: only the selected company's categories, "+ New category" inline; category defaults applied.
- [x] Data migration: per-company copies of used categories, bills and category budgets re-pointed, globals
      dropped (SQLite and Postgres, verified with sample data).
- [x] Custom fields (≤ 10 per company; text/number/date/dropdown; all bills or chosen categories; required) on the
      form, detail, filters/search and exports (D37).
- [x] Company detail screen: Categories tab.

## Part 4 — Variable amounts, bill cycles, occurrences
- [x] `amountType` FIXED | VARIABLE, estimate, "set this cycle's amount", "Paid in full" (D38).
- [x] `BillCycle` table: per-cycle amount / paid / closed; history stays exact when the amount changes.
- [x] Cycle engine `backend/src/domain/cycles.ts` (closed, current, missed, future; per-cycle amounts).
- [x] Fixed: a recurring bill unpaid for several cycles now owes every missed cycle (overdue counts and totals).

## Part 5 — Tracking views
- [x] Views computed by the backend (`GET /views/:view`): Upcoming (7/30/60/90), This month (total/paid/left),
      Next month, Outstanding, Overdue (days overdue, ageing), Paid, Obligations with the next reminder.
- [x] Dashboard: outstanding card, "Last month at a glance", cash flow (6 past + 3 projected months), this month by
      company.
- [x] Bills tab segments (Upcoming · This month · Next month · Overdue · Outstanding · Paid · All); filters for amount
      type and sub-categories; rows with "estimated", days late and next reminder.
- [x] Calendar follows the company switcher.

## Part 6 — Reports
- [x] Company selector; payment report (on time vs late, still unpaid, estimated vs actual, by method, vs the
      period before, table per company); this month / next month (views); outstanding & overdue ageing; upcoming
      30/60/90; annual; category report with sub-categories.
- [x] Exports per company or all (one sheet per company), with company, period, generated date and custom fields.

## Part 7 — Notifications
- [x] Recipients follow company access.
- [x] Copy names the company ("⏰ {Company} · {Bill} …"; summaries list companies).
- [x] Per-company reminder offsets (new bills) and hour (own run scope); monthly report ready + this month's
      obligations; next-month preview (25th); variable amount needed (5 days before); outstanding per company in the
      weekly digest (D40).
- [x] Per-company notification preferences (reminders / events / summaries; all off = muted).
- [x] Year-long simulation with several companies, a restricted member, a variable bill and the new notifications
      (`test/notifications.companies.test.ts`).

## Part 8 — AI, verification, release
- [x] DueOra AI (tools, proposals, insights, offline evals).
- [x] AI follows company access (tools, proposals, chat context, daily insight).
- [x] AI understands companies, sub-categories, variable bills and the new views: new tools `get_view`,
      `get_last_month_report` and `propose_set_cycle_amount`; `propose_create_category` takes a company and
      sub-categories; eval cases added.
- [x] `docs/FEATURE_STATUS.md`.
- [ ] Maestro flows in `mobile/e2e/` (Maestro is not installed on this machine).
- [ ] Version 1.1.0, production deploy + migration, APK, GitHub Release v1.1.0, `docs/INSTALL.md` + QR, EAS Update.
      Blockers found: no production backend is deployed yet (no hosting account connected), `gh` CLI and Maestro
      are not installed, and there is no Android emulator on this machine.

---

# Session 17 Nov 2026

## Status check (session start)

`CLAUDE.md`, `DUEORA_FINALIZE_PROMPT.md` and `DUEORA_MASTER_PROMPT.md` are not in the repo or on this machine; the
audits above (10 and 11 Nov) are used as their summary. One uncommitted change (`expo-dev-client` for the
development build profile) was sound and committed (`4159181`).

**Checks:** backend lint ✓, type-check ✓, tests **704/704** ✓ · mobile lint ✓, type-check ✓, tests **162/164**
in the full run — the 2 failures are timeouts in `listControls.test.tsx` on this OneDrive disk; the file passes
5/5 when run alone (flaky, not a bug).

**Finalize brief**
- Done: Part 1 (Bill rename), Part 2 (companies, access), Part 3 (categories per company, custom fields),
  Part 4 (variable amounts, cycles), Part 5 (tracking views), Part 6 (reports), Part 7 (notifications),
  Part 8 AI work and `docs/FEATURE_STATUS.md`.
- Half-done: Part 8 release — version is already 1.1.0 and EAS profiles exist, but no production backend,
  no `EXPO_PUBLIC_API_URL` in EAS, no APK, no GitHub Release, no QR, no `docs/INSTALL.md`.
- Not started: Maestro flows (`mobile/e2e/`), progress page, GitHub Pages, progress workflow.

**Master prompt leftovers**
- Not started: Sentry (only `SENTRY_DSN` in env), legal pages (`docs/legal/`), `docs/PLAY_STORE.md`,
  gentle pulse on overdue rows.
- Decision pending: production database SQLite (D14) vs managed Postgres (D25).
- Half-done: i18n (main screens only), push on a physical device unverified.

**Tooling:** EAS CLI logged in (`anitha_dev`), `gh` not installed (installing), Docker / Maestro / Android
emulator not installed.

## Waiting on Anii

1. Log in the GitHub CLI once: type `! & "$env:LOCALAPPDATA\gh-cli\bin\gh.exe" auth login` in Claude Code (choose GitHub.com → HTTPS → browser). Needed to switch on GitHub Pages and create the v1.1.0 Release.
2. Hosting for the backend: create a Render account and deploy the `render.yaml` blueprint (Starter + 1 GB disk, about US$7.25/month) — or say which host to use. `docs/DEPLOYMENT.md` §4. This blocks the APK.
3. Decide the production database: SQLite on Render's disk (ready now, D14) or managed Postgres (D25).
4. Secrets on the host: `RESEND_API_KEY` + a verified sending domain (`EMAIL_FROM`), `GEMINI_API_KEY`, `EXPO_ACCESS_TOKEN`, optional `SENTRY_DSN`. (`JWT_ACCESS_SECRET` and `ACCOUNT_REF_SECRET` Render generates.)
5. Firebase project for Android push: upload `google-services.json` to EAS as the `GOOGLE_SERVICES_JSON` file variable.
6. Later, for the Play Store only: a Google Play Console account (US$25) — see `docs/PLAY_STORE.md`.

## Done this session (17 Nov 2026)
- [x] Sentry on the backend (`SENTRY_DSN`, off when empty; events scrubbed of bodies, headers, query, user) — `76f7135`
- [x] Legal pages `docs/legal/privacy.html` + `terms.html` (the URLs the app already links to); `docs/PLAY_STORE.md` — `d57fb96`
- [x] Maestro flows in `mobile/e2e/` (written, not run: no emulator) — `b5522de`
- [x] `docs/FEATURE_STATUS.md` rebuilt as one row per feature (Part, area, status, proof)
- [x] `scripts/progress.ts` + `npm run progress` → `docs/progress/index.html`, `data.json`, `test-results.json`, the install page `docs/index.html` and `docs/install-qr.png`
- [x] `.github/workflows/progress.yml`: runs the tests and deploys `docs/` to GitHub Pages on every push to `main`
- [x] `docs/INSTALL.md` (WhatsApp-sized); `render.yaml` now asks for `GEMINI_API_KEY` and `SENTRY_DSN`
- [x] Overdue pulse was already in `StatusBadge` (reduced-motion aware)
- [ ] GitHub Pages switched on — needs `gh auth login`
- [ ] Backend deploy → APK → GitHub Release v1.1.0 — needs hosting (see Waiting on Anii)
