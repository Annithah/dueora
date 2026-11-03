import { router, useLocalSearchParams } from 'expo-router';
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  CalendarDays,
  Check,
  Building2,
  Clock3,
  Ellipsis,
  ReceiptText,
  Store,
  Tag,
  Trash2,
} from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { QueryState } from '@/components/layout/QueryState';
import { SubscriptionKeyCard } from '@/components/subscriptions/SubscriptionKeyCard';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import {
  BottomSheet,
  Button,
  Card,
  CategoryIcon,
  CountdownRing,
  EmptyState,
  IconButton,
  ListItem,
  SectionHeader,
  StatusBadge,
  Text,
  toast,
} from '@/components/ui';
import { ApiError } from '@/api';
import { useMute } from '@/features/notifications/api';
import {
  METHOD_LABELS,
  useArchiveSubscription,
  useDeleteSubscription,
  useSubscription,
  type SubscriptionDetail,
} from '@/features/subscriptions/api';
import { RecordPaymentSheet } from '@/features/subscriptions/RecordPaymentSheet';
import { usePermissions, useWorkspaceToday } from '@/features/workspaces/api';
import { formatDate, humanSpan } from '@/lib/dates';
import { formatUSD } from '@/lib/money';
import { useTheme } from '@/theme';

function offsetLabel(offset: number): string {
  if (offset === 0) return 'On due date';
  const n = Math.abs(offset);
  const unit =
    n % 7 === 0 && n >= 7 ? `${n / 7} week${n === 7 ? '' : 's'}` : `${n} day${n === 1 ? '' : 's'}`;
  if (offset === 30) return '1 month before';
  return offset > 0 ? `${unit} before` : `${unit} after`;
}

