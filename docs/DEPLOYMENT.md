# Deployment

> This guide is completed in Phase 8 (hosting, database, storage, email, builds).
> The push-notification setup below is needed already for testing reminders on a phone.

## Push notifications on Android (FCM)

Expo delivers pushes to Android through Firebase Cloud Messaging (FCM v1). You need a Firebase project,
its `google-services.json` in the app build, and an FCM service-account key uploaded to Expo.
Push does **not** work in Expo Go on Android — use a development, preview or production build.

### 1. Create the Expo (EAS) project

```bash
npm install -g eas-cli          # or use: npx eas-cli@latest <command>
cd mobile
eas login                       # your Expo account
eas init                        # creates the project and prints its projectId
```

`eas init` writes `extra.eas.projectId` into `app.json`. The app uses it to get Expo push tokens.
(Alternatively set `EAS_PROJECT_ID` as an EAS environment variable — see `app.config.ts`.)

### 2. Create a Firebase project and Android app

1. Go to <https://console.firebase.google.com> → **Add project** (e.g. "DueOra"). Analytics can stay off.
2. **Add app → Android**. Package name: **`com.dueora.app`** (must match exactly). Nickname: DueOra.
3. Download **`google-services.json`**. Don't commit it (it's in `.gitignore`).
4. Upload it to EAS as a file environment variable so cloud builds include it:

   ```bash
   eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json \
     --environment development --environment preview --environment production --visibility secret
   ```

   For local builds you can instead keep the file at `mobile/google-services.json`.

### 3. Give Expo permission to send through FCM

1. Firebase console → ⚙️ **Project settings → Service accounts** → **Generate new private key**.
   This downloads a JSON key. Keep it private.
2. Upload it to Expo:

   ```bash
   eas credentials --platform android
   # → choose your build profile → "Google Service Account" →
   #   "Manage your Google Service Account Key for Push Notifications (FCM V1)" → upload the JSON
   ```

### 4. (Optional) Enhanced push security

If you enable **"Enhanced security for push notifications"** in your Expo account settings, create an
Expo **access token** (expo.dev → Account settings → Access tokens) and set it on the backend as
`EXPO_ACCESS_TOKEN`. Without it, leave enhanced security off.

### 5. Build and test

```bash
eas build --profile development --platform android   # dev client with push support
```

Install the APK, sign in, create your first payment and accept the notification prompt, then go to
**More → Notifications → Send test notification**. You should get "🔔 Test from DueOra" within seconds.

### Android notification channels

The app creates two channels on start (users can tune them in Android settings):

| Channel id | Name | Importance | Used for |
|---|---|---|---|
| `reminders` | Payment reminders | Default | Before-due and due-today reminders, digests, payment recorded |
| `overdue` | Overdue payments | High (distinct vibration) | Overdue reminders |
