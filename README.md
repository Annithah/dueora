# DueOra — Your dues, on time.

DueOra helps people and companies keep track of their recurring bills and payments — hosting,
domains, software, internet, rent, insurance, utilities. It reminds everyone before things fall due, lets
them record full or partial payments, and shows everything on one dashboard. Everything is in US dollars.

**Highlights**

- **Bills** belong to a **company** (a workspace can hold several, e.g. one per brand) and a
  **category**. Start date defaults to today; the next due date is calculated automatically and moves
  forward when a cycle is paid.
- **Reliable reminders**: 30/14/7/3/1 days before, on the day, then 1/3/7 days after and weekly until paid —
  at 09:00 in the workspace's timezone, by push, email and in-app; digests on busy days; quiet hours;
  catch-up after downtime; never a duplicate (proven by a year-long simulation test).
- **Account references** (license keys, account numbers) encrypted at rest (AES-256-GCM), masked in the app,
  revealed only to Admin/Finance, searchable by exact key, never logged or sent in notifications.
- Lists sorted by due date, 10 per page, with search, sort and filters.
- Roles: Admin / Finance / Viewer, with strict workspace isolation.
- Dashboard, calendar (day/week/month/year), reports with PDF and Excel export.
- No demo data: the app shows only what you enter. Offline read access, dark mode, biometric lock,
  accessible UI.

## Repository layout

```
dueora/
  mobile/        Expo SDK 58 app (React Native, TypeScript, Expo Router, TanStack Query, Zustand)
  backend/       Express 5 API + reminder worker (TypeScript, Prisma 7, SQLite)
  docs/          requirements, UI map, API, notifications design, deployment, QA checklist
  design/        Screens captured from the Figma prototype + its stylesheet
  scripts/       Repo checks (no hardcoded sample data)
  render.yaml    Render blueprint (API + worker + persistent disk)
  PROGRESS.md    Phase-by-phase checklist and summaries
  DECISIONS.md   Decisions not covered by the brief
```

## Getting started (local development)

Prerequisites: **Node.js 22.12+** and npm 10+. No database server needed (SQLite).

```bash
npm run install:all                     # installs backend and mobile

# Backend
cp backend/.env.example backend/.env    # set JWT_ACCESS_SECRET and ACCOUNT_REF_SECRET (see comments)
cd backend
npm run db:migrate                      # create the SQLite database (backend/dueora.db)
npm run db:seed                         # inserts the default categories — nothing else
npm run db:check-empty                  # optional: proves only the default categories are present
npm run dev                             # API on http://localhost:4000 (RUN_WORKER_IN_API=true for reminders)
npm run worker                          # …or run the reminder worker separately

# App (new terminal)
cd mobile
cp .env.example .env                    # EXPO_PUBLIC_API_URL — use your LAN IP for a real phone
npm start                               # Expo dev server; press "a" for Android
```

Then sign up in the app, create your workspace and first company, and add your real bills.
Without API keys everything still works locally: emails are printed in the API log, and push is skipped
until an EAS project and Firebase are set up (see `docs/DEPLOYMENT.md`).

> **OneDrive note:** this folder lives in OneDrive. With "Files On-Demand", OneDrive turns files into
> cloud placeholders, which Node 24 on Windows reports as symlinks — Metro and Jest then skip or fail on them.
> Right-click the project folder → **Always keep on this device**, or keep the project outside OneDrive
> (e.g. `C:\dev\dueora`).

## Quality checks

```bash
npm run check          # lint + type-check + tests (backend and mobile) + no-sample-data scan
```

| | |
|---|---|
| Backend | Vitest + supertest: scheduling engine (≥ 95% coverage enforced), every route for auth, roles and cross-workspace isolation, pagination/sort/filter, payments, notifications, a 365-day reminder simulation, account-reference security, reports |
| Mobile | Jest + React Native Testing Library: UI components (search/sort/filter, date quick picks, rows), colour contrast, USD/date maths, the due-date mirror, API client token refresh, forms |
| Manual | `docs/QA_CHECKLIST.md` |

## Documentation

| Doc | What's in it |
|---|---|
| `docs/requirements.md` | Product requirements (build brief) |
| `docs/UI_MAP.md` | Every screen, what changed from the prototype, components and navigation |
| `docs/API.md` | REST API reference |
| `docs/NOTIFICATIONS.md` | How reminders are planned, de-duplicated and delivered |
| `docs/DEPLOYMENT.md` | Accounts, environment variables, hosting, email, push, Android builds |
| `docs/QA_CHECKLIST.md` | Manual test plan for a real device |
| `DECISIONS.md` | Engineering decisions and trade-offs |

## Deploying

See `docs/DEPLOYMENT.md`. In short: one always-on container (`backend/Dockerfile`) running the API and
worker with SQLite on a persistent disk (Render Starter + 1 GB disk ≈ $7.25/month), Resend for email, Expo +
FCM for push, and `eas build --profile preview --platform android` for a test APK.
