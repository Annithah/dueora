import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { secureStorage as SecureStore } from '@/lib/secureStorage';
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
    description: 'Upcoming and due-today bills',
    importance: AndroidImportance.DEFAULT,
    lightColor: '#0F5C5C',
  });
  await Notifications.setNotificationChannelAsync('overdue', {
    name: 'Overdue bills',
    description: 'Payments that are past their due date',
    importance: AndroidImportance.HIGH,
    // Distinct from reminders: a longer pattern and the alarm-style default sound.
    vibrationPattern: [0, 500, 250, 500, 250, 500],
    sound: 'default',
    lightColor: '#DC2626',
  });
  await Notifications.setNotificationChannelAsync('digest', {
    name: 'Digests and summaries',
    description: 'Weekly digest and monthly summary',
    importance: AndroidImportance.LOW,
  });
  await Notifications.setNotificationChannelAsync('team', {
    name: 'Team activity',
    description: 'Members joining and role changes',
    importance: AndroidImportance.LOW,
  });
}

/** Category id the server puts on reminder and overdue pushes. */
export const REMINDER_CATEGORY = 'bill-reminder';
export const ACTIONS = { markPaid: 'mark-paid', snooze: 'snooze', open: 'open' } as const;

/** "Mark as paid", "Snooze" and "Open" buttons on reminder pushes. Each opens the app. */
export async function ensureNotificationCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY, [
    {
      identifier: ACTIONS.markPaid,
      buttonTitle: '✅ Mark as paid',
      options: { opensAppToForeground: true },
    },
    {
      identifier: ACTIONS.snooze,
      buttonTitle: '😴 Snooze',
      options: { opensAppToForeground: true },
    },
    { identifier: ACTIONS.open, buttonTitle: 'Open', options: { opensAppToForeground: true } },
  ]);
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
  await ensureNotificationCategories();
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

/**
 * Where a notification should take the user. Action buttons add what to open on arrival:
 * "Mark as paid" → the Record payment sheet, "Snooze" → the snooze choices.
 */
export function routeForNotification(
  data: Record<string, unknown> | undefined,
  action?: string,
): string | null {
  if (!data) return null;
  if (typeof data.billId === 'string' && data.billId) {
    const base = `/bills/${data.billId}`;
    if (action === ACTIONS.markPaid) return `${base}?record=1`;
    if (action === ACTIONS.snooze) return `${base}?snooze=1`;
    return base;
  }
  switch (data.type) {
    case 'WEEKLY_DIGEST':
      return '/calendar';
    case 'MONTHLY_SUMMARY':
      return '/reports';
    case 'BUDGET_ALERT':
      return '/settings/budgets';
    case 'TEAM':
      return '/team';
    case 'DIGEST':
    case 'SYSTEM':
      return '/alerts';
    default:
      return null;
  }
}

/** The app icon badge shows unread alerts. */
export async function setBadge(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {
    // Some launchers don't support badges.
  }
}

export interface BackupEvent {
  key: string;
  billId: string;
  type: 'DUE_TODAY' | 'OVERDUE';
  fireAt: string;
  title: string;
  body: string;
  url: string;
}

/**
 * Local backup reminders: replace every scheduled backup with the server's list for the
 * next 14 days. Events whose push was delivered, or that were paid, muted or snoozed, are
 * no longer in the list — so rescheduling from it cancels them.
 */
export async function syncBackupReminders(): Promise<number> {
  if (Platform.OS === 'web' || (await permissionState()) !== 'granted') return 0;
  const events = await api.get<BackupEvent[]>('/notifications/backup');
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => (n.content.data as { backup?: boolean } | null)?.backup)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  const now = Date.now();
  for (const e of events) {
    const date = new Date(e.fireAt);
    if (date.getTime() <= now) continue;
    await Notifications.scheduleNotificationAsync({
      // The same key as the server notification, so a backup and a push are recognisably one event.
      identifier: `backup:${e.key}`,
      content: {
        title: e.title,
        body: e.body,
        data: {
          backup: true,
          billId: e.billId,
          type: e.type,
          dedupeKey: e.key,
          url: e.url,
        },
        categoryIdentifier: REMINDER_CATEGORY,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
        channelId: e.type === 'OVERDUE' ? 'overdue' : 'reminders',
      },
    });
  }
  return events.length;
}

/** A push arrived for an event: drop the local backup with the same key. */
export async function cancelBackupFor(dedupeKey: unknown): Promise<void> {
  if (typeof dedupeKey !== 'string' || !dedupeKey) return;
  await Notifications.cancelScheduledNotificationAsync(`backup:${dedupeKey}`).catch(
    () => undefined,
  );
}
