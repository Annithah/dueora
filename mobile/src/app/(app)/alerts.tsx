import { differenceInCalendarDays } from 'date-fns';
import { router } from 'expo-router';
import {
  Bell,
  BellOff,
  CalendarRange,
  Check,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  Gift,
  Layers,
  PieChart,
  Repeat,
  Settings,
  TrendingUp,
  UsersRound,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { AppState, Linking, Pressable, RefreshControl, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { OfflineBanner } from '@/components/layout/OfflineBanner';
import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
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
import {
  permissionState,
  routeForNotification,
  type PermissionState,
} from '@/features/notifications/push';
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
    {
      OVERDUE: CircleAlert,
      PAYMENT_RECORDED: CircleCheck,
      DIGEST: Layers,
      TRIAL_ENDING: Gift,
      AUTO_RENEW_NOTICE: Repeat,
      PRICE_CHANGE: TrendingUp,
      BUDGET_ALERT: PieChart,
      WEEKLY_DIGEST: CalendarRange,
      MONTHLY_SUMMARY: PieChart,
      TEAM: UsersRound,
    }[n.type as string] ?? Bell;
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

/** Swipe left on an unread alert to mark it as read. */
function SwipeToRead({
  enabled,
  onRead,
  children,
}: {
  enabled: boolean;
  onRead: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  if (!enabled) return <>{children}</>;
  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={60}
      overshootRight={false}
      onSwipeableOpen={(_dir) => onRead()}
      renderRightActions={() => (
        <View
          style={{
            width: 110,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          <Check size={20} color={colors.onPrimary} />
          <Text variant="captionStrong" color={colors.onPrimary}>
            Mark read
          </Text>
        </View>
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

export default function AlertsScreen() {
  const { colors } = useTheme();
  const inbox = useInbox();
  const markRead = useMarkRead();
  const [refreshing, setRefreshing] = useState(false);
  const [permission, setPermission] = useState<PermissionState>('granted');

  useEffect(() => {
    const check = () =>
      void permissionState()
        .then(setPermission)
        .catch(() => undefined);
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, []);

  return (
    <Screen
      header={
        <TopBar
          title="Alerts"
          action={
            <IconButton
              accessibilityLabel="Notification settings"
              onPress={() => router.push('/settings/notifications')}
            >
              <Settings size={20} color={colors.ink} />
            </IconButton>
          }
        />
      }
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
      <OfflineBanner message="You're offline. Showing your latest alerts." />
      {permission === 'denied' ? (
        <Card tone="accent" style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <BellOff size={22} color={colors.amberText} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">Notifications are off</Text>
            <Text variant="small" tone="muted">
              Turn them on so reminders reach you even when DueOra is closed. 🔔
            </Text>
          </View>
          <Button variant="secondary" onPress={() => void Linking.openSettings()}>
            Enable notifications
          </Button>
        </Card>
      ) : null}
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
                        <SwipeToRead
                          key={n.id}
                          enabled={!n.readAt}
                          onRead={() => markRead.mutate(n.id)}
                        >
                          <AlertRow
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
                        </SwipeToRead>
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
