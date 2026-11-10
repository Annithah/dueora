import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { toast } from '@/components/ui';
import { useSession } from '@/state/session';

import { inboxKey, useInbox } from './api';
import {
  cancelBackupFor,
  configureForegroundHandling,
  ensureAndroidChannels,
  ensureNotificationCategories,
  registerDevice,
  routeForNotification,
  setBadge,
  syncBackupReminders,
} from './push';

if (Platform.OS !== 'web') configureForegroundHandling();

/**
 * Mounted once inside the signed-in app:
 * - creates Android channels and refreshes the push token on start/sign-in
 * - opens the right screen when a notification is tapped
 * - shows foreground notifications as an in-app toast and refreshes the inbox
 */
function useNativePushSetup(): void {
  const queryClient = useQueryClient();
  const workspaceId = useSession((s) => s.activeWorkspaceId);
  const lastResponse = Notifications.useLastNotificationResponse();
  const inbox = useInbox();
  const unread = inbox.data?.unreadCount;

  useEffect(() => {
    void ensureAndroidChannels();
    void ensureNotificationCategories();
    registerDevice().catch(() => undefined);
  }, []);

  // The app icon badge follows the unread count in Alerts.
  useEffect(() => {
    if (unread !== undefined) void setBadge(unread);
  }, [unread]);

  // Local backup reminders: resync on start, on workspace switch and whenever the app comes back.
  useEffect(() => {
    if (!workspaceId) return;
    const sync = () => void syncBackupReminders().catch(() => undefined);
    sync();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && sync());
    return () => sub.remove();
  }, [workspaceId]);

  // Tap on a notification or one of its buttons (also covers launching the app from one).
  useEffect(() => {
    if (!lastResponse) return;
    const to = routeForNotification(
      lastResponse.notification.request.content.data as Record<string, unknown>,
      lastResponse.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
        ? undefined
        : lastResponse.actionIdentifier,
    );
    if (to) router.push(to as never);
    void Notifications.clearLastNotificationResponseAsync();
  }, [lastResponse]);

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const { title, body, data } = n.request.content;
      const payload = data as Record<string, unknown>;
      // The server's push made it: the local backup for the same event isn't needed.
      if (!payload?.backup) void cancelBackupFor(payload?.dedupeKey);
      const to = routeForNotification(payload);
      toast.show({
        title: title ?? 'DueOra',
        message: body ?? undefined,
        tone: (data as { type?: string })?.type === 'OVERDUE' ? 'warning' : 'info',
        onPress: to ? () => router.push(to as never) : undefined,
      });
      void queryClient.invalidateQueries({ queryKey: inboxKey(workspaceId) });
    });
    return () => sub.remove();
  }, [queryClient, workspaceId]);
}

/** Push isn't available in the web preview, so it gets a no-op. */
export const usePushSetup: () => void =
  Platform.OS === 'web' ? () => undefined : useNativePushSetup;
