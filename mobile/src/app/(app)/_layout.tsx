import { Redirect, Stack, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { EmptyState } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { usePushSetup } from '@/features/notifications/usePushSetup';
import { usePendingInvite } from '@/state/pendingInvite';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme';

export default function AppLayout() {
  const { colors } = useTheme();
  const me = useMe();
  const segments = useSegments();
  const activeWorkspaceId = useSession((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useSession((s) => s.setActiveWorkspace);
  const pendingInvite = usePendingInvite((s) => s.token);
  const workspaces = me.data?.workspaces;
  usePushSetup();

  // Keep the active workspace valid (e.g. after being removed from one).
  useEffect(() => {
    if (!workspaces) return;
    if (!workspaces.some((w) => w.id === activeWorkspaceId)) void setActiveWorkspace(workspaces[0]?.id ?? null);
  }, [workspaces, activeWorkspaceId, setActiveWorkspace]);

  if (me.isPending) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.canvas,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (me.isError && !me.data) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.canvas }}>
        <EmptyState
          illustration="offline"
          title="Can't reach DueOra"
          message="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void me.refetch()}
        />
      </View>
    );
  }

  const inSetup = segments.includes('setup' as never);
  if (pendingInvite)
    return <Redirect href={{ pathname: '/invite', params: { token: pendingInvite } }} />;
  if (!inSetup && me.data && me.data.workspaces.length === 0) {
    return <Redirect href={me.data.emailVerified ? '/setup/workspace' : '/setup/verify-email'} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="setup" />
      <Stack.Screen name="subscriptions/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="subscriptions/[id]" />
      <Stack.Screen name="notifications-permission" options={{ presentation: 'modal' }} />
      <Stack.Screen name="settings/notifications" />
    </Stack>
  );
}
