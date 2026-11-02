# UI Map

Screens from the Figma prototype (https://rouge-warm-77431112.figma.site/), captured in `design/`.
The prototype's stylesheet is kept as `design/prototype-styles.css` for exact sizes and tokens.
Route names are the Expo Router paths under `mobile/src/app/`.

Legend: **Components** lists the shared UI pieces (in `mobile/src/components/ui`) each screen uses.

## Navigation overview

```
Splash ──► Onboarding (3 slides) ──► Workspace setup ──► Invite team ──► Main tabs
               │  "Skip" ─────────────────┘                  "Skip" ──────┘
               └─ "Log in" ─► Login ─┬─► Main tabs
                                     ├─► Forgot password ─► (email code) ─► Reset password
                                     └─► Sign up ─► Verify email ─► Workspace setup

Main tabs: Home · Payments · [ + FAB ] · Calendar · Alerts · More
  FAB / "Add payment" ───────────► Add payment (modal stack)
  any payment row ───────────────► Payment detail ─► Record payment (bottom sheet) ─► Success
                                                    └► Edit (Add payment form, prefilled)
  More ─► Profile · Company info · Payment history · Reports · Team & roles ·
          Categories & currencies · Security · Notification settings · Help · Log out
  Notification tap (push) ───────► Payment detail (deep link dueora://payments/:id)
```

## Auth & onboarding stack — `(auth)/`, `(onboarding)/`

| # | Screen | Screenshot | Route | Key elements | Components | Navigation |
|---|--------|------------|-------|--------------|------------|------------|
| 1 | Splash | `01-splash.png` | `index` (gate) | Teal full-bleed, decorative rings, logo + "Your dues, on time.", white "Get started →" button, "Tap anywhere to continue" | Brand logo, Button (inverse) | → onboarding (first launch) or tabs (signed in) |
| 2 | Onboarding ×3 | `02–04-onboarding-*.png` | `(onboarding)/index` | Compact logo + "Skip"; illustration card (add / remind / track); eyebrow "STEP n OF 3"; display title; body; pager dots; primary "Continue →" / "Set up my workspace →"; "Already have an account? **Log in**" | Illustration, Button, PagerDots | Skip/last → workspace setup (sign-up first if no account); Log in → login |
| 3 | Login | `05-login.png` | `(auth)/login` | Back, logo, "Welcome back", Work email, Password, "Forgot password?", "Log in", "New to DueOra? **Sign up**" | Input (icon), Button | → tabs; → forgot; → sign up |
| 4 | Forgot password | `06-forgot-password.png` | `(auth)/forgot-password` | "Reset your password", email, "Send reset link" | Input, Button | → reset (code + new password) |
| 4b | Reset password | — (not in prototype) | `(auth)/reset-password` | 6-digit code + new password (brief: "email code") | CodeInput, Input, Button | → login |
| 5 | Sign up | `07-signup.png` | `(auth)/signup` | "Create your account", Full name, Work email, Password, "Create account", "Already have an account? Log in" | Input, Button | → verify email |
| 6 | Verify email | `08-verify-email.png` | `(auth)/verify-email` | Mail icon tile, "Check your email", "We sent a 6-digit verification code to **email**", 6 digit boxes, "Verify email", "Didn't receive it? **Resend in 0:42**" | IconTile, CodeInput, Button | → workspace setup |
| 7 | Workspace setup | `09-workspace-setup.png` | `(onboarding)/workspace` | Topbar "Workspace setup"; "How will you use DueOra?"; Company / Personal choice cards; Company name; logo upload box ("PNG or JPG, max 5 MB"); Currency + Timezone selects; sticky "Continue →" | ChoiceCard, Input, UploadBox, Select, Button | → invite (company) / tabs (personal) |
| 8 | Invite team | `10-invite-team.png` | `(onboarding)/invite` | Topbar + "Skip"; users icon tile; "Better together"; Email; Role select; "+ Add another person"; "Send invite & continue" | Input, Select, Button | → tabs |

## Main tabs — `(tabs)/`

Bottom nav: Home (house) · Payments (wallet-cards) · centre FAB (+, teal, 58px, raised 24px, canvas-coloured border) · Calendar · Alerts (unread count badge) · More (menu). Active tab tinted teal-700.

| # | Screen | Screenshot | Route | Key elements | Components |
|---|--------|------------|-------|--------------|------------|
| 9 | Home / Dashboard | `11-home.png`, `12-home-scrolled.png`, `13-home-payment-recorded.png`, `14-home-dark.png` | `(tabs)/index` | Optional green success banner "Payment recorded. Dashboard updated." ×; "Good morning," + name; company pill (logo/initials + chevron) and bell with red dot; workspace switcher chip; horizontal snap-scroll summary cards (Overdue red, Due this week amber, Due this month blue, Paid this month green — value + sub-line); "Needs attention · View all" card with compact payment rows; Quick actions 4-grid (Add payment, Record, Calendar, Reports); "Spending overview · 12 months" bar chart with current month amber + trend pill; "Next 30 days · Calendar" timeline (date column + bordered payment row) | SummaryCard, SectionHeader, PaymentRow, QuickAction, BarChart, Timeline, Banner, Avatar |
| 10 | Payments | `15-payments.png`, `16-payments-scrolled.png` | `(tabs)/payments` | "All obligations" / "Payments" + filter icon; search; status chips (All, Overdue, Due soon, Upcoming, Paid, Archived); groups per platform ("KT Radio · 3 items") of payment rows with status badge; overdue rows get red left bar; empty: illustration "No matching payments" + "Clear filters" | SearchBar, Chip, PaymentRow, StatusBadge, EmptyState |
| 11 | Calendar | `17-calendar.png`, `18-calendar-day-selected.png` | `(tabs)/calendar` | "Plan ahead" / "Calendar" + ellipsis; segmented Day/Week/Month/Year; month card with ← month →, weekday header, day grid with status dots, selected day teal square; legend (Overdue, Due soon, Upcoming); "20 October · 1 payment" list or "Nothing due on this day" mini-empty | Segmented, CalendarMonth, PaymentRow, MiniEmpty |
| 12 | Alerts | `19-alerts.png` | `(tabs)/alerts` | "Keep watch" / "Alerts" + settings cog; offline banner (amber, wifi-off); groups Today / This week / Earlier; alert rows (bell tile, title, body, status badge, blue unread dot; overdue rows have red-soft gradient) | OfflineBanner, AlertRow, StatusBadge |
| 13 | More | `20-more.png`, `21-more-scrolled.png` | `(tabs)/more` | "Workspace" / "More" + avatar; profile card (large avatar, name, email, role badge); settings list (Profile, Company info, Payment history, Reports, Team & roles, Categories & currencies, Security, Notification settings*, Dark mode switch); Help & support; Log out (red); version line | Avatar, ListItem, Switch |

\* "Design system" in the prototype's More list is a designer showcase; in the app it is replaced by **Notification settings** (required by the brief).

## Payment flows

| # | Screen | Screenshot | Route | Key elements | Components |
|---|--------|------------|-------|--------------|------------|
| 14 | Add / Edit payment | `28–30-add-payment-*.png` | `payments/new`, `payments/[id]/edit` | Topbar "Add payment" + "Save draft"; 5 numbered sections: 1 Basic information (Payment name, Provider, Project/platform, Category); 2 Amount (big amount entry + currency button); 3 Schedule (frequency chips Weekly…One-time, Start date, Next due); 4 Reminders (toggle chips 1 month, 2 weeks, 1 week, 3 days, 1 day, On due date, After due date); 5 Ownership & details (Assigned to, Notes, Add attachments); sticky "Save payment" | FormSection, Input, Select, AmountInput, Chip, DatePickerField, AttachmentPicker, Button |
| 15 | Payment detail | `22-payment-detail.png`, `23-payment-detail-scrolled.png`, `24-payment-detail-dark.png` | `payments/[id]` | Topbar "Payment detail" + ellipsis (archive / delete); hero: category icon tile, "Platform · Provider", name, big amount + currency, status badge; countdown card (ring with days, "OVERDUE BY / DUE IN", relative text, "Was due …"); Renewal details list (Billing cycle, Next due date, Category, Assigned to); Reminder schedule grid (sent ✓ green / scheduled bell blue) + Edit; Payment history timeline + View all; Attachments (file rows with download); sticky actions Edit (secondary) + Record payment (primary) | CategoryIcon, AmountText, StatusBadge, CountdownRing, InfoList, ReminderGrid, HistoryLine, AttachmentRow, Button |
| 16 | Record payment | `25-record-payment-full.png`, `26-record-payment-partial.png` | bottom sheet over detail (`payments/[id]/record`, modal) | Handle; "Obligation name" + "Record payment" + ×; segmented Full / Partial; big centred amount + currency; partial note "$120.00 will remain outstanding" (purple); Payment date + Method; Transaction reference; Upload receipt (dashed teal); Notes; "Confirm payment" | BottomSheet, Segmented, AmountInput, DatePickerField, Select, Input, UploadBox, Button |
| 17 | Payment recorded | `27-payment-recorded-success.png` | `payments/[id]/success` | Animated check in green orbit (Lottie); "Payment recorded"; "Great work. X is now up to date."; summary card (Amount paid, Payment date, Next due date); teal "Next due date moved — We'll remind you before …"; "Back to dashboard" + "View payment" | SuccessCheck (Lottie), Card, Button |

## Secondary screens (stack from More)

| # | Screen | Screenshot | Route | Key elements |
|---|--------|------------|-------|--------------|
| 18 | Payment history | `31-payment-history.png` | `history` | Search; chips All time / Category / Provider (+ date range, platform per brief); "Total recorded · year" card (USD + other currencies); month sections with total; compact rows with Paid badge |
| 19 | Reports | `32-reports.png`, `33-reports-scrolled.png` | `reports` | Segmented Monthly / Annual; teal hero "TOTAL COMMITTED · 2026" + secondary currency + Paid / Outstanding; 12-month forecast line chart; By category donut + legend; Export PDF / Export Excel (secondary buttons). Brief adds outstanding, overdue report types. |
| 20 | Team & roles | `34-team-roles.png`, `35-team-roles-scrolled.png` | `team` | Summary "4 members · 1 pending invitation" + Invite; Members list (coloured initials avatars, "You · Admin", ellipsis menu: change role/department, remove); Role permissions list; amber "Employee preview" note |
| 21 | Settings | `36-settings.png` | `settings` (split into `settings/notifications`, `settings/security`, `settings/company`, `settings/categories`, `profile`) | Reminder defaults; Preferences (Default currency, Dark mode); Security (Change password, Biometric lock switch); Danger zone (Delete workspace, red) |
| 22 | Design system | `37–40-design-system-*.png` | — (reference only) | Colour tokens, type scale (Display 32/38, Title 22/28, Body 15/22, Caption 12/16), button variants (primary, secondary, ghost, danger), inputs, chips, segmented, status badges, cards & charts, spacing & radius, empty state |

Not in the prototype but required by the brief (designed in the same language):
Notification settings (channel toggles, digest, quiet hours, reminder hour, "Send test notification"),
notification permission explainer, Company settings, Categories manager, Profile, Help, reset-password
code entry, invite accept, offline/error states.

## Visual language (from `prototype-styles.css`)

- **Font**: Plus Jakarta Sans 400/500/600/700/800. Page titles 24/800 (-0.6 tracking); display 28/800 (-0.8); section titles 16/700; eyebrow 11/800 tracked 1.2, teal-700.
- **Surfaces**: canvas `#F7F8FA`; cards white, 1px `#E7EBEB` border, 16px radius, shadow `0 2px 10px rgba(20,49,49,.06)`; topbar white with bottom hairline, 58px.
- **Buttons**: 48px tall, 14px radius, 14/700. Primary teal + teal shadow; secondary teal-50 bg + teal-100 border + teal text; ghost; danger red.
- **Inputs**: label 12/700 above; 48px shell, 13px radius, icon left, focus ring teal-700 + 3px teal-50 halo.
- **Chips**: 36px pill, 1px border; selected = teal fill, white text, check icon for toggles.
- **Status badge**: pill, icon + label, soft background + darker text tone.
- **Payment row**: 42px icon tile (13px radius, category colour), name 13/700, "provider · cycle" muted, amount + date right-aligned, 3px red left bar when overdue.
- **Dark mode**: canvas `#0E1414`, surface `#172121`, raised `#1C2828`, ink `#EDF5F4`, muted `#A5B2B1`, line `#2A3737`; soft tints darkened.
- **Mobile adjustments**: the prototype uses 7–10px text in places; the app enforces an 11px minimum (and respects system font scaling), keeping the same hierarchy.
