import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { toast } from '@/components/ui';
import { useSession } from '@/state/session';

import { inboxKey } from './api';
import {
  configureForegroundHandling,
  ensureAndroidChannels,
  registerDevice,
  routeForNotification,
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

  useEffect(() => {
    void ensureAndroidChannels();
    registerDevice().catch(() => undefined);
  }, []);

  // Tap on a notification (also covers launching the app from one).
  useEffect(() => {
    if (!lastResponse || lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER)
      return;
    const to = routeForNotification(
      lastResponse.notification.request.content.data as Record<string, unknown>,
    );
    if (to) router.push(to as never);
    void Notifications.clearLastNotificationResponseAsync();
  }, [lastResponse]);

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const { title, body, data } = n.request.content;
      const to = routeForNotification(data as Record<string, unknown>);
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
