# Deployment

Step-by-step guide to run DueOra for real: the API and the reminder worker in one always-on container,
the SQLite database on a persistent disk, email through Resend, push through Expo + Firebase, and an
Android test APK built with EAS.

> Prices change — check each provider's pricing page. Figures below are approximate at the time of writing.

---

## 0. What runs where

```
 Phone (Expo app) ──HTTPS──► API + reminder worker (one Docker container)
                                 ├─► SQLite database   (/data/dueora.db on a persistent disk)
                                 ├─► Resend            (email)
                                 └─► Expo Push ─► FCM  (Android) / APNs (iOS)
```

There is no file storage: DueOra has no attachments, receipts or logos.

### Why "always on" matters

Reminders are planned by a worker that must be running at each workspace's reminder hour (09:00 local by
default). **Free tiers that sleep when idle are not acceptable**: a sleeping server sends no reminders until
someone happens to open the app, so a bill could become overdue silently. Free instances also have no
persistent disk, so the SQLite file would be wiped on every deploy or restart.

### Cheapest reliable option (recommended)

**Render Starter web service + 1 GB persistent disk** — about **US$7.25/month** (Starter ≈ $7, disk ≈ $0.25/GB).
It is always on, restarts the container if it crashes, keeps `/data` across deploys, and takes daily disk
snapshots. A ready-made `render.yaml` blueprint is in the repo root.

**Alternative: Railway Hobby** (≈ $5/month including $5 usage) with a **volume** mounted at `/data`.

Either way run **exactly one instance** with `RUN_WORKER_IN_API=true` (the image default). SQLite allows one
writer host; the API and worker share the database inside that one container (WAL mode).

