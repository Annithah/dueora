# Deployment

Step-by-step guide to run DueOra for real: the API and the reminder worker on an always-on host, a
managed PostgreSQL database, file storage on Cloudflare R2, email through Resend, push through
Expo + Firebase, and an Android test APK built with EAS.

> Prices change — check each provider's pricing page. Figures below are approximate at the time of writing.

---

## 0. What runs where

```
 Phone (Expo app) ──HTTPS──► API (Express, Docker) ──► PostgreSQL
                                 │  └─ reminder worker (same process or its own service)
                                 ├─► Cloudflare R2   (receipts, logos)
                                 ├─► Resend          (email)
                                 └─► Expo Push ─► FCM (Android) / APNs (iOS)
```

### Why "always on" matters

Reminders are planned by a worker that must be running at each workspace's reminder hour. **Free tiers
that sleep when idle (e.g. Render free web services) are not acceptable**: a sleeping server sends no
reminders until someone happens to open the app, so a bill could become overdue silently. For the same
reason, a database that suspends itself is a poor fit: the worker checks the database every few seconds,
which keeps it awake and quickly uses up free compute hours (e.g. Neon's free tier).

### Cheapest reliable option (recommended)

**Railway (Hobby plan) — one service running API + worker, plus Railway PostgreSQL.**
Hobby is ≈ US$5/month including $5 of usage, which comfortably covers a small Node service and a small
Postgres for one or a few companies. Everything stays on 24/7 and Railway restarts the container if it crashes.

**Alternative: Render** — Starter web service (≈ $7/mo, always on) running API + worker, plus Render
Postgres Basic (≈ $6/mo). A ready-made `render.yaml` is in the repo root.

Either way, run **one** instance with `RUN_WORKER_IN_API=true`. When you grow, split the worker into its
own service (`node dist/worker.js`); several workers can run safely at the same time.

---

## 1. Accounts to create

| Service | What for | Sign up |
|---|---|---|
| GitHub | Code (repo `Annithah/dueora`) | already have |
| Railway **or** Render | API + worker + Postgres | railway.com / render.com |
| Cloudflare | R2 file storage | dash.cloudflare.com |
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

1. Resend → **Domains → Add domain** (e.g. `dueora.yourcompany.com` or your main domain).
2. Add the DNS records Resend shows (SPF `TXT`, DKIM `CNAME`s, optional DMARC) at your DNS provider.
   Wait until the domain shows **Verified**.
3. Resend → **API Keys → Create** (permission: *Sending access*, restricted to that domain). Copy it once.
4. You'll set: `RESEND_API_KEY=re_…` and `EMAIL_FROM="DueOra <reminders@your-domain>"`.

Without `RESEND_API_KEY` the API logs emails instead of sending them (useful for staging).

---

## 4. File storage — Cloudflare R2

1. Cloudflare dashboard → **R2 → Create bucket** → name `dueora-files`, location *Automatic*. Keep it **private**
   (no public access). DueOra serves files only through authenticated API routes.
2. **R2 → Manage R2 API Tokens → Create API token** → permission *Object Read & Write*, scoped to `dueora-files`.
3. Note the values:

   | Variable | Value |
   |---|---|
   | `STORAGE_DRIVER` | `s3` |
   | `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
   | `S3_REGION` | `auto` |
   | `S3_BUCKET` | `dueora-files` |
   | `S3_ACCESS_KEY_ID` | from the token |
   | `S3_SECRET_ACCESS_KEY` | from the token |

---

## 5. Backend environment variables

| Variable | Required | Example / notes |
|---|---|---|
| `NODE_ENV` | ✅ | `production` |
| `DATABASE_URL` | ✅ | `postgresql://user:pass@host:5432/dueora?sslmode=require` (the host provides it) |
| `JWT_ACCESS_SECRET` | ✅ | 48+ random chars: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `API_BASE_URL` | ✅ | `https://api.your-domain` — **must be https** (the API refuses to start otherwise) |
| `APP_URL` | ✅ | `dueora://` (deep-link scheme used in emails) |
| `RUN_WORKER_IN_API` | ✅ | `true` for the single-service setup |
| `RESEND_API_KEY`, `EMAIL_FROM` | ✅ | step 3 |
| `STORAGE_DRIVER`, `S3_*` | ✅ | step 4 |
| `EXPO_ACCESS_TOKEN` | optional | only with Expo "enhanced push security" (step 8.4) |
| `CORS_ORIGINS` | optional | leave empty (mobile apps don't send an Origin) |
| `LOG_LEVEL` | optional | `info` |
| `ACCESS_TOKEN_TTL_MINUTES`, `REFRESH_TOKEN_TTL_DAYS` | optional | defaults 15 and 30 |

Never commit these. `backend/.env.example` lists them all.

---

## 6. Deploy the backend

The production image is `backend/Dockerfile` (Node 22, multi-stage). On every start it runs
`prisma migrate deploy` against Postgres (`backend/prisma/postgres/migrations`) and then starts the API.
Migrations are idempotent, so restarts are safe.

### Option A — Railway (recommended)

1. railway.com → **New Project → Deploy from GitHub repo** → pick `dueora`.
2. In the service's **Settings**: *Root directory* = `backend` (Railway reads `backend/railway.json` and builds the Dockerfile).
3. **New → Database → PostgreSQL** in the same project.
4. Service → **Variables**: add everything from step 5. For `DATABASE_URL` use the reference
   `${{Postgres.DATABASE_URL}}`.
5. Service → **Settings → Networking → Generate domain** (or add your own, e.g. `api.your-domain`).
   Put that URL (with `https://`) in `API_BASE_URL` and redeploy.
6. Check `https://<your-domain>/health` → `{"status":"ok","database":"ok",…}`.

### Option B — Render

1. render.com → **New → Blueprint** → connect the repo. Render reads `render.yaml` (API + Postgres).
2. Fill the variables marked `sync: false` (Resend, R2, `API_BASE_URL`, `EMAIL_FROM`). `JWT_ACCESS_SECRET` is generated for you.
3. Deploy, then open `https://dueora-api.onrender.com/health`.

### Seed demo data (staging only)

```bash
# From your machine, pointing at the staging database:
cd backend
npm run db:pg:generate                                   # Postgres flavour of the Prisma client
DATABASE_URL="postgresql://…" SEED_ADMIN_PASSWORD="choose-one" npm run db:seed
npm run db:generate                                      # back to the SQLite client for local dev
```

### Changing the database schema later

```bash
cd backend
# 1. edit prisma/schema.prisma, then create the dev (SQLite) migration:
npm run db:migrate -- --name add_something
# 2. create the matching production (Postgres) migration:
npm run db:pg:migration -- add_something
git add prisma && git commit -m "feat: …"
```

A test fails if the Postgres schema falls out of sync, so you can't forget step 2.

---

## 7. Point the app at the API

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

## 8. Push notifications (Expo + Firebase)

Push on Android goes through Firebase Cloud Messaging (FCM v1). It needs a development/preview/production
build — **not Expo Go**.

### 8.1 Create the Expo project

```bash
npm install -g eas-cli
cd mobile
eas login
eas init            # creates the project; writes extra.eas.projectId into app.json — commit it
```

### 8.2 Firebase project + Android app

1. console.firebase.google.com → **Add project** ("DueOra"; Analytics optional).
2. **Add app → Android**, package name **`com.dueora.app`** (exactly).
3. Download **`google-services.json`** (do not commit it; it's git-ignored) and upload it to EAS:

   ```bash
   eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json \
     --environment development --environment preview --environment production --visibility secret
   ```

### 8.3 Let Expo send through FCM

1. Firebase → ⚙️ **Project settings → Service accounts → Generate new private key** (downloads a JSON key).
2. Upload it to Expo:

   ```bash
   eas credentials --platform android
   # → pick the profile → Google Service Account → "Manage your Google Service Account Key for
   #   Push Notifications (FCM V1)" → upload the JSON
   ```

### 8.4 Optional: enhanced push security

expo.dev → Account → Settings → enable *Enhanced push security*, create an **access token**, and set it on
the backend as `EXPO_ACCESS_TOKEN`. If you don't enable it, leave the variable empty.

### 8.5 Android channels

The app creates two channels on start (users can adjust them in Android settings):

| Channel | Importance | Used for |
|---|---|---|
| `reminders` — Payment reminders | Default | before-due, due-today, digests, payment recorded |
| `overdue` — Overdue payments | High (distinct vibration) | overdue reminders |

---

## 9. Build the Android test APK

```bash
cd mobile
eas build --profile preview --platform android
```

When it finishes, EAS prints a link/QR code: open it on the phone, download the APK and install it
(allow "install unknown apps" for your browser once). The `preview` profile builds an APK for testing; the
`production` profile builds an AAB for the Play Store (Phase 9).

Other profiles:

```bash
eas build --profile development --platform android   # dev client (hot reload + push)
eas build --profile production  --platform android   # Play Store bundle (.aab)
```

App identity (already configured): name **DueOra**, Android package **`com.dueora.app`**, icon and splash
from `mobile/assets/` (regenerate with `node scripts/generate-icons.mjs`).

---

## 10. After deploying — smoke test

1. `GET https://api…/health` → ok.
2. Install the preview APK, sign up with a real email → verification code arrives (Resend works).
3. Create a workspace, upload a logo (R2 works), add a payment due tomorrow.
4. Accept the notification prompt → More → Notifications → **Send test notification** (push works).
5. Next morning at 09:00 (workspace timezone) you should get "⏰ … is due tomorrow".
6. Work through `docs/QA_CHECKLIST.md`.

## 11. Operations

* **Logs:** JSON (pino) on stdout — view them in the Railway/Render dashboard. Each request has an `x-request-id`.
* **Health:** `/health` (used by the Docker `HEALTHCHECK` and the host).
* **Backups:** enable daily backups on the managed Postgres (Railway/Render both offer them).
* **Secrets rotation:** changing `JWT_ACCESS_SECRET` signs everyone out (they log in again); R2/Resend keys can be rotated any time.
* **Scaling:** move the worker to its own service (`node dist/worker.js`, same image and variables, set
  `RUN_WORKER_IN_API=false` on the API). Multiple API and worker instances are safe.
