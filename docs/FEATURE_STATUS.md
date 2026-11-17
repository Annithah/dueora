# Feature status — DueOra 1.1.0

One row per feature from the Finalize brief and the master prompt. `scripts/progress.ts` reads this table to build
the progress page (`npm run progress`), so keep the columns as they are.

- **Status**: `Done` · `In progress` · `Not started` · `Blocked`
- **Part**: the Finalize part (1–8) the feature belongs to
- **Area**: `backend` · `mobile` · `ai` · `notifications` · `release`

Details and reasons are in `DECISIONS.md`; the day-by-day checklist is in `PROGRESS.md`.

| Feature | Part | Area | Status | Proof |
|---|---|---|---|---|
| "Subscription" renamed to Bill in the database, API, app, emails and AI | 1 | backend | Done | `fb41a4d`, backend tests |
| Bill reference / account number encrypted (AES-256-GCM), masked, reveal for Admin/Finance only | 1 | backend | Done | `test/subscriptionKey.security.test.ts` |
| Bills screens and copy say "Bill" (tabs, forms, en/fr/rw strings) | 1 | mobile | Done | mobile tests |
| Companies: name, initials, colour, description, archive vs delete, admin-only | 2 | backend | Done | D35, company route tests |
| Company detail: Overview, Categories, Members, Settings | 2 | mobile | Done | More → Companies |
| Company switcher on Home, Bills, Calendar, Reports (remembered on the phone) | 2 | mobile | Done | mobile tests |
| Company access: all companies or chosen ones (Finance/Viewer per company), enforced everywhere | 2 | backend | Done | `test/companyAccess.test.ts` |
| Categories per company, nothing seeded or hardcoded | 3 | backend | Done | D36, `npm run check:no-sample-data` |
| Sub-categories, category defaults, reorder, archive, merge, move-then-delete | 3 | backend | Done | category route tests |
| Start empty / suggestions / copy from another company at company creation | 3 | mobile | Done | D36 |
| Custom fields (≤ 10 per company) on form, detail, filters, search and exports | 3 | backend | Done | D37, custom field tests |
| Fixed or variable amount bills, estimate, "set this cycle's amount", "Paid in full" | 4 | backend | Done | D38, cycle tests |
| Stored bill cycles: exact history when amounts change; missed cycles all overdue | 4 | backend | Done | `domain/cycles` tests |
| Scheduling engine (month-end, leap years, timezone) with ≥ 95% coverage | 4 | backend | Done | schedule tests + coverage gate |
| Tracking views: Upcoming, This month, Next month, Outstanding, Overdue, Paid, Obligations | 5 | backend | Done | D39, views tests |
| Bills tab segments, amount-type and sub-category filters, 10 per page | 5 | mobile | Done | mobile list tests |
| Dashboard: outstanding, last month at a glance, cash flow, per company | 5 | mobile | Done | Home screen |
| Gentle pulse on overdue rows (off with reduced motion) | 5 | mobile | Done | `StatusBadge` pulse on `OVERDUE` |
| Reports: payment report, per company, estimate vs actual, ageing, upcoming, annual, categories | 6 | backend | Done | report tests |
| Exports PDF/Excel per company or all, with period, generated date and custom fields | 6 | backend | Done | export tests |
| Recipients follow company access; copy names the company | 7 | notifications | Done | `test/notifications.companies.test.ts` |
| No duplicates (dedupe key, unique constraint) and digest instead of spam | 7 | notifications | Done | dedupe + digest tests |
| Per-company reminder hour and offsets, amount needed, next-month preview, report ready | 7 | notifications | Done | D40 |
| Per-company notification switches (reminders, activity, summaries, mute) | 7 | notifications | Done | Settings → Notifications |
| Year-long simulation in 3 timezones with several companies and a restricted member | 7 | notifications | Done | year simulation tests |
| Push on a physical Android phone | 7 | notifications | Blocked | needs Firebase `google-services.json` and an installed APK |
| DueOra AI on the backend only (`GEMINI_API_KEY`), tools, confirmations, insights | 8 | ai | Done | `backend/src/ai`, AI tests |
| AI follows company access; reference numbers never sent to the AI | 8 | ai | Done | AI access tests |
| AI offline eval suite | 8 | ai | Done | AI eval tests |
| Live AI answers in production | 8 | ai | Blocked | needs `GEMINI_API_KEY` on the deployed backend |
| Light mode default; Settings → Appearance: Light / Dark / System | 8 | mobile | Done | theme tests |
| Error reporting with Sentry (off without a DSN) | 8 | backend | Done | `backend/src/lib/sentry.ts`, sentry test |
| Legal pages (privacy policy, terms) | 8 | release | Done | `docs/legal/` |
| Maestro end-to-end flows | 8 | mobile | In progress | flows written in `mobile/e2e/`; not run (no emulator on the build machine) |
| Production backend over HTTPS (this PC, SQLite, Cloudflare tunnel) | 8 | release | Done | D41, `scripts/start-server.ps1`, `/health` ok |
| Android APK 1.1.0 (EAS preview build) | 8 | release | Done | EAS build `b44ba31b`, APK link in `docs/INSTALL.md` |
| GitHub Release v1.1.0 with the APK | 8 | release | Blocked | needs `gh` login; the EAS APK link is used meanwhile |
| Install guide and QR code | 8 | release | Done | `docs/INSTALL.md`, `docs/install-qr.png` |
| App finds the server when its address changes | 8 | mobile | Done | `src/api/discovery.ts`, client tests |
| Progress page on GitHub Pages, rebuilt on every push | 8 | release | Done | `.github/workflows/progress.yml` |
| Play Store preparation notes (no publishing) | 8 | release | Done | `docs/PLAY_STORE.md` |
