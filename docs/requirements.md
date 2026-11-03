# DueOra — Requirements

> Source: the owner's build brief (v2, Phases 0–8). This file is the source of truth for features.
> The UI source of truth is the Figma prototype (https://rouge-warm-77431112.figma.site/), captured in
> `design/` and mapped in `docs/UI_MAP.md`. Where the prototype and this file disagree, this file wins.
> Engineering decisions the brief doesn't settle are in `DECISIONS.md`.

## 1. Product

**DueOra** — "Your dues, on time." A mobile app that helps people and companies track their recurring
subscriptions and payments (hosting, domains, software, internet, rent, insurance, utilities), get reliable
reminders before due dates, record payments, and see everything on one dashboard.

## 2. Product decisions

1. **Subscriptions are the core item.** Everything the user pays is a "Subscription" (code and UI).
2. **Choose company.** A workspace can contain several companies. Every subscription belongs to exactly one
   company, chosen from a dropdown when adding it. Users can add and rename companies; a company with
   subscriptions is archived instead of deleted.
3. **Choose category.** Every subscription has one category from a list (defaults + custom).
4. **No projects or platforms** — only Company and Category.
5. **US dollars only.** No currency selection, conversion or multi-currency. Amounts are integer cents,
   displayed like `$1,523.00`.
6. **Automatic dates.** Start date defaults to today. The next due date is calculated from the start date and
   frequency (editable). After a payment completes a cycle, the next due date moves forward automatically.
   Date fields have quick-pick chips: Today, +1 week, +1 month, +3 months, +1 year.
7. **No ownership details** — no "assigned to", owner, department or "created by" in the UI or model.
8. **No attachments** — no receipts, uploads or file storage anywhere.
9. **Sorted by due date** — every subscription list defaults to next due date, soonest first (overdue on top).
10. **10 per page** — server-side pagination with load more / infinite scroll.
11. **Sort and Filter buttons next to search** on the subscriptions and history screens. Sort: due date
    soonest/latest, amount high/low, name A–Z, recently added. Filter (bottom sheet): status, company,
    category, frequency, due-date range. Active filters show as removable chips.
12. **Real data only.** The app shows only database data via the API. No demo data in the app or databases;
    the only seed is the default categories. Fixtures only inside automated tests with an isolated database.
13. **Subscription key** (optional): license key, account number, customer ID or plan ID. Encrypted at rest
    (AES-256-GCM, secret `SUBSCRIPTION_KEY_SECRET`), never logged or put in notifications/emails, shown masked
    (`••••••4F7A`) with Show and Copy buttons; the plain value goes only to ADMIN and FINANCE (VIEWER sees the
    masked value). Subscriptions are searchable by key.

## 3. Roles

| Role | Can |
|---|---|
| ADMIN | Everything |
| FINANCE | Manage subscriptions, payments and reports; cannot manage members |
| VIEWER | Read-only; receives reminders |

One workspace can never read or modify another workspace's data.

## 4. Data model (summary)

User · Workspace (type COMPANY/PERSONAL, IANA timezone default Africa/Kigali, reminderHour default 9, quiet
hours) · Membership (role) · Company · Category (defaults: Technology & software, Hosting & domains,
Communication & internet, Social media, Office & rent, Insurance, Marketing, Utilities, Other) ·
Subscription (company, category, name, provider?, description?, encrypted key + last4 + search hash,
amountCents, frequency unit/interval, anchorDay, startDate, nextDueDate, reminderOffsets, status
ACTIVE/ARCHIVED/COMPLETED) · PaymentRecord (cycleDueDate, amountCents, paidOn, method, reference?, notes?) ·
DeviceToken · NotificationPreference · Notification (in-app + delivery log, unique dedupeKey) · AuditLog
(internal only). Full schema: `backend/prisma/schema.prisma`.

Due dates are dates without time. Money is integer cents. Every query is scoped by workspace.

## 5. Features by phase

- **Phase 0–2 — Foundation & setup:** monorepo, lint/format/strict TS, env validation, error handling,
  logging, `/health`, `/api/v1`, Prisma schema + migration, categories-only seed, Expo Router tabs (Home,
  Subscriptions, Calendar, Alerts, More) with a floating "+", API client with token refresh, TanStack Query.
- **Phase 1 — Design foundation:** UI map, light/dark theme tokens, Plus Jakarta Sans, reusable components
  (incl. DateField with quick picks, SearchBar with Sort/Filter, SortSheet, FilterSheet), original
  illustrations and Lottie success animation.
- **Phase 3 — Auth, workspace, companies, roles:** register, login, logout, refresh, forgot/reset password
  (email code), email verification, profile; create workspace (Company/Personal), settings, switch; companies;
  invites and roles; isolation tests.
- **Phase 4 — Subscriptions & scheduling engine:** CRUD, archive/unarchive, custom categories, list endpoint
  with page/limit/sort/q/status/companyId/categoryId/frequency/dueFrom/dueTo; pure engine
  (`calculateNextDueDate`, `advance`, `computeStatus`, `reminderDates`) with month-end and leap-year handling,
  "today" in the workspace timezone; > 95% coverage.
- **Phase 5 — Payments & history:** full/partial payments, automatic cycle advance, one-time → COMPLETED,
  edit/delete with recalculation and audit log, history with search/sort/filters, 10 per page.
- **Phase 6 — Notifications:** 15-minute scheduler, workspace-local reminder hour, default offsets
  30/14/7/3/1/0 then 1/3/7 days after and weekly, stop on pay/archive/mute, catch-up, quiet hours,
  deterministic dedupe keys, all members as recipients, digests above 3, Expo push (chunks, receipts, token
  deactivation, retries) + Resend email + in-app; human USD copy; mobile permission flow, Android channels,
  deep links, toasts, settings with test notification; a year-long simulation test.
- **Phase 7 — Screens:** onboarding, auth, workspace setup, dashboard, subscriptions list, add/edit, detail
  (masked key with Show/Copy), record payment with success animation, calendar, alerts, history, reports (PDF
  & Excel), settings; skeletons, empty states, error/retry, offline banner, persisted query cache.
- **Phase 8 — Hardening & deployment:** integration tests for every route, roles, isolation, pagination and
  sorting/filtering; component tests; QA checklist; no-sample-data check; key-security tests; rate limiting;
  HTTPS-only API in production; Dockerfile with migrations on deploy; always-on hosting; EAS profiles
  (development, preview APK, production AAB); deployment guide.
- **Phase 9 — Play Store publishing:** not in scope yet.

## 6. Design system

Primary deep teal `#0F5C5C`, accent warm amber `#F2A33A`, light background `#F7F8FA`, dark background
`#0E1414` with cards `#172121`. Status (always icon + label): Paid `#22A06B`, Upcoming `#3B82F6`, Due soon
`#F59E0B`, Due today `#EA580C`, Overdue `#DC2626`, Partially paid `#7C3AED`. 8pt spacing, 16px card radius,
soft shadows, 44px touch targets, 4.5:1 contrast. Lucide line icons with a colourful rounded badge per
category; original illustrations; micro-animations; warm, human copy with light emoji.
