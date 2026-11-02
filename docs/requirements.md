# DueOra — Requirements

> Source: the owner's build brief (Phases 0–8). This is the source of truth for features.
> The UI source of truth is the Figma prototype (https://rouge-warm-77431112.figma.site/),
> captured as screenshots in `design/` and mapped in `docs/UI_MAP.md`.
> If the owner provides a fuller requirements document, it replaces this file.

## 1. Product

**DueOra** — "Your dues, on time." A mobile app that helps companies and individuals track recurring
payments and renewals (hosting, domains, subscriptions, rent, insurance, utilities), get reliable
reminders before due dates, record payments, and see everything on one dashboard.

Users: companies (multi-member workspaces with roles) and individuals (personal workspaces).

## 2. Tech stack

**Mobile (`mobile/`)** — Expo (latest SDK) + React Native + TypeScript, Expo Router; TanStack Query
(server state), Zustand (client state); react-hook-form + zod; expo-notifications, expo-secure-store,
expo-image-picker / expo-document-picker; date-fns + date-fns-tz, react-native-calendars,
react-native-gifted-charts (or victory-native); lucide-react-native, react-native-reanimated,
lottie-react-native; font Plus Jakarta Sans.

**Backend (`backend/`)** — Node.js 20+, Express, TypeScript; PostgreSQL + Prisma; zod, helmet, cors,
express-rate-limit, pino; JWT access tokens (15 min) + rotating refresh tokens stored hashed, argon2;
background jobs (Postgres-backed, no Redis); expo-server-sdk push; Resend email; S3-compatible storage
(Cloudflare R2) with a local-disk driver for development; pdfkit + exceljs reports; Vitest + supertest;
Docker + docker-compose for local Postgres.
(Deviations agreed with the owner are recorded in `DECISIONS.md`.)

## 3. Design system

- Primary deep teal `#0F5C5C`; accent warm amber `#F2A33A`.
- Light background `#F7F8FA`; dark background `#0E1414`, dark cards `#172121`.
- Status colours, always with icon + label (never colour alone):
  Paid `#22A06B` · Upcoming `#3B82F6` · Due soon `#F59E0B` · Due today `#EA580C` · Overdue `#DC2626` · Partially paid `#7C3AED`.
- 8pt spacing, 16px card radius, soft shadows, 44px minimum touch targets, 4.5:1 contrast.
- All tokens in one theme file; light and dark mode from day one.
- Human feel: lucide line icons, each category with its own colourful rounded icon badge
  (hosting = teal server, domain = blue globe, internet = purple wifi, rent = amber house);
  friendly original SVG illustrations for onboarding and every empty state; micro-animations
  (check animation on payment recorded, gentle pulse on overdue badges, smooth list transitions);
  warm copy ("Good morning, Anitha 👋", "All caught up — nothing due this week 🎉",
  "KigaliToday hosting is due in 3 days"); light tasteful emoji; company logo/avatar in header;
  initials avatars for team members.

## 4. Data model

- **User**: id, name, email (unique), phone?, passwordHash, avatarUrl?, emailVerifiedAt?, createdAt
- **Organization** (workspace): id, name, type (COMPANY | PERSONAL), logoUrl?, defaultCurrency,
  timezone (IANA, default Africa/Kigali), reminderHour (default 9), quietHoursStart/End?, createdAt
- **Membership**: userId, organizationId, role (ADMIN | FINANCE | DEPARTMENT | EMPLOYEE), departmentId?
- **Department**: id, organizationId, name
- **Platform** (project/group, e.g. "KT Radio"): id, organizationId, name, color
- **Category**: id, organizationId?, name, icon, color, isDefault. Seed defaults: Technology & software,
  Hosting & domains, Communication & internet, Office, Insurance, Marketing, Utilities, Other
- **Obligation**: id, organizationId, platformId?, categoryId, departmentId?, assigneeUserId?, name,
  provider, description?, amountMinor (integer minor units), currency (ISO 4217),
  frequencyUnit (WEEK | MONTH | YEAR | ONCE), frequencyInterval, anchorDay (keeps month-end dates
  correct), startDate, nextDueDate, reminderOffsets (int days, negative = after due),
  status (ACTIVE | ARCHIVED | COMPLETED), createdBy, timestamps
- **PaymentRecord**: id, obligationId, cycleDueDate, amountMinor, currency, paidOn,
  method (MOBILE_MONEY | BANK_TRANSFER | CARD | CASH | OTHER), reference?, notes?, recordedBy, createdAt
- **Attachment**: id, organizationId, obligationId?, paymentRecordId?, fileKey, fileName, mimeType, size
- **DeviceToken**: id, userId, expoPushToken (unique), platform, lastSeenAt, active
- **NotificationPreference**: userId, organizationId, pushEnabled, emailEnabled, digestEnabled, mutedObligationIds
- **Notification** (in-app + delivery log): id, organizationId, userId, obligationId?,
  type (REMINDER | DUE_TODAY | OVERDUE | PAYMENT_RECORDED | DIGEST | SYSTEM), title, body, data (json),
  cycleDueDate?, offsetDays?, channel (PUSH | EMAIL | IN_APP), status (PENDING | SENT | FAILED | DELIVERED),
  dedupeKey (unique), attempts, error?, readAt?, sentAt?, createdAt
- **AuditLog**: id, organizationId, userId, action, entity, entityId, meta, createdAt

Rules: due dates are dates without time; money is integer minor units, never floats; every query on
business data is scoped by organizationId (enforced in a service/middleware layer and tested).

## 5. Features

### 5.1 Auth, workspaces, roles
- Register, login, logout, refresh, forgot/reset password (email code), email verification, profile update.
- Create workspace (Company or Personal), update company info and logo, switch workspaces.
- Invite members by email (invite token + accept flow), assign roles and departments, remove members.
- Roles: **ADMIN** everything · **FINANCE** manage obligations, payments, reports; cannot manage members ·
  **DEPARTMENT** manage obligations in their department, view others · **EMPLOYEE** view assigned
  obligations, receive reminders.
- One organization can never read or modify another's data (tested).

### 5.2 Obligations and scheduling
- CRUD for obligations, platforms, categories (custom categories allowed); archive/unarchive.
- Frequencies: weekly, every N weeks, monthly, every N months, quarterly, every 6 months, yearly,
  custom, one-time. Month-end handled (anchor 31 → Feb 28/29 → back to Mar 31), leap years.
- Status: UPCOMING | DUE_SOON (≤ 7 days) | DUE_TODAY | OVERDUE | PARTIALLY_PAID | PAID | ARCHIVED.
- "Today" is always computed in the organization's timezone.

### 5.3 Payments and history
- Record a full or partial payment for the current cycle with method, reference, notes, receipt upload.
- Total paid for the cycle ≥ expected → cycle PAID and nextDueDate advances one cycle (one-time →
  COMPLETED). Partial payments keep the cycle open (PARTIALLY_PAID).
- Edit/delete payment (ADMIN/FINANCE) with recalculation and an AuditLog entry.
- History with search and filters (date range, category, provider, platform), paginated.
  History is never lost when a new cycle begins.

### 5.4 Notifications (most important feature — must be reliable)
- Scheduler every 15 minutes; per organization, processes reminders once the org-local time reaches
  reminderHour (default 09:00) and that day's reminders haven't been processed.
- Default offsets (editable per obligation and as org defaults): 30, 14, 7, 3, 1 days before and on
  the due date. Overdue follow-ups 1, 3, 7 days after, then weekly until paid or archived.
- Stop immediately when the cycle is paid, the obligation archived, or the user mutes it.
- Catch-up after downtime: only the most relevant missed reminder per obligation, never a burst.
- Respect quiet hours; deferred messages go out when quiet hours end.
- No duplicates ever: deterministic dedupeKey
  `orgId:obligationId:cycleDueDate:offsetDays:userId:channel` with a unique constraint;
  insert-then-send; conflict → skip; safe with concurrent workers.
- Recipients: assignee + ADMIN + FINANCE (DEPARTMENT members for their department), minus muted users
  and disabled channels.
- Digest: > 3 reminders for a user in one run → one grouped push ("4 payments need attention this
  week") and one digest email instead of many messages.
- Push via expo-server-sdk (chunks, tickets, receipts after ~15 min, deactivate DeviceNotRegistered,
  retry transient errors with exponential backoff, max 5 attempts). Email via Resend as second channel
  and fallback when no active push token; branded mobile-friendly HTML (logo, amount, due date, status
  badge, "Open in DueOra" button). Every notification also stored IN_APP (Alerts tab, unread badge).
- Copy examples: "⏰ KigaliToday hosting is due in 7 days — $1,523 on Tue, 20 Oct." ·
  "📅 Today: KT Radio domain renewal — 18,880 RWF." ·
  "⚠️ Cloudflare (KigaliToday) is 3 days overdue — $240. Tap to record the payment." ·
  "✅ Anitha recorded $132 for KT Radio hosting. Next due: 02 Oct 2028."
- Mobile: ask permission after the first obligation is created (with an explanation screen);
  register/refresh Expo push token on login and app start, unregister on logout; Android channels
  `reminders` (default) and `overdue` (high, distinct sound/vibration); tapping deep-links to the
  payment detail; foreground notifications shown as in-app toast; settings for per-channel toggles,
  digest, quiet hours, reminder hour, and "Send test notification".
- Tests: a full simulated year with a fake clock asserting the exact reminders sent.

### 5.5 Screens
Onboarding (3 slides), auth, workspace setup; Dashboard (greeting + workspace switcher; Overdue / Due
this week / Due this month / Paid this month with per-currency totals and a converted total using an
org-defined exchange rate; Needs attention; 30-day timeline; monthly trend chart; spending-by-category
donut; quick actions; pull-to-refresh); Payments list (search, status chips, grouped by platform);
Add/Edit payment; Payment detail (countdown ring, history timeline, attachments); Record payment
bottom sheet with success animation; Calendar (day/week/month/year, status dots, tap a day); Alerts
(Today / This week / Earlier, mark read, unread badge); History; Reports (monthly, annual,
outstanding, overdue, by category, 12-month forecast) with PDF and Excel export from the backend via
the share sheet; Team & roles; Profile; Company settings; Categories; Notification settings; Security
(change password, optional biometric lock); Dark mode; Help.
Every list: loading skeletons, illustrated empty states, error states with retry, offline banner;
TanStack Query persistence for instant open and read-only offline.

### 5.6 Hardening and deployment
Integration tests for every route (per-role permissions, cross-org isolation); mobile component tests
and `docs/QA_CHECKLIST.md`; rate limiting on auth, input validation everywhere, upload size/type
limits, no secrets in the mobile bundle, HTTPS-only API URL in production; indexes (orgId,
nextDueDate, status, dedupeKey), paginated lists, one aggregated dashboard endpoint; multi-stage
Dockerfile with migrations on deploy; always-on host (Render or Railway) + managed Postgres (Neon or
host's); eas.json (development, preview APK, production AAB), app name DueOra, package
`com.dueora.app`; `docs/DEPLOYMENT.md` step by step.

## 6. Seed data

Organization "Kigali Today Ltd", timezone Africa/Kigali, default currency USD, admin user Anitha.
Platforms "KT Radio" and "KigaliToday".

| Platform    | Service        | Amount     | Cycle  | Next due                |
|-------------|----------------|------------|--------|-------------------------|
| KT Radio    | Hosting        | 132 USD    | yearly | 2027-10-02              |
| KT Radio    | Domain         | 18,880 RWF | yearly | 2027-02-26              |
| KT Radio    | X subscription | 48 USD     | yearly | 2027-09-16              |
| KigaliToday | Hosting        | 1,523 USD  | yearly | 2026-10-20 (overdue)    |
| KigaliToday | Domain         | 22 USD     | yearly | 2027-08-24              |
| KigaliToday | Cloudflare     | 240 USD    | yearly | 2026-01-30 (overdue)    |

Plus monthly/weekly demo items (internet, office rent, weekly cleaning service) so every frequency is
exercised.

## 7. Out of scope (for now)
Play Store publishing (Phase 9).
