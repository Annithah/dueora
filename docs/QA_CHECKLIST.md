# Manual QA checklist

Run this on a **real Android phone** with a preview build (`eas build --profile preview --platform android`)
against a staging API seeded with the demo data (`npm run db:seed`). Tick each item; note the device,
Android version and build number at the top of your notes.

Demo logins (password = `SEED_ADMIN_PASSWORD`): `anitha@kigalitoday.com` (Admin),
`isaac@kigalitoday.com` (Finance), `nadine@kigalitoday.com` (Department – Technology),
`eric@kigalitoday.com` (Employee).

## 1. First launch & onboarding
- [ ] Splash shows the teal DueOra screen; "Get started" and tapping anywhere both continue.
- [ ] Three onboarding slides with illustrations; dots and "STEP n OF 3" update; Skip works.
- [ ] No notification permission prompt appears on first launch.
- [ ] "Already have an account? Log in" opens Login.

## 2. Accounts
- [ ] Sign up with a new email → "Check your email" screen → code arrives by email → verifying continues.
- [ ] Wrong code shows a clear error; "Resend" is disabled for 60 s then works.
- [ ] Log in with a wrong password → friendly error; correct password → Home.
- [ ] Forgot password → code by email → set new password → old password no longer works.
- [ ] Workspace setup: Company vs Personal, logo upload (≤ 5 MB), currency, timezone; invite step can be skipped.
- [ ] Invite link opened on a phone without the app signed in → after sign-up/login the invite is accepted.
- [ ] Log out returns to Login; reopening the app stays logged out.
- [ ] Kill and reopen the app while logged in → goes straight to Home (no login).

## 3. Home (as Anitha)
- [ ] "Good morning/afternoon/evening, Anitha 👋" matches the time of day.
- [ ] Summary cards scroll horizontally: Overdue $1,763 · 2, Due this week (RWF), Due this month, Paid this month.
- [ ] Needs attention lists Cloudflare and KigaliToday hosting first (red bar, pulsing Overdue badge).
- [ ] Quick actions open Add payment, Payments, Calendar, Reports.
- [ ] Spending chart and category donut render; values match Reports.
- [ ] Next 30 days timeline shows upcoming items with dates.
- [ ] Pull-to-refresh works; workspace switcher lists all workspaces and switches data.

## 4. Payments
- [ ] List groups by project (KT Radio, KigaliToday, Other payments); counts are right.
- [ ] Status chips filter (Overdue, Due soon, Partially paid, Upcoming, Paid, Archived); search filters instantly.
- [ ] Empty search shows "No matching payments" with Clear filters.
- [ ] Add payment: all five sections; Quarterly / Every 6 months / Custom (every 2 weeks) / One-time; month-end date (31st) keeps month-end.
- [ ] Amount accepts "1,523.50" (USD) and rejects decimals for RWF; next due before start date is rejected.
- [ ] Attach a PDF contract; it appears under Attachments and opens via the share sheet.
- [ ] First payment in a new workspace shows the "Never miss a due date" permission screen afterwards.
- [ ] Edit changes are saved; editing the due date updates reminders.

## 5. Payment detail & recording
- [ ] Countdown ring shows days and turns red when overdue ("OVERDUE BY 9 months, …").
- [ ] Reminder schedule shows ✓ Sent for reminders already delivered.
- [ ] Record full payment → green animated check → "Next due date moved" → Back to dashboard shows the success toast and updated numbers.
- [ ] Record partial payment → "$x will remain outstanding" → status becomes Partially paid; recording the rest completes the cycle.
- [ ] Receipt from camera and from files both upload; receipt opens from history.
- [ ] Payment date in the future is not selectable.
- [ ] ••• menu: Mute (just me), Archive/Unarchive, Delete (only when no history).

## 6. Roles (log in as each)
- [ ] **Isaac (Finance):** can record/edit everything, sees Reports, can't invite or change roles.
- [ ] **Nadine (Department):** sees everything, can edit/record only Technology items (Edit/Record hidden on others), no Reports.
- [ ] **Eric (Employee):** sees only the Cleaning service; no Record/Edit buttons; no Reports or Team in More.
- [ ] Team & roles (Anitha): change Isaac's role, add a department, invite by email, cancel an invite, can't demote the last admin.

## 7. Notifications (development or preview build with FCM set up)
- [ ] More → Notifications → Send test notification → push arrives within seconds.
- [ ] Tapping a reminder push opens that payment's detail screen (app closed and app in background).
- [ ] With the app open, a push shows as an in-app toast instead of a banner.
- [ ] Overdue reminders use the "Overdue payments" channel (check Android notification settings: two channels).
- [ ] Turning push off, then sending a test → arrives by email instead.
- [ ] Quiet hours (admin) and reminder time changes save; non-admins see them read-only.
- [ ] Alerts tab: Today / This week / Earlier; unread dot and tab badge; Mark all as read clears the badge.
- [ ] Logging out stops pushes to this phone.

## 8. Calendar & reports
- [ ] Month view: status dots (overdue red, due soon amber, upcoming blue, paid green); tapping a day lists its payments.
- [ ] Day / Week / Year views and previous/next navigation work; Year → tap a month opens it.
- [ ] Reports: Monthly/Annual toggle, previous/next period, forecast chart, by category, overdue list.
- [ ] Export PDF and Export Excel open the share sheet; files open correctly in a PDF viewer / Sheets.

## 9. Settings, security, appearance
- [ ] Profile name/phone save. Change password signs you out.
- [ ] Biometric lock: turn on (prompt), background the app > 30 s → lock screen → unlock with fingerprint.
- [ ] Company info: logo, currency, timezone, exchange rate (RWF → USD) — Home converted totals update.
- [ ] Categories & projects: add a custom category with an icon, add a project with a colour; built-ins can't be deleted.
- [ ] Dark mode toggle switches every screen; text stays readable (check badges and charts).

## 10. Offline & resilience
- [ ] Turn on airplane mode → amber offline banner; Home, Payments, Alerts still show last data.
- [ ] Recording a payment offline shows a clear error; nothing is lost when back online.
- [ ] Kill the app offline and reopen → cached data appears instantly.
- [ ] Leave the app 20+ minutes, come back → requests still work (silent token refresh).

## 11. Accessibility
- [ ] TalkBack reads buttons, status badges ("Status: Overdue"), charts (spoken summary) and icons with labels.
- [ ] System font size at maximum: no clipped text on Home, Payments, Detail, Record sheet.
- [ ] Every tap target is comfortably tappable (≥ 44 px), including chips and the tab bar.
- [ ] "Remove animations" (Android accessibility) stops the pulse, skeleton shimmer and success animation.
