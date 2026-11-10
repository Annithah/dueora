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
- [ ] Types TRIAL_ENDING, AUTO_RENEW_NOTICE, PRICE_CHANGE, BUDGET_ALERT, WEEKLY_DIGEST, MONTHLY_SUMMARY, TEAM
- [x] PAYMENT_RECORDED goes to ADMIN + FINANCE only (D27)
- [x] Dedupe key includes `type` for event notifications (reminders: Part 2)
- [ ] ReminderSnooze; NotificationPreference weeklySummary/monthlySummary/budgetAlerts/teamActivity
- [ ] Push action buttons (Mark as paid / Snooze / Open), channels overdue/digest/team, app badge, local backup reminders, denied-permission banner, unregister on logout (check)
- [x] Email unsubscribe/preferences link (signed one-click link)
- [ ] Tests for trial, budget, weekly/monthly summaries, snooze, multiple timezones

## Part 3 — Screens & UX
- [x] Splash, onboarding (first launch), welcome, auth, workspace setup, 5-slot tab bar with raised "+", bell in header
- [x] Dashboard cards, needs attention, timeline, trend, category donut, by company, quick actions, pull-to-refresh
- [ ] Dashboard: budget progress, AI insight card, "Ask AI" quick action, sparkle button
- [ ] Detail: price history, snooze; Settings: Budgets, Language, Import, Data & privacy, DueOra AI, About (version, legal links), "View intro again"
- [ ] i18n (i18next): English complete, French + Kinyarwanda main screens, `docs/TRANSLATIONS.md`
- [ ] Alerts: Today / This week / Earlier grouping, swipe to mark read (check)
- [ ] Help: FAQ shared with AI knowledge base, "Send feedback" stored in backend

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
