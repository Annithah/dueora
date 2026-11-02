import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Illustration } from '@/components/illustrations/Illustration';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { Avatar, Button, Card, EmptyState, FormMessage, Text, toast } from '@/components/ui';
import { ApiError } from '@/api';
import { ROLE_LABELS, useAcceptInvite, useInvitePreview } from '@/features/workspaces/api';
import { usePendingInvite } from '@/state/pendingInvite';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme';

/** Deep link target: dueora://invite?token=… — works signed in or out. */
export default function AcceptInvite() {
  const { colors } = useTheme();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const signedIn = useSession((s) => s.status === 'signedIn');
  const setPending = usePendingInvite((s) => s.set);
  const preview = useInvitePreview(token);
  const accept = useAcceptInvite();

  // Clear the stash once we're showing it.
  useEffect(() => {
    if (signedIn && token) setPending(null);
  }, [signedIn, token, setPending]);

  const goToAuth = (to: '/signup' | '/login') => {
    if (token) setPending(token);
    router.replace(to);
  };

  const onAccept = () => {
    if (!token) return;
    accept.mutate(token, {
      onSuccess: (ws) => {
        toast.success(`Welcome to ${ws.name} 👋`);
        router.replace('/');
      },
    });
  };

  let body;
  if (!token || preview.isError) {
    body = (
      <EmptyState
        illustration="error"
        title="This invitation can't be used"
        message={
          preview.error instanceof ApiError
            ? preview.error.message
            : 'The link is incomplete or has expired. Ask for a new invitation.'
        }
        actionLabel="Go home"
        onAction={() => router.replace('/')}
      />
    );
  } else if (preview.isPending) {
    body = <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;
  } else {
    const inv = preview.data;
    body = (
      <View style={{ gap: 20, alignItems: 'center' }}>
        <Illustration name="team" size={180} />
        <Card style={{ alignSelf: 'stretch', flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Avatar
            name={inv.organization.name}
            imageUrl={inv.organization.logoUrl}
            color={colors.primary}
            size={52}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="section">{inv.organization.name}</Text>
            <Text variant="small" tone="muted">
              {inv.invitedBy} invited you as {ROLE_LABELS[inv.role]}
            </Text>
          </View>
        </Card>
        <Text variant="body" tone="muted" align="center">
          This invitation is for <Text variant="bodyStrong">{inv.email}</Text>.
        </Text>
        <FormMessage
          message={
            accept.error instanceof ApiError
              ? accept.error.message
              : accept.error
                ? 'Could not accept the invitation'
                : null
          }
        />
        {signedIn ? (
          <Button full size="lg" loading={accept.isPending} onPress={onAccept}>
            Join {inv.organization.name}
          </Button>
        ) : (
          <View style={{ alignSelf: 'stretch', gap: 10 }}>
            <Button full size="lg" onPress={() => goToAuth('/signup')}>
              Create account to join
            </Button>
            <Button full variant="secondary" onPress={() => goToAuth('/login')}>
              I already have an account
            </Button>
          </View>
        )}
      </View>
    );
  }

  return (
    <Screen header={<TopBar title="Invitation" onBack={() => router.replace('/')} />}>
      {body}
    </Screen>
  );
}
