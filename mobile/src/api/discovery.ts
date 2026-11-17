import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_URL } from './config';

/**
 * The API can run behind a tunnel whose address changes when the server restarts. The server
 * publishes its current address to EXPO_PUBLIC_API_DISCOVERY_URL (a small JSON file:
 * { "apiUrl": "https://…" }); the app remembers the last one it saw and asks again whenever the
 * API can't be reached.
 */
const STORAGE_KEY = 'dueora.apiUrl';
const DISCOVERY_URL = (process.env.EXPO_PUBLIC_API_DISCOVERY_URL ?? '').trim();

let current = API_URL;
let pending: Promise<boolean> | null = null;

export function getApiUrl(): string {
  return current;
}

export function parseDiscovered(body: unknown, isDev: boolean): string | null {
  const raw = (body as { apiUrl?: unknown } | null)?.apiUrl;
  if (typeof raw !== 'string') return null;
  const url = raw.trim().replace(/\/$/, '');
  if (!/^https:\/\/[^/\s]+$/.test(url) && !(isDev && /^http:\/\/[^/\s]+$/.test(url))) return null;
  return url;
}

/** Restore the last discovered address (call once at startup). */
export async function loadSavedApiUrl(): Promise<void> {
  if (!DISCOVERY_URL) return;
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved && parseDiscovered({ apiUrl: saved }, __DEV__)) current = saved;
  } catch {
    // Keep the built-in address.
  }
}

/** Ask the discovery file for the current address. Resolves true when it changed. */
export function rediscoverApiUrl(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!DISCOVERY_URL) return Promise.resolve(false);
  pending ??= (async () => {
    try {
      const res = await fetchImpl(`${DISCOVERY_URL}?t=${Date.now()}`, { headers: { Accept: 'application/json' } });
      if (!res.ok) return false;
      const next = parseDiscovered(await res.json(), __DEV__);
      if (!next || next === current) return false;
      current = next;
      await AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    pending = null;
  });
  return pending;
}
