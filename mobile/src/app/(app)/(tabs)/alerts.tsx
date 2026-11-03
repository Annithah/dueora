import { differenceInCalendarDays } from 'date-fns';
import { router } from 'expo-router';
import { Bell, CheckCheck, CircleAlert, CircleCheck, Layers, Settings } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { OfflineBanner } from '@/components/layout/OfflineBanner';
import { PageHeader } from '@/components/layout/PageHeader';
import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import {
  Button,
  Card,
  EmptyState,
  IconButton,
  SectionHeader,
  StatusBadge,
  Text,
} from '@/components/ui';
import { useInbox, useMarkRead, type InboxItem } from '@/features/notifications/api';
import { routeForNotification } from '@/features/notifications/push';
import { useTheme, type PaymentStatus } from '@/theme';

function statusOf(n: InboxItem): PaymentStatus | null {
  switch (n.type) {
    case 'OVERDUE':
      return 'OVERDUE';
    case 'DUE_TODAY':
      return 'DUE_TODAY';
    case 'PAYMENT_RECORDED':
      return 'PAID';
    case 'REMINDER':
      return (n.offsetDays ?? 99) <= 7 ? 'DUE_SOON' : 'UPCOMING';
    default:
      return null;
  }
}

function groupOf(createdAt: string): 'Today' | 'This week' | 'Earlier' {
  const days = differenceInCalendarDays(new Date(), new Date(createdAt));
  return days === 0 ? 'Today' : days < 7 ? 'This week' : 'Earlier';
}

function AlertRow({
  n,
  divider,
  onPress,
}: {
  n: InboxItem;
  divider: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const status = statusOf(n);
  const Icon =
    n.type === 'OVERDUE'
      ? CircleAlert
      : n.type === 'PAYMENT_RECORDED'
        ? CircleCheck
        : n.type === 'DIGEST'
          ? Layers
          : Bell;
  const unread = !n.readAt;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${n.title}. ${n.body}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: 10,
        padding: 13,
        minHeight: 88,
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: colors.line,
        backgroundColor: pressed
          ? colors.primarySoft
          : n.type === 'OVERDUE' && unread
            ? colors.redSoft
            : colors.surface,
      })}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={18} color={n.type === 'OVERDUE' ? colors.red : colors.primaryStrong} />
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <Text variant="smallStrong">{n.title}</Text>
        <Text variant="small" tone="muted">
          {n.body}
        </Text>
        {status ? <StatusBadge status={status} pulse={false} /> : null}
      </View>
      {unread ? (
        <View
          accessibilityElementsHidden
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            marginTop: 5,
            backgroundColor: colors.blue,
          }}
        />
      ) : null}
    </Pressable>
  );
}

export default function AlertsTab() {
  const { colors } = useTheme();
  const inbox = useInbox();
  const markRead = useMarkRead();
  const [refreshing, setRefreshing] = useState(false);

  return (
    <Screen
      edges={['top']}
      contentStyle={{ gap: 18, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.primary}
          onRefresh={async () => {
            setRefreshing(true);
            await inbox.refetch();
            setRefreshing(false);
          }}
        />
      }
    >
      <PageHeader
        eyebrow="Keep watch"
        title="Alerts"
        right={
          <IconButton
            accessibilityLabel="Notification settings"
            onPress={() => router.push('/settings/notifications')}
          >
            <Settings size={20} color={colors.ink} />
          </IconButton>
        }
      />
      <OfflineBanner message="You're offline. Showing your latest alerts." />
      <QueryState query={inbox}>
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState
              illustration="all-caught-up"
              title="All caught up 🎉"
              message="Reminders and updates will appear here."
            />
          ) : (
            <View style={{ gap: 18 }}>
              {data.unreadCount > 0 ? (
                <Button
                  variant="ghost"
                  icon={<CheckCheck size={18} color={colors.primaryStrong} />}
                  style={{ alignSelf: 'flex-end', marginTop: -10 }}
                  onPress={() => markRead.mutate('all')}
                >
                  Mark all as read
                </Button>
              ) : null}
              {(['Today', 'This week', 'Earlier'] as const).map((group) => {
                const items = data.items.filter((n) => groupOf(n.createdAt) === group);
                if (!items.length) return null;
                return (
                  <Animated.View key={group} entering={FadeIn} layout={LinearTransition}>
                    <SectionHeader title={group} />
                    <Card padding={0} style={{ overflow: 'hidden' }}>
                      {items.map((n, i) => (
                        <AlertRow
                          key={n.id}
                          n={n}
                          divider={i > 0}
                          onPress={() => {
                            if (!n.readAt) markRead.mutate(n.id);
                            const to = routeForNotification({
                              ...n.data,
                              subscriptionId: n.subscriptionId ?? undefined,
                              type: n.type,
                            });
                            if (to && to !== '/alerts') router.push(to as never);
                          }}
                        />
                      ))}
                    </Card>
                  </Animated.View>
                );
              })}
            </View>
          )
        }
      </QueryState>
    </Screen>
  );
}
