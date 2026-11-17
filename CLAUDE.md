# DueOra — notes for Claude

Bills & renewals tracker: `backend/` (Express 5, Prisma, SQLite by default / Postgres optional, Vitest) and
`mobile/` (Expo SDK 58, Expo Router, Jest). Read `PROGRESS.md`, `DECISIONS.md` and `docs/FEATURE_STATUS.md` first.

## Rules that never change
- Items are **Bills**. Categories belong to each company and are admin-configurable; nothing seeded or hardcoded
  (no company, person or category names in code, seeds or tests — `npm run check:no-sample-data`).
- USD only, integer cents. Real data only, no mock/demo data.
- Company access (all or chosen companies) is enforced on every endpoint, notification, report, export and AI answer.
- Bill reference/account numbers: encrypted, masked, never logged, never sent to the AI or Sentry.
- Light mode default; Settings → Appearance: Light / Dark / System.
- `GEMINI_API_KEY` lives only on the backend.
- Notifications: dedupe key, digest instead of spam, company-based recipients.
- Stop before publishing to the Google Play Store.
- Conventional Commits; update `PROGRESS.md` and `docs/FEATURE_STATUS.md` after each task; run `npm run progress`
  at the end of every session.

## Machine notes
- The repo sits in OneDrive: tests are slow (backend ≈ 10 min, mobile ≈ 6 min); mobile `listControls.test.tsx`
  can time out in a full run but passes alone.
- `gh` is a portable install: `$env:LOCALAPPDATA\gh-cli\bin\gh.exe`. Docker, Maestro and an Android emulator are
  not installed. EAS CLI is logged in as `anitha_dev`.

## Current status (17 Nov 2026)
- **Progress:** see https://annithah.github.io/dueora/progress/ (or `docs/progress/index.html` after
  `npm run progress`). All Finalize Parts 1–7 done; Part 8 AI done; Sentry, legal pages, Play Store notes, Maestro
  flows (not run), progress page, install page and QR code done.
- **Blocked on the owner** (full list in `PROGRESS.md` → "Waiting on Anii"): `gh auth login`; a hosting account for
  the backend (Render blueprint ready); production DB choice; production secrets; Firebase for push.
- **Next session:**
  1. Once `gh` is logged in: enable Pages with source "GitHub Actions"
     (`gh api -X POST repos/Annithah/dueora/pages -f build_type=workflow`) and re-run the Progress workflow.
  2. Once the backend is deployed: `eas env:create --name EXPO_PUBLIC_API_URL --value https://<api> --environment
     preview --visibility plaintext`, then `eas build --platform android --profile preview`, download the APK,
     `gh release create v1.1.0 DueOra-v1.1.0.apk`, set `"published": true` plus the EAS build URL/ID in
     `docs/progress/release.json`, run `npm run progress`.
  3. Run the Maestro flows in `mobile/e2e/` against the preview APK and fix any label mismatches; verify push on a
     real phone.