function Detail({
  o,
  menuOpen,
  setMenuOpen,
}: {
  o: SubscriptionDetail;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
}) {
  const { colors } = useTheme();
  const can = usePermissions();
  const canManage = can.manageSubscriptions;
  const mute = useMute();
  const archive = useArchiveSubscription();
  const del = useDeleteSubscription();
  const [recordOpen, setRecordOpen] = useState(false);
  // A new key per opening gives the sheet fresh fields every time.
  const [recordKey, setRecordKey] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const muted = o.muted;
  const today = useWorkspaceToday();
  const days = o.daysUntilDue;
  const active = o.status === 'ACTIVE';

  return (
    <>
      <View style={{ alignItems: 'center', gap: 4, paddingTop: 4 }}>
        <CategoryIcon icon={o.category.icon} size={58} />
        <Text variant="small" tone="muted" style={{ marginTop: 8 }}>
          {o.company.name}
          {o.provider ? ` · ${o.provider}` : ''}
        </Text>
        <Text variant="title" align="center" accessibilityRole="header">
          {o.name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginVertical: 6 }}>
          <Text variant="amountXL">{formatUSD(o.amountCents)}</Text>
        </View>
        <StatusBadge status={o.paymentStatus} />
        {o.paidCents > 0 && active ? (
          <Text variant="small" color={colors.purple} style={{ marginTop: 6 }}>
            {formatUSD(o.paidCents)} paid · {formatUSD(o.remainingCents)} left
          </Text>
        ) : null}
      </View>

      {active ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
          <CountdownRing days={days} cycleDays={o.cycleLengthDays} status={o.paymentStatus} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="eyebrow" color={days < 0 ? colors.red : colors.primaryStrong}>
              {days < 0 ? 'OVERDUE BY' : days === 0 ? 'DUE' : 'DUE IN'}
            </Text>
            <Text variant="bodyStrong">
              {days === 0 ? 'Today' : humanSpan(today, o.nextDueDate)}
            </Text>
            <Text variant="small" tone="muted">
              {days < 0 ? 'Was due' : 'Due'} {formatDate(o.nextDueDate)}
            </Text>
          </View>
        </Card>
      ) : (
        <Card tone="primary" style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          {o.status === 'ARCHIVED' ? (
            <Archive size={20} color={colors.primaryStrong} />
          ) : (
            <Check size={20} color={colors.primaryStrong} />
          )}
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {o.status === 'ARCHIVED'
              ? 'Archived — no reminders are sent.'
              : 'Fully paid. Nice work 🎉'}
          </Text>
        </Card>
      )}

      <View>
        <SectionHeader title="Renewal details" />
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <ListItem
            icon={<CalendarDays size={18} color={colors.primaryStrong} />}
            title="Billing cycle"
            trailing={<Text variant="bodyStrong">{o.frequencyLabel}</Text>}
          />
          <ListItem
            divider
            icon={<Clock3 size={18} color={colors.primaryStrong} />}
            title={o.frequencyUnit === 'ONCE' ? 'Due date' : 'Next due date'}
            trailing={<Text variant="bodyStrong">{formatDate(o.nextDueDate)}</Text>}
          />
          <ListItem
            divider
            icon={<Tag size={18} color={colors.primaryStrong} />}
            title="Category"
            trailing={<Text variant="bodyStrong">{o.category.name}</Text>}
          />
          <ListItem
            divider
            icon={<Building2 size={18} color={colors.primaryStrong} />}
            title="Company"
            trailing={<Text variant="bodyStrong">{o.company.name}</Text>}
          />
          {o.provider ? (
            <ListItem
              divider
              icon={<Store size={18} color={colors.primaryStrong} />}
              title="Provider"
              trailing={<Text variant="bodyStrong">{o.provider}</Text>}
            />
          ) : null}
          <ListItem
            divider
            icon={<CalendarDays size={18} color={colors.primaryStrong} />}
            title="Started"
            trailing={<Text variant="bodyStrong">{formatDate(o.startDate)}</Text>}
          />
        </Card>
        {o.subscriptionKey ? (
          <View style={{ marginTop: 12 }}>
            <SubscriptionKeyCard subscriptionId={o.id} value={o.subscriptionKey} canReveal={can.revealKeys} />
          </View>
        ) : null}
        {o.description ? (
          <Text variant="small" tone="muted" style={{ marginTop: 8 }}>
            {o.description}
          </Text>
        ) : null}
      </View>

      {o.reminders.length ? (
        <View>
          <SectionHeader
            title="Reminder schedule"
            action={canManage ? 'Edit' : undefined}
            onAction={() => router.push(`/subscriptions/${o.id}/edit`)}
          />
          <Card style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 }}>
            {o.reminders.map((r) => (
              <View
                key={r.offsetDays}
                style={{ width: '50%', flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 9,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: r.sent ? colors.greenSoft : colors.blueSoft,
                  }}
                >
                  {r.sent ? (
                    <Check size={14} color={colors.green} />
                  ) : (
                    <Bell size={14} color={colors.blue} />
                  )}
                </View>
                <View>
                  <Text variant="smallStrong">{offsetLabel(r.offsetDays)}</Text>
                  <Text variant="caption" tone="muted">
                    {r.sent ? 'Sent' : formatDate(r.date)}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      <View>
        <SectionHeader
          title="Payment history"
          action={o.historyTotal > o.history.length ? `View all ${o.historyTotal}` : undefined}
          onAction={() => router.push({ pathname: '/history', params: { subscriptionId: o.id, name: o.name } })}
        />
        {o.history.length ? (
          <Card style={{ paddingVertical: 4 }}>
            {o.history.map((p, i) => (
              <View
                key={p.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  minHeight: 58,
                  borderTopWidth: i ? 1 : 0,
                  borderTopColor: colors.line,
                }}
              >
                <View
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 5,
                    backgroundColor: colors.green,
                    borderWidth: 3,
                    borderColor: colors.greenSoft,
                  }}
                />
                <View style={{ flex: 1 }}>
                  <Text variant="smallStrong">{formatUSD(p.amountCents)} paid</Text>
                  <Text variant="caption" tone="muted">
                    {formatDate(p.paidOn)} · {METHOD_LABELS[p.method]}
                    {p.reference ? ` · ${p.reference}` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        ) : (
          <Text variant="small" tone="muted">
            No payments recorded yet.
          </Text>
        )}
      </View>

      {canManage && active ? (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
          <Button
            variant="secondary"
            style={{ flex: 0.7 }}
            onPress={() => router.push(`/subscriptions/${o.id}/edit`)}
          >
            Edit
          </Button>
          <Button
            style={{ flex: 1.3 }}
            icon={<ReceiptText size={18} color={colors.onPrimary} />}
            onPress={() => {
              setRecordKey((k) => k + 1);
              setRecordOpen(true);
            }}
          >
            Record payment
          </Button>
        </View>
      ) : null}

      <RecordPaymentSheet
        key={recordKey}
        subscription={o}
        today={today}
        visible={recordOpen}
        onClose={() => setRecordOpen(false)}
      />

      <TopBarMenu open={menuOpen} onClose={() => setMenuOpen(false)}>
        <ListItem
          icon={
            muted ? (
              <Bell size={19} color={colors.primaryStrong} />
            ) : (
              <BellOff size={19} color={colors.primaryStrong} />
            )
          }
          title={muted ? 'Unmute reminders' : 'Mute reminders'}
          subtitle="Only for you"
          onPress={() => {
            setMenuOpen(false);
            mute.mutate(
              { subscriptionId: o.id, muted: !muted },
              { onSuccess: () => toast.info(muted ? 'Reminders back on' : 'Muted for you') },
            );
          }}
        />
        {canManage ? (
          <ListItem
            divider
            icon={
              o.status === 'ARCHIVED' ? (
                <ArchiveRestore size={19} color={colors.primaryStrong} />
              ) : (
                <Archive size={19} color={colors.primaryStrong} />
              )
            }
            title={o.status === 'ARCHIVED' ? 'Unarchive' : 'Archive'}
            subtitle={
              o.status === 'ARCHIVED' ? 'Start reminders again' : 'Stop reminders, keep history'
            }
            onPress={() => {
              setMenuOpen(false);
              archive.mutate(
                { id: o.id, archived: o.status !== 'ARCHIVED' },
                {
                  onError: (e) =>
                    toast.error('Could not update', e instanceof ApiError ? e.message : undefined),
                },
              );
            }}
          />
        ) : null}
        {canManage && o.historyTotal === 0 ? (
          <ListItem
            divider
            destructive
            icon={<Trash2 size={19} color={colors.red} />}
            title="Delete subscription"
            onPress={() => {
              setMenuOpen(false);
              setConfirmDelete(true);
            }}
          />
        ) : null}
      </TopBarMenu>

      <BottomSheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${o.name}?`}
      >
        <Text variant="body" tone="muted">
          This removes the subscription and its reminders. It can’t be undone.
        </Text>
        <Button
          full
          variant="danger"
          loading={del.isPending}
          onPress={() =>
            del.mutate(o.id, {
              onSuccess: () => {
                setConfirmDelete(false);
                router.back();
              },
              onError: (e) =>
                toast.error('Could not delete', e instanceof ApiError ? e.message : undefined),
            })
          }
        >
          Delete
        </Button>
      </BottomSheet>
    </>
  );
}

function TopBarMenu({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <BottomSheet visible={open} onClose={onClose} title="Options">
      <Card padding={0} style={{ overflow: 'hidden' }}>
        {children}
      </Card>
    </BottomSheet>
  );
}

export default function SubscriptionDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useSubscription(id);
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Screen
      header={
        <TopBar
          title="Subscription"
          action={
            query.data ? (
              <IconButton accessibilityLabel="More options" onPress={() => setMenuOpen(true)}>
                <Ellipsis size={20} color={colors.ink} />
              </IconButton>
            ) : null
          }
        />
      }
      contentStyle={{ gap: 22, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.primary}
          onRefresh={async () => {
            setRefreshing(true);
            await query.refetch();
            setRefreshing(false);
          }}
        />
      }
    >
      <QueryState query={query}>
        {(o) =>
          o ? (
            <Detail o={o} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
          ) : (
            <EmptyState illustration="no-results" title="Subscription not found" />
          )
        }
      </QueryState>
    </Screen>
  );
}
