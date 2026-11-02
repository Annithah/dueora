import { existsSync } from 'node:fs';

import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extends app.json with values that must not live in git:
 * - GOOGLE_SERVICES_JSON: path to the Firebase google-services.json (EAS "file" env var)
 *   — needed for Android push (FCM). Falls back to ./google-services.json for local builds.
 * - EAS_PROJECT_ID: the Expo project id (from `eas init`), used to get Expo push tokens.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
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
