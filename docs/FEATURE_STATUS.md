# Feature status — DueOra 1.1.0

What the app does today, against the Finalize brief (company-based bills, tracking, reports and notifications).
Details and reasons are in `DECISIONS.md` (D34–D40); the checklist is in `PROGRESS.md`.

| Area | Status | Where |
|---|---|---|
| "Subscription" renamed to **Bill**; account reference per bill | ✅ Done | D34 |
| Companies: initials, description, reminder defaults and hour, monthly budget; admin-only; archive vs delete | ✅ Done | D35 · More → Companies |
| Company detail: Overview, Categories, Members, Settings | ✅ Done | More → Companies → a company |
| Company switcher on Home, Bills, Calendar, Reports (remembered on the phone) | ✅ Done | Top of each screen |
| Company access: all companies, or chosen ones with Finance/Viewer per company | ✅ Done | Team & roles · enforced on every endpoint, notification and AI tool |
| Categories per company, one level of sub-categories, defaults, reorder, archive, merge, move-then-delete | ✅ Done | D36 · More → Categories |
| Category suggestions (config file), start empty / suggestions / copy at company creation | ✅ Done | `backend/src/config/categorySuggestions.ts` |
| Custom fields (≤ 10 per company) on form, detail, filters, search, exports | ✅ Done | D37 |
| Variable amounts: estimate, set this cycle's amount, "Paid in full" | ✅ Done | D38 · bill detail |
| Stored cycles: exact history when amounts change | ✅ Done | D38 |
| Missed cycles of an unpaid recurring bill all count as overdue | ✅ Fixed | D38 |
| Tracking views: Upcoming 7/30/60/90, This month, Next month, Outstanding, Overdue (ageing), Paid, Obligations | ✅ Done | D39 · Bills tab segments |
| Dashboard: outstanding, last month at a glance, cash flow 6 + 3 months, per company | ✅ Done | Home |
| Reports: payment report, per company, estimate vs actual, ageing, upcoming, category report | ✅ Done | D39 · More → Reports |
| Exports per company or all (one sheet per company), company / period / generated date / custom fields | ✅ Done | Reports → Export |
| Notifications follow company access; per-company hour; amount needed; next-month preview; report ready | ✅ Done | D40 |
| Per-company notification switches (reminders, activity, summaries; mute) | ✅ Done | Settings → Notifications → Companies |
| DueOra AI: company access, views, last-month report, set cycle amount, categories with sub-categories | ✅ Done | `backend/src/ai` |
| Automated tests | ✅ Backend 700+, mobile 160+ | `npm test` |
| Maestro end-to-end flows | ⏳ Not done | Maestro and an Android emulator are not installed on the build machine |
| Production backend (HTTPS) | ⏳ Waiting for hosting | `render.yaml` is ready — see `docs/DEPLOYMENT.md` |
| Android APK (EAS preview build), QR code, GitHub Release | ⏳ Waiting for the backend URL | EAS project `@anitha_dev/dueora` is linked |
