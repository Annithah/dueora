# Google Play Store — preparation

Everything needed to publish DueOra on Google Play **when the owner decides to**. Nothing here has been submitted.

## 1. What is already in place
- Package `com.dueora.app`, app name **DueOra**, adaptive icon and splash (`mobile/app.json`).
- EAS `production` profile builds an **Android App Bundle** (`.aab`) with auto-incremented `versionCode`
  (`mobile/eas.json`), signed by an EAS-managed upload key.
- Privacy Policy and Terms: `https://annithah.github.io/dueora/legal/privacy.html` and `…/terms.html`
  (source in `docs/legal/`, linked from Settings → About).
- In-app account deletion (Settings → Data & privacy) — required by Play.

## 2. What the owner must do
1. Create a **Google Play Console** developer account (one-time US$25, identity verification takes a few days).
   A personal account must run a **closed test with at least 12 testers for 14 days** before production access.
2. Create the app in the Console: name DueOra, default language English, App, Free.
3. Fill in **App content**:
   - Privacy policy URL (above).
   - **Data safety**: collects name, email, financial info (bills and payments the user enters), device push token.
     Encrypted in transit: yes. Users can request deletion: yes (in-app). Shared with third parties: no (service
     providers only: hosting, email, push, optional Google Gemini for the assistant).
   - Ads: none. Target audience: 18+. Content rating questionnaire: business / productivity, no sensitive content.
   - Account deletion URL: in-app path, plus the privacy page.
4. Store listing: short description (≤ 80 chars), full description, 512×512 icon, 1024×500 feature graphic,
   at least 2 phone screenshots (take them from the preview APK).
5. Give the Console a **reviewer login**: a real test account with one workspace (no demo data is shipped, so
   create it by hand).

## 3. Build and upload (when ready)
```bash
cd mobile
eas env:create --name EXPO_PUBLIC_API_URL --value https://<production-api> --environment production --visibility plaintext
eas build --platform android --profile production
eas submit --platform android --profile production   # needs a Play service-account JSON in EAS
```
Start in the **Internal testing** track, then Closed testing, then Production.

## 4. Before each release
- `npm run check` passes (lint, type-check, tests, no sample data).
- Version bumped in `mobile/app.json` (`expo.version`); EAS bumps `versionCode`.
- Release notes written; `npm run progress` regenerated.
