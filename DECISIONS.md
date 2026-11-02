# Decisions

Decisions made during the build that the brief or requirements didn't settle. Newest at the bottom.

## D1 — SQLite for development and tests; Postgres in production (Phase 0)
**Context:** Docker isn't installed on the dev machine; the owner chose SQLite for local work.
**Decision:**
- Prisma runs with the SQLite provider locally and in tests. Production uses Postgres (Neon or the host's managed Postgres). The schema is kept portable, and a small script switches the datasource provider and driver adapter for production builds.
- `docker-compose.yml` (Postgres 16) is kept for optional production-parity testing once Docker is available.
- SQLite has no scalar lists, so `Obligation.reminderOffsets` and `NotificationPreference.mutedObligationIds` are stored as `Json` (validated with zod at the boundary).
**Consequence:** anything Postgres-specific (array operators, `ON CONFLICT` nuances, advisory locks) is avoided in application code.

## D2 — Database-backed job queue instead of pg-boss (Phase 0)
**Context:** pg-boss only runs on Postgres, which conflicts with D1.
**Decision:** a small job queue built on a Prisma `Job` table: atomic claim (`updateMany … where status = PENDING and runAt <= now`), retries with exponential backoff (max 5), and an in-process cron tick every 15 minutes. It works on both SQLite and Postgres and keeps the "no Redis" property. If we later go Postgres-only, the queue interface can be swapped for pg-boss without touching callers.

## D3 — Tooling versions (Phase 0)
- Expo SDK 58 (latest at time of build), React Native 0.88, React 19.3.
- TypeScript pinned to `~6.0` in both apps: `typescript-eslint` doesn't support TS ≥ 6.1 yet.
- Prisma pinned to stable `7.10.x` (npm's `latest` tag currently points at an 8.0 release candidate).
- npm workspaces are not used: Expo's Metro bundler is simplest with a self-contained `mobile/node_modules`. A root `package.json` provides convenience scripts (`npm run check`).
- npm 11 install-script allowlist: `esbuild` approved (needed by tsx/vitest); `@parcel/watcher` denied (prebuilt binaries are used, no node-gyp build needed).

## D4 — Repository root (Phase 0)
The repo root is this working folder (`Monitor_App`); the GitHub remote is `Annithah/dueora`. Commits use a repo-local git identity (`Annithah <uwihirweannitha@gmail.com>`), as agreed, because no global identity was configured.

## D5 — Design sources (Phase 1)
- No screenshots were supplied, so the 40 screenshots in `design/` were captured from the Figma prototype (https://rouge-warm-77431112.figma.site/) in a browser. Its stylesheet is saved as `design/prototype-styles.css` and used as the precise spec (sizes, radii, shadows, dark palette).
- `docs/requirements.md` was written from the owner's build brief, since no separate requirements file was provided. If a fuller document arrives it replaces this one.
- **Minimum text size 11px.** The prototype uses 7–10px labels (fine on a desktop mock-up, too small on a phone). The app keeps the hierarchy but enforces ≥ 11px and honours OS font scaling.
- **Status colours: two tones.** The brief's colours (Paid `#22A06B`, Upcoming `#3B82F6`, Due soon `#F59E0B`, Due today `#EA580C`, Overdue `#DC2626`, Partially paid `#7C3AED`) are used for dots, icons, charts and swatches. Badge *text* on soft backgrounds uses the prototype's darker tones (`#168258`, `#256CD5`, `#A85C00`, `#C7450A`, `#C82020`, `#6D36CC`) so it passes 4.5:1 contrast.
- The prototype's "Design system" entry in the More menu is a designer showcase; in the app that slot becomes "Notification settings".
