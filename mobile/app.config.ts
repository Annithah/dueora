import { existsSync } from 'node:fs';

import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extends app.json with values that must not live in git:
 * - GOOGLE_SERVICES_JSON: path to the Firebase google-services.json (EAS "file" env var)
 *   — needed for Android push (FCM). Falls back to ./google-services.json for local builds.
 * - EAS_PROJECT_ID: the Expo project id (from `eas init`), used to get Expo push tokens.
 */
/**
 * On EAS build servers, refuse to build a preview/production app without a public https API URL.
 * Otherwise a missing EAS variable falls back to mobile/.env (a laptop's LAN IP over http): the
 * APK builds fine but can't reach the API away from that Wi-Fi, and release builds refuse plain
 * http at startup (src/api/config.ts).
 */
function assertReleaseApiUrl() {
  const profile = process.env.EAS_BUILD_PROFILE;
  if (process.env.EAS_BUILD !== 'true' || !profile || profile === 'development') return;
  const url = (process.env.EXPO_PUBLIC_API_URL ?? '').trim();
  if (!/^https:\/\/[^/]+/.test(url)) {
    throw new Error(
      `EXPO_PUBLIC_API_URL must be the deployed https API for the "${profile}" build (got "${url || 'nothing'}"). ` +
        `Set it with: eas env:create --name EXPO_PUBLIC_API_URL --value https://<your-api> --environment ${profile} --visibility plaintext`,
    );
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  assertReleaseApiUrl();
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ??
    (existsSync('./google-services.json') ? './google-services.json' : undefined);
  const projectId =
    process.env.EAS_PROJECT_ID ??
    (config.extra?.eas as { projectId?: string } | undefined)?.projectId;

  return {
    ...(config as ExpoConfig),
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
    extra: { ...config.extra, ...(projectId ? { eas: { projectId } } : {}) },
  };
};