> Want PostgreSQL instead (e.g. to run several instances)? Build the image with
> `--build-arg DB_PROVIDER=postgres`, set `DATABASE_URL=postgresql://…`, and use a managed Postgres
> (Render Postgres, Railway Postgres or Neon's paid tier). The matching schema and migrations live in
> `backend/prisma/postgres/` and are kept in sync by a test.

---

## 1. Accounts to create

| Service | What for | Sign up |
|---|---|---|
| GitHub | Code (repo `Annithah/dueora`) | already have |
| Render **or** Railway | API + worker + disk | render.com / railway.com |
| Resend | Email | resend.com |
| Expo | Builds (EAS) and push | expo.dev |
| Firebase (Google) | Android push (FCM) | console.firebase.google.com |
| A domain | Email sending domain, optional API domain | any registrar |

---

## 2. Push the code to GitHub

```bash
git remote -v                      # origin → https://github.com/Annithah/dueora.git
git push -u origin main            # create the empty repo on GitHub first
```

---

## 3. Email — Resend

1. Resend → **Domains → Add domain** (e.g. your company domain).
2. Add the DNS records Resend shows (SPF `TXT`, DKIM `CNAME`s, optional DMARC) at your DNS provider.
   Wait until the domain shows **Verified**.
3. Resend → **API Keys → Create** (permission: *Sending access*, restricted to that domain). Copy it once.
4. You'll set `RESEND_API_KEY=re_…` and `EMAIL_FROM="DueOra <reminders@your-domain>"`.

Without `RESEND_API_KEY` the API writes emails to the log instead of sending them (fine for staging).

---

## 4. Backend environment variables

| Variable | Required | Example / notes |
|---|---|---|
| `NODE_ENV` | ✅ | `production` |
| `DATABASE_URL` | ✅ | `file:/data/dueora.db` (the image default) |
| `JWT_ACCESS_SECRET` | ✅ | 48+ random chars: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `ACCOUNT_REF_SECRET` | ✅ | 48+ random chars (same command). Encrypts account references (AES-256-GCM). **Never change it once real data exists** — stored keys could no longer be decrypted. Keep a copy in your password manager. |
| `API_BASE_URL` | ✅ | `https://api.your-domain` — **must be https** (the API refuses to start otherwise) |
| `APP_URL` | ✅ | `dueora://` (deep-link scheme used in emails) |
| `RUN_WORKER_IN_API` | ✅ | `true` (image default) |
| `RESEND_API_KEY`, `EMAIL_FROM` | ✅ | step 3 |
| `EXPO_ACCESS_TOKEN` | optional | only with Expo "enhanced push security" (step 7.4) |
| `CORS_ORIGINS` | optional | leave empty (mobile apps don't send an Origin) |
| `LOG_LEVEL` | optional | `info` |
| `ACCESS_TOKEN_TTL_MINUTES`, `REFRESH_TOKEN_TTL_DAYS` | optional | defaults 15 and 30 |

Never commit these. `backend/.env.example` lists them all.

---

## 5. Deploy the backend

The production image is `backend/Dockerfile` (Node 22, multi-stage). On every start it:

1. makes the `/data` disk writable and drops to the unprivileged `node` user,
2. runs `prisma migrate deploy` (idempotent, so restarts are safe),
3. inserts the default categories if they're missing — **the only data DueOra ever seeds**,
4. starts the API and the reminder worker.

### Option A — Render (recommended)

1. render.com → **New → Blueprint** → connect the `dueora` repo. Render reads `render.yaml`
   (Starter web service + 1 GB disk at `/data`). `JWT_ACCESS_SECRET` and `ACCOUNT_REF_SECRET`
   are generated for you — copy `ACCOUNT_REF_SECRET` into your password manager.
2. Fill the variables marked `sync: false`: `API_BASE_URL`, `RESEND_API_KEY`, `EMAIL_FROM`
   (and `EXPO_ACCESS_TOKEN` if you use it).
3. Deploy, then open `https://dueora-api.onrender.com/health` → `{"status":"ok","database":"ok",…}`.
4. Optional: **Settings → Custom domain** (e.g. `api.your-domain`), then update `API_BASE_URL`.

### Option B — Railway

1. railway.com → **New Project → Deploy from GitHub repo** → pick `dueora`.
2. Service **Settings**: *Root directory* = `backend` (Railway reads `backend/railway.json` and builds the Dockerfile).
3. Service → **Volumes → New volume**, mount path **`/data`**.
4. Service → **Variables**: everything from step 4 (`DATABASE_URL=file:/data/dueora.db`).
5. **Settings → Networking → Generate domain**; put that `https://…` URL in `API_BASE_URL` and redeploy.
6. Check `/health`.

### After the first deploy

The database contains only the nine default categories. Open the app, sign up, and create your workspace and
first company — all real data is entered through the app. **Do not seed demo data into production.**

### Changing the database schema later

```bash
cd backend
npm run db:migrate -- --name add_something        # 1. SQLite migration (used in production)
npm run db:pg:migration -- add_something          # 2. matching Postgres migration (optional path)
git add prisma && git commit -m "feat: …"
```

A test fails if the Postgres schema falls out of sync.

---

## 6. Point the app at the API

`EXPO_PUBLIC_API_URL` is baked into each build. Set it per EAS environment:

```bash
cd mobile
eas env:create --name EXPO_PUBLIC_API_URL --value https://api.your-domain \
  --environment preview --environment production --visibility plaintext
# development builds can use your computer's LAN address, e.g. http://192.168.1.20:4000
eas env:create --name EXPO_PUBLIC_API_URL --value http://192.168.1.20:4000 --environment development --visibility plaintext
```

Release builds refuse a non-`https` URL. Only `EXPO_PUBLIC_*` values reach the app — never put secrets there.

---

## 7. Push notifications (Expo + Firebase)

Push on Android goes through Firebase Cloud Messaging (FCM v1). It needs a development/preview/production
build — **not Expo Go**.

### 7.1 Create the Expo project

```bash
npm install -g eas-cli
cd mobile
eas login
eas init            # creates the project; writes extra.eas.projectId into app.json — commit it
```

### 7.2 Firebase project + Android app

1. console.firebase.google.com → **Add project** ("DueOra"; Analytics optional).
2. **Add app → Android**, package name **`com.dueora.app`** (exactly).
3. Download **`google-services.json`** (do not commit it; it's git-ignored) and upload it to EAS:

   ```bash
   eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json \
     --environment development --environment preview --environment production --visibility secret
   ```

### 7.3 Let Expo send through FCM

1. Firebase → ⚙️ **Project settings → Service accounts → Generate new private key** (downloads a JSON key).
2. Upload it to Expo:

   ```bash
   eas credentials --platform android
   # → pick the profile → Google Service Account → "Manage your Google Service Account Key for
   #   Push Notifications (FCM V1)" → upload the JSON
   ```

### 7.4 Optional: enhanced push security

expo.dev → Account → Settings → enable *Enhanced push security*, create an **access token**, and set it on
the backend as `EXPO_ACCESS_TOKEN`. If you don't enable it, leave the variable empty.

### 7.5 Android channels

The app creates two channels on start (users can adjust them in Android settings):

| Channel | Importance | Used for |
|---|---|---|
| `reminders` — Bill reminders | Default | before-due, due-today, digests, payment recorded |
| `overdue` — Overdue bills | High (distinct vibration) | overdue reminders |

---

## 8. Build the Android test APK

```bash
cd mobile
eas build --profile preview --platform android
```

When it finishes, EAS prints a link/QR code: open it on the phone, download the APK and install it (allow
"install unknown apps" for your browser once). `preview` builds an APK for testing; `production` builds an
AAB for the Play Store (Phase 9, not done yet).

```bash
eas build --profile development --platform android   # dev client (hot reload + push)
eas build --profile production  --platform android   # Play Store bundle (.aab)
```

App identity (already configured): name **DueOra**, Android package **`com.dueora.app`**, icon and splash from
`mobile/assets/` (regenerate with `node scripts/generate-icons.mjs`).

---

## 9. After deploying — smoke test

1. `GET https://api…/health` → ok.
2. Install the preview APK, sign up, then use **Forgot password** with a real email → the reset code arrives (Resend works).
3. Create the workspace and first company; add a bill due tomorrow with an account reference.
4. Accept the notification prompt → More → Notifications → **Send test notification** (push works).
5. Next morning at 09:00 (workspace timezone) you should get "⏰ <Company> · <Bill> is due tomorrow — $…".
6. Work through `docs/QA_CHECKLIST.md`.

## 10. Operations

* **Logs:** JSON (pino) on stdout — Render/Railway dashboard. Each request has an `x-request-id`.
  Request bodies and account references are redacted from logs.
* **Health:** `/health` (Docker `HEALTHCHECK` and the host).
* **Backups:** Render snapshots disks daily; on Railway enable volume backups. For an extra copy, download
  `/data/dueora.db` from a shell occasionally (`sqlite3 /data/dueora.db ".backup /tmp/copy.db"`).
* **Secrets:** changing `JWT_ACCESS_SECRET` signs everyone out (they log in again). **Never change
  `ACCOUNT_REF_SECRET`** after real keys are stored. Resend/Expo keys can be rotated any time.
* **Scaling:** SQLite means one instance. If you outgrow it, switch to the Postgres build (section 0) and then
  split the worker into its own service (`node dist/worker.js`, `RUN_WORKER_IN_API=false` on the API);
  several workers can run safely at the same time.

---

## Current setup (17 Nov 2026): this PC + SQLite + Cloudflare tunnel (D41)

No hosting account is used. From the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-server.ps1
```

- First run creates `%USERPROFILE%\DueOraServer\server.env` with new secrets (back this file up; never change
  `ACCOUNT_REF_SECRET` once there is data). Add `RESEND_API_KEY`, `EMAIL_FROM`, `GEMINI_API_KEY` there when you have them,
  then restart the script.
- Database: `%USERPROFILE%\DueOraServer\dueora.db`; backups in `…\backups`; logs in `…\logs`.
- Needs `cloudflared` at `%LOCALAPPDATA%\cloudflared\cloudflared.exe` (official, signed download from
  github.com/cloudflare/cloudflared/releases).
- Each start publishes the address to `docs/api.json`; the APK finds it there. Keep the PC on and awake (Settings →
  System → Power → Sleep: Never while plugged in) or reminders stop.
- EAS `preview` variables: `EXPO_PUBLIC_API_URL` (fallback address) and
  `EXPO_PUBLIC_API_DISCOVERY_URL=https://raw.githubusercontent.com/Annithah/dueora/main/docs/api.json`.
