import Constants from 'expo-constants';

/** localhost, 127.x, 10.x, 172.16–31.x and 192.168.x — addresses that only make sense on a local network. */
function isLocalHost(host: string): boolean {
  return (
    host === 'localhost' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

/**
 * API base URL from EXPO_PUBLIC_API_URL. Release builds refuse plain http so tokens
 * never travel unencrypted.
 *
 * In development, a local-network URL (e.g. http://10.110.14.12:4000) is re-pointed at the
 * machine running Metro (`devHost`), keeping its port. A laptop's Wi-Fi IP changes often; without
 * this the app keeps calling the old IP and hangs on a spinner.
 */
export function resolveApiUrl(raw: string | undefined, isDev: boolean, devHost?: string | null): string {
  const url = (raw ?? '').trim().replace(/\/$/, '');
  if (!url) {
    if (isDev) return `http://${devHost || 'localhost'}:4000`;
    throw new Error('EXPO_PUBLIC_API_URL is not set for this build');
  }
  if (!isDev && !url.startsWith('https://')) {
    throw new Error('EXPO_PUBLIC_API_URL must use https:// in production builds');
  }
  if (isDev && devHost) {
    const match = /^http:\/\/([^/:]+)(:\d+)?(\/.*)?$/.exec(url);
    if (match && isLocalHost(match[1]!) && match[1] !== devHost) {
      return `http://${devHost}${match[2] ?? ''}${match[3] ?? ''}`;
    }
  }
  return url;
}

/** Host of the dev server that served this bundle: Metro's host on a phone, the page's host on web. */
function devServerHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri; // e.g. "10.130.4.14:8081"
  if (hostUri) return hostUri.split(':')[0] ?? null;
  if (typeof window !== 'undefined' && window.location?.hostname) return window.location.hostname;
  return null;
}

export const API_URL = resolveApiUrl(
  process.env.EXPO_PUBLIC_API_URL,
  __DEV__,
  __DEV__ ? devServerHost() : null,
);
