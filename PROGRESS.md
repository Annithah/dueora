# DueOra — Progress

Legend: `[x]` done · `[ ]` to do · `[~]` partially done / blocked (see note)

## Phase 0 — Foundation
- [x] Repo structure (`mobile/`, `backend/`, `docs/`, `design/`)
- [x] Root README (description + setup)
- [~] `docs/requirements.md` present — waiting for the owner to add it (and `design/` screenshots)
- [x] ESLint, Prettier, TypeScript (strict) configs for both apps
- [x] `.editorconfig`, `.gitignore`, `.env.example` (both apps)
- [x] `docker-compose.yml` with Postgres 16 (for production parity; dev uses SQLite — see DECISIONS.md)
- [x] Lint / type-check / tests pass, commit

## Phase 1 — Design implementation foundation
- [ ] Study `design/` screenshots, write `docs/UI_MAP.md`
- [ ] Theme tokens (light/dark), typography (Plus Jakarta Sans)
- [ ] UI components: Button, Input, Select, DatePicker field, Chip, StatusBadge, Card, ListItem, BottomSheet, EmptyState, Skeleton, Avatar, CategoryIcon, AmountText, Countdown ring, Toast
- [ ] Illustrations (onboarding, empty states) and Lottie assets (success)
- [ ] Lint / type-check / tests pass, commit

## Phase 2 — Project setup
- [ ] Expo Router: tabs (Home, Payments, Calendar, Alerts, More) + floating "+", auth stack, onboarding stack
- [ ] Express skeleton: zod env config, error handler, request logging, `/health`, `/api/v1`
- [ ] Prisma schema, first migration, seed script
- [ ] Mobile API client (token refresh) + TanStack Query provider
- [ ] Lint / type-check / tests pass, commit

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
