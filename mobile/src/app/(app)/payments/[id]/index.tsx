import { router, useLocalSearchParams } from 'expo-router';
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  CalendarDays,
  Check,
  Clock3,
  Download,
  Ellipsis,
  FileText,
  ReceiptText,
  Tag,
  Trash2,
  UserRound,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import { QueryState } from '@/components/layout/QueryState';
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
import { useMe } from '@/features/auth/api';
import { downloadAndShare } from '@/features/insights/api';
import { useMute, usePrefs } from '@/features/notifications/api';
import {
  METHOD_LABELS,
  useArchiveObligation,
  useDeleteObligation,
  useObligation,
  type ObligationDetail,
} from '@/features/obligations/api';
import { RecordPaymentSheet } from '@/features/obligations/RecordPaymentSheet';
import { formatDate, humanSpan, toISODate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme';

function offsetLabel(offset: number): string {
  if (offset === 0) return 'On due date';
  const n = Math.abs(offset);
  const unit =
    n % 7 === 0 && n >= 7 ? `${n / 7} week${n === 7 ? '' : 's'}` : `${n} day${n === 1 ? '' : 's'}`;
  if (offset === 30) return '1 month before';
  return offset > 0 ? `${unit} before` : `${unit} after`;
}

function fileSize(bytes: number): string {
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function Detail({
  o,
  menuOpen,
  setMenuOpen,
}: {
  o: ObligationDetail;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
}) {
  const { colors } = useTheme();
  const me = useMe();
  const orgId = useSession((s) => s.activeOrgId);
  const role = me.data?.workspaces.find((w) => w.id === orgId)?.role;
  const canManage =
    role === 'ADMIN' ||
    role === 'FINANCE' ||
    (role === 'DEPARTMENT' &&
      o.department?.id === me.data?.workspaces.find((w) => w.id === orgId)?.departmentId);
  const prefs = usePrefs();
  const mute = useMute();
  const archive = useArchiveObligation();
  const del = useDeleteObligation();
  const [recordOpen, setRecordOpen] = useState(false);
  // A new key per opening gives the sheet fresh fields every time.
  const [recordKey, setRecordKey] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const muted = prefs.data?.mutedObligationIds.includes(o.id) ?? false;
  const today = toISODate(new Date());
  const days = o.daysUntilDue;
  const active = o.status === 'ACTIVE';

  const share = (a: { id: string; fileName: string; mimeType: string }) =>
    downloadAndShare(`/attachments/${a.id}`, a.fileName, a.mimeType).catch(() =>
      toast.error('Could not open the file'),
    );

  return (
    <>
      <View style={{ alignItems: 'center', gap: 4, paddingTop: 4 }}>
        <CategoryIcon icon={o.icon} size={58} />
        <Text variant="small" tone="muted" style={{ marginTop: 8 }}>
          {o.platform ? `${o.platform.name} · ` : ''}
          {o.provider}
        </Text>
        <Text variant="title" align="center" accessibilityRole="header">
          {o.name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginVertical: 6 }}>
          <Text variant="amountXL">{formatMoney(o.amountMinor, o.currency)}</Text>
          <Text variant="smallStrong" tone="muted">
            {o.currency}
          </Text>
        </View>
        <StatusBadge status={o.paymentStatus} />
        {o.paidMinor > 0 && active ? (
          <Text variant="small" color={colors.purple} style={{ marginTop: 6 }}>
            {formatMoney(o.paidMinor, o.currency)} paid ·{' '}
            {formatMoney(o.remainingMinor, o.currency)} left
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
            icon={<UserRound size={18} color={colors.primaryStrong} />}
            title="Assigned to"
            trailing={<Text variant="bodyStrong">{o.assignee?.name ?? '—'}</Text>}
          />
        </Card>
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
            onAction={() => router.push(`/payments/${o.id}/edit`)}
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
          action={o.history.length ? 'View all' : undefined}
          onAction={() => router.push({ pathname: '/history', params: { obligationId: o.id } })}
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
                  <Text variant="smallStrong">{formatMoney(p.amountMinor, p.currency)} paid</Text>
                  <Text variant="caption" tone="muted">
                    {formatDate(p.paidOn)} · {METHOD_LABELS[p.method]}
                    {p.reference ? ` · ${p.reference}` : ''}
                  </Text>
                </View>
                {p.attachments[0] ? (
                  <IconButton
                    accessibilityLabel="Open receipt"
                    onPress={() => void share(p.attachments[0]!)}
                  >
                    <ReceiptText size={18} color={colors.primaryStrong} />
                  </IconButton>
                ) : null}
              </View>
            ))}
          </Card>
        ) : (
          <Text variant="small" tone="muted">
            No payments recorded yet.
          </Text>
        )}
      </View>

      {o.attachments.length ? (
        <View>
          <SectionHeader title="Attachments" />
          <View style={{ gap: 8 }}>
            {o.attachments.map((a) => (
              <Pressable
                key={a.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${a.fileName}`}
                onPress={() => void share(a)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  minHeight: 60,
                  padding: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: colors.dashed,
                  backgroundColor: colors.surface,
                }}
              >
                <FileText size={22} color={colors.primaryStrong} />
                <View style={{ flex: 1 }}>
                  <Text variant="smallStrong" numberOfLines={1}>
                    {a.fileName}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {a.mimeType === 'application/pdf' ? 'PDF' : 'Image'} · {fileSize(a.size)}
                  </Text>
                </View>
                <Download size={18} color={colors.primaryStrong} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {canManage && active ? (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
          <Button
            variant="secondary"
            style={{ flex: 0.7 }}
            onPress={() => router.push(`/payments/${o.id}/edit`)}
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
        obligation={o}
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
              { obligationId: o.id, muted: !muted },
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
        {(role === 'ADMIN' || role === 'FINANCE') && o.history.length === 0 ? (
          <ListItem
            divider
            destructive
            icon={<Trash2 size={19} color={colors.red} />}
            title="Delete payment"
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
          This removes the payment and its reminders. It can’t be undone.
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

export default function PaymentDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useObligation(id);
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Screen
      header={
        <TopBar
          title="Payment detail"
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
            <EmptyState illustration="no-results" title="Payment not found" />
          )
        }
      </QueryState>
    </Screen>
  );
}
