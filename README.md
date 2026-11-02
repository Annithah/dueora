# DueOra — Your dues, on time.

DueOra helps companies and individuals keep track of recurring payments and renewals — hosting, domains, subscriptions, rent, insurance, utilities. It sends reliable reminders before things fall due, lets you record payments (full or partial, with receipts), and shows everything on one dashboard.

## Repository layout

```
dueora/
  mobile/    Expo (React Native + TypeScript) app — Expo Router, TanStack Query, Zustand
  backend/   Express + TypeScript API, Prisma, notification worker
  docs/      requirements.md, API.md, NOTIFICATIONS.md, DEPLOYMENT.md, UI_MAP.md
  design/    Screenshots exported from the Figma prototype
  PROGRESS.md   Build checklist and phase summaries
  DECISIONS.md  Engineering decisions not covered by the requirements
```

## Prerequisites

- Node.js 20+ (developed on Node 24) and npm 10+
- For the phone: the Expo Go app for UI work, or a development build for push notifications (see `docs/DEPLOYMENT.md`)
- Optional: Docker, if you want to run against Postgres locally (`docker compose up -d`)

## Setup

```bash
# 1. Install dependencies for both apps
npm run install:all

# 2. Configure environment variables
cp backend/.env.example backend/.env
cp mobile/.env.example mobile/.env
# then edit backend/.env — at least set JWT_ACCESS_SECRET

# 3. Run the API (http://localhost:4000)
npm --prefix backend run dev

# 4. Run the app
npm --prefix mobile start
```

Local development uses SQLite (`backend/dev.db`), so no database server is needed. Production uses Postgres — see `DECISIONS.md` (D1) and `docs/DEPLOYMENT.md`.

## Quality checks

```bash
npm run check     # lint + type-check + tests for backend and mobile
```

Each app also has its own `lint`, `typecheck`, `test` and `format` scripts.

## Status

See `PROGRESS.md` for the phase-by-phase checklist.
