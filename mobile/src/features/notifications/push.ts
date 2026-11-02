import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { api } from '@/api';

const TOKEN_KEY = 'dueora.expoPushToken';

/** Notifications that arrive while the app is open show an in-app toast instead of a system banner. */
export function configureForegroundHandling(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: true,
    }),
  });
}

/** Android channels (must exist before asking for a token on Android 13+). */
export async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('reminders', {
    name: 'Payment reminders',
    description: 'Upcoming and due-today payments',
    importance: AndroidImportance.DEFAULT,
    lightColor: '#0F5C5C',
  });
  await Notifications.setNotificationChannelAsync('overdue', {
    name: 'Overdue payments',
    description: 'Payments that are past their due date',
    importance: AndroidImportance.HIGH,
    vibrationPattern: [0, 400, 200, 400],
    lightColor: '#DC2626',
  });
}

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function permissionState(): Promise<PermissionState> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

/** Ask the OS for permission (call after explaining why — never on first launch). */
export async function requestPermission(): Promise<PermissionState> {
  await ensureAndroidChannels();
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

function projectId(): string | undefined {
  return (
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
    Constants.easConfig?.projectId
  );
}

/**
 * Register (or refresh) this device's Expo push token with the API. No-op unless
 * permission is granted, we're on a real device, and an EAS project id is configured.
 */
export async function registerDevice(): Promise<string | null> {
  if (!Device.isDevice) return null;
  if ((await permissionState()) !== 'granted') return null;
  const id = projectId();
  if (!id) {
    if (__DEV__) console.warn('Push disabled: set expo.extra.eas.projectId (run `eas init`).');
    return null;
  }
  await ensureAndroidChannels();
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  await api.request('/devices', {
    method: 'POST',
    body: { expoPushToken: token, platform: Platform.OS },
    org: false,
  });
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  return token;
}

/** Stop pushes to this device for the signed-out user. Best effort. */
export async function unregisterDevice(): Promise<void> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) return;
  try {
    await api.request('/devices', { method: 'DELETE', body: { expoPushToken: token }, org: false });
  } catch {
    // Offline: the server deactivates it once Expo reports it unregistered.
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/** Where a notification should take the user. */
export function routeForNotification(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  if (typeof data.obligationId === 'string' && data.obligationId)
    return `/payments/${data.obligationId}`;
  if (data.type === 'DIGEST' || data.type === 'SYSTEM') return '/alerts';
  return null;
}
