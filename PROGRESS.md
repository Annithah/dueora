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
- [ ] Register, login, logout, refresh, forgot/reset password, email verification, profile update
- [ ] Workspaces: create, update info/logo, switch
- [ ] Invites, roles, departments, remove members
- [ ] Role permissions (ADMIN / FINANCE / DEPARTMENT / EMPLOYEE)
- [ ] Cross-organization isolation tests
- [ ] Lint / type-check / tests pass, commit

## Phase 4 — Obligations and scheduling engine
- [ ] CRUD obligations, platforms, categories; archive/unarchive
- [ ] `domain/schedule.ts`: nextDueDate, computeStatus, reminderDates (org timezone)
- [ ] Exhaustive engine tests (>95% coverage)
- [ ] Lint / type-check / tests pass, commit

## Phase 5 — Payments and history
- [ ] Record full/partial payment with receipt upload
- [ ] Cycle completion → advance nextDueDate / COMPLETED
- [ ] Edit/delete payment (ADMIN/FINANCE) + recalculation + AuditLog
- [ ] History endpoint: search, filters, pagination
- [ ] Lint / type-check / tests pass, commit

## Phase 6 — Notifications
- [ ] `docs/NOTIFICATIONS.md`
- [ ] Scheduler (15-min cron, org-local reminder hour, catch-up, quiet hours)
- [ ] Dedupe keys with unique constraint (insert-then-send)
- [ ] Recipients resolution + mutes/channel prefs
- [ ] Digest grouping (>3 reminders)
- [ ] Push (expo-server-sdk, receipts, token deactivation, retries) + email (Resend) + IN_APP
- [ ] Mobile: permission flow, token registration, Android channels, deep links, foreground toast, settings
- [ ] Year-long fake-clock simulation test
- [ ] Lint / type-check / tests pass, commit

## Phase 7 — Screens, dashboard, calendar, reports
- [ ] Onboarding, auth, workspace setup
- [ ] Dashboard (aggregated endpoint)
- [ ] Payments list, add/edit, detail, record-payment sheet
- [ ] Calendar
- [ ] Alerts
- [ ] History, Reports (PDF/Excel export)
- [ ] Team, Profile, Company, Categories, Notification settings, Security, Dark mode, Help
- [ ] Skeletons, empty/error states, offline banner, query persistence
- [ ] Lint / type-check / tests pass, commit

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
