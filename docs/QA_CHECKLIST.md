# Manual QA checklist

Run this on a **real Android phone** with a preview build (`eas build --profile preview --platform android`)
against a staging API with a **fresh database** (it contains only the default categories — DueOra ships no
demo data). Use three real email addresses you control: one Admin, one Finance, one Viewer. Note the device,
Android version and build number at the top of your notes.

## 0. Clean start
- [ ] Before signing up, the database holds only the 9 default categories (`backend`: `npm run db:check-empty` or inspect with any SQLite viewer).
- [ ] After signing up, every screen shows friendly empty states — no sample companies, bills or amounts anywhere.

## 1. First launch & onboarding
- [ ] Splash shows the teal DueOra screen; "Get started" and tapping anywhere both continue.
- [ ] Three onboarding slides with illustrations; dots update; Skip works.
- [ ] No notification permission prompt on first launch.

## 2. Accounts & workspace
- [ ] Sign up → goes straight to workspace setup (no email verification step).
- [ ] Workspace setup: name, Company/Personal, **first company**, timezone. No currency, no logo upload.
- [ ] Invite step: send to the Finance and Viewer emails (roles Finance / Viewer), or Skip.
- [ ] Forgot password → code → new password → old one no longer works.
- [ ] Kill and reopen while logged in → Home; Log out → Login.

## 3. Companies & categories (as Admin)
- [ ] More → Companies: add a second company with a colour; rename it.
- [ ] Delete an unused company → deleted. Delete a company that has bills → **archived** (hidden from the Add form, history kept), and can be restored.
- [ ] More → Categories: 9 defaults (each with its own colourful icon); add a custom one; a category in use can't be deleted.

## 4. Add / edit a bill
- [ ] Form has: name, company (dropdown + "+ New company…"), category (with icons), provider (optional), account reference (optional, hidden with eye toggle), amount in **USD only**, frequency (Weekly, Every 2 weeks, Monthly, Every 2 months, Quarterly, Every 6 months, Yearly, Custom, One-time), start date, next due date, reminders, notes.
- [ ] No currency, project, "assigned to" or attachment fields anywhere.
- [ ] Start date defaults to **today**; next due date is calculated automatically and updates when start date or frequency changes.
- [ ] Quick-pick chips under date fields: Today, +1 week, +1 month, +3 months, +1 year.
- [ ] Picking a next due date by hand stops auto-calculation; "Calculate automatically" brings it back.
- [ ] Start date in the past (e.g. 15 Jan, monthly) → next due date is the next 15th on/after today.
- [ ] Amount "1,523.50" is accepted and shown as $1,523.50; "12.345" is rejected.
- [ ] First bill in a new workspace → "Never miss a due date" permission screen.

## 5. Bills list
- [ ] Sorted by next due date, soonest first; overdue ones at the top (red bar, pulsing badge).
- [ ] Each card: category icon, name, company · frequency, USD amount, next due date, status.
- [ ] Only 10 load at first; scrolling/“Load more” loads the next 10 ("Showing 10 of 23").
- [ ] Search finds by name, company, provider, category — and by the **exact** account reference (not part of it).
- [ ] Sort button: due date soonest/latest, amount high/low, name A–Z, recently added.
- [ ] Filter button opens a sheet: status, company, category, frequency, due-date range. Active filters appear as removable chips; "Clear all" works.

## 6. Detail, key and payments
- [ ] Detail: company · provider, USD amount, status, countdown ring, schedule, reminder plan, payment history.
- [ ] Account reference shows masked (••••••4F7A). **Admin/Finance**: Show (eye) reveals it, Copy copies it; it re-masks after ~30 s. **Viewer**: masked only, no Show/Copy.
- [ ] Record full payment → animated check → "Next due date moved" → the list and dashboard update.
- [ ] Record partial payment → "$x will remain outstanding" → Partially paid; recording the rest moves the due date.
- [ ] One-time bill → fully paid → "Fully paid 🎉", no more reminders.
- [ ] Date paid defaults to today; future dates can't be picked. No receipt upload.
- [ ] ••• menu: Mute (just me), Archive/Unarchive, Delete (only without payment history).

## 7. History
- [ ] 10 per page with Load more; total for the current filter in USD.
- [ ] Search (bill, company, reference), Sort (newest/oldest paid, amount high/low), Filter (date range, company, category) with removable chips.
- [ ] History of a bill survives after its next cycle starts.

## 8. Roles (log in as each)
- [ ] **Finance:** add/edit bills, record/edit payments, companies, categories, reports, reveal keys. Can't invite or change roles.
- [ ] **Viewer:** sees everything read-only — no "+" button, no Edit/Record, no Show/Copy on keys; receives reminders; can mute for themselves.
- [ ] Team & roles (Admin): change roles, invite, cancel invites; the last admin can't be demoted.

## 9. Notifications (preview build with FCM set up)
- [ ] More → Notifications → Send test notification → push within seconds.
- [ ] Reminder copy reads like "⏰ <Company> · <Bill> is due in 7 days — $1,523.00 on Tue, 20 Oct." — never shows the key.
- [ ] Tapping a reminder opens that bill (app closed and in background). In the foreground it shows a toast.
- [ ] Two Android channels exist: Bill reminders and Overdue bills (high importance).
- [ ] All three members get reminders; muting stops them for one person only; archiving/paying stops them for everyone.
- [ ] A person with no phone registered gets email instead.
- [ ] Alerts tab: Today / This week / Earlier, unread badge, mark all read.

## 10. Dashboard, calendar, reports
- [ ] Empty workspace → "No bills yet — add your first one".
- [ ] With data: greeting, one-line headline about the most urgent bill, summary cards (Overdue, Due this week, Due this month, Paid this month) in USD, Needs attention, Next 30 days, monthly chart, by category, by company.
- [ ] Calendar Day/Week/Month/Year with status dots; tap a day to list its bills.
- [ ] Reports Monthly/Annual: totals, forecast, by category, by company, overdue list. Export PDF / Excel → share sheet; amounts in USD.

## 11. Settings, offline, accessibility
- [ ] Workspace: name, type, timezone (admin only). Profile: name. Security: change password, biometric lock.
- [ ] Dark mode on every screen; text readable.
- [ ] Airplane mode → offline banner; last data still visible; saving shows a clear error.
- [ ] TalkBack reads buttons, badges, charts; max font size doesn't clip; touch targets ≥ 44 px; "Remove animations" stops pulse/shimmer.
