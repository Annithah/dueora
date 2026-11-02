/**
 * API base URL from EXPO_PUBLIC_API_URL. Release builds refuse plain http so tokens
 * never travel unencrypted.
 */
export function resolveApiUrl(raw: string | undefined, isDev: boolean): string {
  const url = (raw ?? '').trim().replace(/\/$/, '');
  if (!url) {
    if (isDev) return 'http://localhost:4000';
    throw new Error('EXPO_PUBLIC_API_URL is not set for this build');
  }
  if (!isDev && !url.startsWith('https://')) {
    throw new Error('EXPO_PUBLIC_API_URL must use https:// in production builds');
  }
  return url;
}

export const API_URL = resolveApiUrl(process.env.EXPO_PUBLIC_API_URL, __DEV__);
