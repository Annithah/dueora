# DueOra — Your dues, on time.

DueOra helps companies and individuals keep track of recurring payments and renewals — hosting, domains,
subscriptions, rent, insurance, utilities. It reminds the right people before things fall due, lets them
record full or partial payments with receipts, and shows everything on one dashboard.

**Highlights**

- Reliable reminders: 30/14/7/3/1 days before, on the day, then 1/3/7 days after and weekly until paid —
  at 09:00 in each workspace's timezone, by push, email and in-app; digests on busy days; quiet hours;
  catch-up after downtime; never a duplicate (proven by a year-long simulation test).
- Payments: full and partial, receipts, history that's never lost, cycles that advance correctly
  (month-ends and leap years included).
- Workspaces for companies or individuals, with Admin / Finance / Department / Employee roles and strict
  workspace isolation.
- Dashboard, calendar (day/week/month/year), reports with PDF and Excel export.
- Offline read access, dark mode, biometric lock, accessible UI (WCAG AA contrast, screen-reader labels).

## Repository layout

```
dueora/
  mobile/        Expo SDK 58 app (React Native, TypeScript, Expo Router, TanStack Query, Zustand)
  backend/       Express 5 API + reminder worker (TypeScript, Prisma 7, SQLite in dev / Postgres in prod)
  docs/          requirements, UI map, API, notifications design, deployment, QA checklist
  design/        Screens captured from the Figma prototype + its stylesheet
  render.yaml    Render blueprint (API + worker + Postgres)
  PROGRESS.md    Phase-by-phase checklist and summaries
  DECISIONS.md   Decisions not covered by the requirements
```

## Getting started (local development)

Prerequisites: **Node.js 22.12+** and npm 10+. No database server needed locally (SQLite).

```bash
npm run install:all                     # installs backend and mobile

# Backend
cp backend/.env.example backend/.env    # then set JWT_ACCESS_SECRET (see the comment in the file)
cd backend
npm run db:migrate                      # create the SQLite database
npm run db:seed                         # demo workspace "Kigali Today Ltd" (prints the demo password)
npm run dev                             # API on http://localhost:4000 (add RUN_WORKER_IN_API=true for reminders)
npm run worker                          # …or run the reminder worker separately

# App (new terminal)
cd mobile
cp .env.example .env                    # EXPO_PUBLIC_API_URL — use your LAN IP for a real phone
npm start                               # Expo dev server; press "a" for Android
```

Demo users (all share the seed password): `anitha@kigalitoday.com` (Admin), `isaac@kigalitoday.com`
(Finance), `nadine@kigalitoday.com` (Department), `eric@kigalitoday.com` (Employee).

Without API keys everything still works locally: emails are printed in the API log, files go to
`backend/uploads/`, and push is skipped until an EAS project and Firebase are set up
(see `docs/DEPLOYMENT.md`).

## Quality checks

```bash
npm run check          # lint + type-check + tests for backend and mobile
```

| | |
|---|---|
| Backend | Vitest + supertest: scheduling engine (100% coverage enforced), every route for auth, roles and cross-workspace isolation, payments, notifications, a 365-day reminder simulation, reports |
| Mobile | Jest + React Native Testing Library: UI components, colour contrast, money/date maths, API client token refresh, forms |
| Manual | `docs/QA_CHECKLIST.md` |

## Documentation

| Doc | What's in it |
|---|---|
| `docs/requirements.md` | Product requirements |
| `docs/UI_MAP.md` | Every screen, its components and navigation |
| `docs/API.md` | REST API reference |
| `docs/NOTIFICATIONS.md` | How reminders are planned, de-duplicated and delivered |
| `docs/DEPLOYMENT.md` | Accounts, environment variables, hosting, email, storage, push, Android builds |
| `docs/QA_CHECKLIST.md` | Manual test plan for a real device |
| `DECISIONS.md` | Engineering decisions and trade-offs |

## Deploying

See `docs/DEPLOYMENT.md`. In short: one always-on container (`backend/Dockerfile`) running the API and
worker, managed Postgres, Cloudflare R2, Resend, and `eas build --profile preview --platform android` for a
test APK.
