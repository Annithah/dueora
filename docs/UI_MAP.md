# UI Map

Screens from the Figma prototype (https://rouge-warm-77431112.figma.site/), captured in `design/`
(`design/prototype-styles.css` keeps the exact sizes and tokens). Route names are Expo Router paths under
`mobile/src/app/`. The prototype calls things "payments"; the app calls them **subscriptions** (build brief).

## Dropped or changed from the prototype (product decisions)

| Prototype element | In the app |
|---|---|
| "Payments" tab, "Add payment", "Payment detail" | **Subscriptions** tab, Add/Edit subscription, Subscription detail |
| Project / platform field and per-platform grouping | Removed. Every subscription has one **Company** (dropdown with "+ New company") and one **Category** |
| Currency button, currency selects, "secondary currency" totals, exchange rates | Removed. **US dollars only**, shown like $1,523.00 |
| "Assigned to", owner, department, "created by", "Employee preview" | Removed (no ownership anywhere) |
| Attachments, "Upload receipt", camera receipt, logo upload | Removed (no files at all) |
| Company logo in header / workspace setup | Initials avatar only |
| Status chips row on the list | Replaced by **Sort** and **Filter** buttons beside search, with removable active-filter chips |
| Grouped list | One list sorted by next due date (overdue first), 10 per page with load more |
| "Design system" entry in More | Notification settings |
| Roles Admin / Finance / Department / Employee | **Admin / Finance / Viewer** |

## Navigation overview

```
Splash ──► Onboarding (3 slides) ──► Sign up ─► Verify email ─► Workspace setup ─► Invite team ─► Main tabs
                     └─ "Log in" ─► Login ─┬─► Main tabs
                                           └─► Forgot password ─► (email code) ─► Reset password

Main tabs: Home · Subscriptions · [ + FAB, hidden for viewers ] · Calendar · Alerts · More
  FAB / "Add" ─────────────────► Add subscription (modal)
  any subscription row ────────► Subscription detail ─► Record payment (bottom sheet) ─► Success
                                                     └► Edit subscription
  More ─► Profile · Workspace · Companies · Categories · Payment history · Reports · Team & roles ·
          Notifications · Security · Dark mode · Help · Log out
  Notification tap (push) ─────► Subscription detail (deep link dueora://subscriptions/:id)
```

## Screens

| # | Screen | Screenshot | Route | Key elements |
|---|--------|------------|-------|--------------|
| 1 | Splash | `01-splash.png` | `welcome` | Teal full-bleed, logo, "Your dues, on time.", Get started |
| 2 | Onboarding ×3 | `02–04` | `onboarding` | Original illustrations (add / remind / track), dots, Skip, Log in |
| 3–6 | Login, Forgot, Sign up, Verify | `05–08` | `(auth)/*`, `(app)/setup/verify-email` | Inputs with icons, 6-digit code input, resend timer |
| 7 | Workspace setup | `09` | `(app)/setup/workspace` | Company/Personal cards, workspace name, **first company**, timezone (no logo, no currency) |
| 8 | Invite team | `10` | `(app)/setup/invite` | Email + role (Finance / Viewer / Admin), add another, skip |
| 9 | Home | `11–14` | `(tabs)/index` | "Good morning, <name> 👋", workspace switcher, a one-line headline about the most urgent subscription, summary cards (Overdue, Due this week, Due this month, Paid this month — USD), Needs attention, Quick actions, Next 30 days (by due date), Monthly spending bars, Spending by category donut, **Spending by company** bars; empty state when there's no data |
| 10 | Subscriptions | `15–16` | `(tabs)/subscriptions` | **SearchBar with Sort + Filter buttons**, active filter chips, rows (category badge, name, company · frequency, USD amount, next due date, status), Load more (10 per page), empty / no-results states |
| 11 | Calendar | `17–18` | `(tabs)/calendar` | Day/Week/Month/Year, status dots, tap a day to list its subscriptions |
| 12 | Alerts | `19` | `(tabs)/alerts` | Today / This week / Earlier, unread dots, mark all read, offline banner |
| 13 | More | `20–21` | `(tabs)/more` | Profile card + role badge, settings list, dark mode switch, help, log out |
| 14 | Add / Edit subscription | `28–30` | `(app)/subscriptions/new`, `[id]/edit` | 5 sections: Basics (name, company, category, provider), Amount (USD), Schedule (9 frequency chips, start date = today, auto next due date, quick-pick date chips), Reminders (chips), Details (masked subscription key with show/hide, notes) |
| 15 | Subscription detail | `22–24` | `(app)/subscriptions/[id]` | Category badge, company · provider, USD amount, status, countdown ring, schedule list (cycle, next due, category, company, provider, started), **masked subscription key with Show/Copy** (admin/finance), reminder plan, payment history, Edit + Record payment |
| 16 | Record payment | `25–26` | bottom sheet | Full / Partial, USD amount, date paid (today), method, reference, notes (no receipt) |
| 17 | Payment recorded | `27` | `(app)/subscriptions/[id]/success` | Lottie check, "<Company> · <Subscription> is up to date", next due date moved |
| 18 | Payment history | `31` | `(app)/history` | SearchBar + Sort + Filter (date range, company, category), filter chips, total in USD, 10 per page |
| 19 | Reports | `32–33` | `(app)/reports` | Monthly/Annual, totals, 12-month forecast, by category, **by company**, overdue list, Export PDF/Excel |
| 20 | Team & roles | `34–35` | `(app)/team` | Members (Admin/Finance/Viewer), invites, what each role can do |
| 21 | Settings | `36` | `(app)/settings/*`, `(app)/profile` | Workspace (name, type, timezone, delete), **Companies** (add, rename, colour, delete/archive, restore), Categories, Notifications, Security |

Brief-only screens (designed in the same language): Notification settings, notification permission explainer,
Companies manager, reset-password code entry, invite accept, offline/error states.

## Shared components (`mobile/src/components/ui`)

Button, IconButton, Input, PasswordInput, CodeInput, Select, **DateField** (quick picks: Today, +1 week,
+1 month, +3 months, +1 year), DatePickerField, Chip, ChoiceCard, Segmented, Switch, StatusBadge (icon + label,
pulses when overdue), Card, ListItem, SectionHeader, BottomSheet, **SearchBar** (Sort + Filter buttons),
**SortSheet**, **FilterSheet**, **ActiveFilters**, EmptyState (with illustration), Skeleton, Avatar,
CategoryIcon (colourful badge per category), AmountText (USD), CountdownRing, SuccessCheck (Lottie), Toast.

## Visual language (from `prototype-styles.css`)

- **Font**: Plus Jakarta Sans 400–800. Page titles 24/800; section titles 16/700; eyebrow 11/800 tracked.
- **Colour**: primary teal `#0F5C5C`, accent amber `#F2A33A`, canvas `#F7F8FA`; dark canvas `#0E1414`, cards `#172121`.
- **Status**: Paid `#22A06B` · Upcoming `#3B82F6` · Due soon `#F59E0B` · Due today `#EA580C` · Overdue `#DC2626` · Partially paid `#7C3AED` — always icon + label.
- **Shape**: 8pt spacing, 16px card radius, soft shadows, 44px touch targets, 4.5:1 contrast (tested).
- **Mobile adjustment**: an 11px minimum text size (the prototype uses 7–10px in places), honouring OS font scaling.
