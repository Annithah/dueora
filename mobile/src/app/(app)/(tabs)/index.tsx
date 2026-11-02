import { router } from 'expo-router';
import { BarChart3, Bell, CalendarDays, Plus, ReceiptText } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { BarChart, DonutChart, monthShort } from '@/components/charts/Charts';
import { OfflineBanner } from '@/components/layout/OfflineBanner';
import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { WorkspaceSwitcher } from '@/components/layout/WorkspaceSwitcher';
import { PaymentRow } from '@/components/payments/PaymentRow';
import {
  Avatar,
  Card,
  EmptyState,
  IconButton,
  SectionHeader,
  Skeleton,
  Text,
} from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { useDashboard, type Dashboard, type MoneyBlock } from '@/features/insights/api';
import { useInbox } from '@/features/notifications/api';
import { greetingFor } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { useSession } from '@/state/session';
import { elevation, radius, spacing, statusBrand, useTheme } from '@/theme';

function SummaryCard({
  label,
  block,
  sub,
  dot,
}: {
  label: string;
  block: MoneyBlock;
  sub: string;
  dot: string;
}) {
  const { colors } = useTheme();
  const primary = block.totals.length === 1 ? block.totals[0]! : block.converted;
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${formatMoney(primary.amountMinor, primary.currency)}, ${sub}`}
      style={{
        width: 164,
        minHeight: 120,
        padding: 14,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.surface,
        shadowColor: colors.shadow,
        ...elevation.soft,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
        <Text variant="smallStrong" tone="muted">
          {label}
        </Text>
      </View>
      <Text variant="title" style={{ marginTop: 14 }} numberOfLines={1} adjustsFontSizeToFit>
        {formatMoney(primary.amountMinor, primary.currency, { compact: true })}
      </Text>
      <Text variant="caption" tone="muted" style={{ marginTop: 4 }} numberOfLines={2}>
        {sub}
      </Text>
    </View>
  );
}

function subline(block: MoneyBlock): string {
  const n = `${block.count} ${block.count === 1 ? 'obligation' : 'obligations'}`;
  if (block.totals.length <= 1)
    return block.totals[0] && block.totals[0].currency !== block.converted.currency
      ? `${block.totals[0].currency} · ${n}`
      : n;
  return `≈ total in ${block.converted.currency} · ${n}`;
}

function DashboardBody({ d }: { d: Dashboard }) {
  const { colors } = useTheme();
  const quick = [
    { label: 'Add payment', icon: Plus, onPress: () => router.push('/payments/new') },
    { label: 'Record', icon: ReceiptText, onPress: () => router.push('/payments') },
    { label: 'Calendar', icon: CalendarDays, onPress: () => router.push('/calendar') },
    { label: 'Reports', icon: BarChart3, onPress: () => router.push('/reports') },
  ];
  const paidChange = d.summary.paidThisMonth.changePercent;

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -spacing.screen }}
        contentContainerStyle={{ gap: 10, paddingHorizontal: spacing.screen, paddingBottom: 6 }}
      >
        <SummaryCard
          label="Overdue"
          block={d.summary.overdue}
          sub={subline(d.summary.overdue)}
          dot={statusBrand.overdue}
        />
        <SummaryCard
          label="Due this week"
          block={d.summary.dueThisWeek}
          sub={subline(d.summary.dueThisWeek)}
          dot={statusBrand.dueSoon}
        />
        <SummaryCard
          label="Due this month"
          block={d.summary.dueThisMonth}
          sub={subline(d.summary.dueThisMonth)}
          dot={statusBrand.upcoming}
        />
        <SummaryCard
          label="Paid this month"
          block={d.summary.paidThisMonth}
          sub={
            paidChange === null
              ? subline(d.summary.paidThisMonth)
              : `${paidChange >= 0 ? '+' : ''}${paidChange}% from last month`
          }
          dot={statusBrand.paid}
        />
      </ScrollView>
      {d.missingRates.length ? (
        <Text variant="caption" tone="muted">
          Totals in {d.defaultCurrency} leave out {d.missingRates.join(', ')} — add a rate in
          Company settings.
        </Text>
      ) : null}

      <View>
        <SectionHeader
          title="Needs attention"
          action={d.needsAttentionCount > 5 ? 'View all' : undefined}
          onAction={() => router.push('/payments')}
        />
        {d.needsAttention.length ? (
          <Card padding={0} style={{ overflow: 'hidden' }}>
            {d.needsAttention.map((o, i) => (
              <PaymentRow
                key={o.id}
                compact
                divider={i > 0}
                onPress={() => router.push(`/payments/${o.id}`)}
                item={{
                  id: o.id,
                  name: o.name,
                  provider: o.provider,
                  icon: o.icon,
                  amountMinor: o.remainingMinor || o.amountMinor,
                  currency: o.currency,
                  date: o.nextDueDate,
                  status: o.paymentStatus,
                  subtitle: `${o.platform ? `${o.platform.name} · ` : ''}${o.frequencyLabel}`,
                }}
              />
            ))}
          </Card>
        ) : (
          <Card>
            <EmptyState
              compact
              illustration="all-caught-up"
              title="All caught up 🎉"
              message="Nothing is overdue or due this week."
            />
          </Card>
        )}
      </View>

      <View>
        <SectionHeader title="Quick actions" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {quick.map(({ label, icon: Icon, onPress }) => (
            <Pressable
              key={label}
              accessibilityRole="button"
              onPress={onPress}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 80,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: pressed ? colors.primarySoft : colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
              })}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 11,
                  backgroundColor: colors.primarySoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={20} color={colors.primaryStrong} />
              </View>
              <Text variant="captionStrong" align="center">
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View>
        <SectionHeader title="Spending overview" action="12 months" />
        <Card style={{ gap: 12 }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            <View>
              <Text variant="small" tone="muted">
                Paid in the last 12 months
              </Text>
              <Text variant="title">
                {formatMoney(d.spending.paidLast12Months, d.defaultCurrency, { compact: true })}
              </Text>
            </View>
            {d.spending.changePercent !== null ? (
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 8,
                  backgroundColor: colors.greenSoft,
                }}
              >
                <Text variant="captionStrong" color={colors.green}>
                  {d.spending.changePercent >= 0 ? '+' : ''}
                  {d.spending.changePercent}%
                </Text>
              </View>
            ) : null}
          </View>
          <BarChart
            accessibilityLabel={`Monthly spending, last 12 months. This month ${formatMoney(d.spending.months.at(-1)?.amountMinor ?? 0, d.defaultCurrency)}`}
            data={d.spending.months.map((m) => ({
              label: monthShort(m.month),
              value: m.amountMinor,
            }))}
          />
        </Card>
      </View>

      {d.byCategory.length ? (
        <View>
          <SectionHeader title="Spending by category" />
          <Card>
            <DonutChart
              centerValue={`${Math.round(d.byCategory[0]!.share)}%`}
              centerLabel={d.byCategory[0]!.name}
              slices={[
                ...d.byCategory.slice(0, 4),
                ...(d.byCategory.length > 4
                  ? [
                      {
                        name: 'Other',
                        amountMinor: d.byCategory.slice(4).reduce((s, c) => s + c.amountMinor, 0),
                      },
                    ]
                  : []),
              ].map((c) => ({
                label: c.name,
                value: c.amountMinor,
              }))}
              formatValue={(v) => formatMoney(v, d.defaultCurrency, { compact: true })}
            />
          </Card>
        </View>
      ) : null}

      <View>
        <SectionHeader
          title="Next 30 days"
          action="Calendar"
          onAction={() => router.push('/calendar')}
        />
        {d.next30Days.length ? (
          <View style={{ gap: 10 }}>
            {d.next30Days.map((t) => (
              <View
                key={`${t.obligation.id}-${t.date}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <View style={{ width: 44, alignItems: 'center' }}>
                  <Text variant="section">{t.date.slice(8, 10)}</Text>
                  <Text variant="captionStrong" tone="muted">
                    {monthShort(t.date).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <PaymentRow
                    bordered
                    compact
                    onPress={() => router.push(`/payments/${t.obligation.id}`)}
                    item={{
                      id: t.obligation.id,
                      name: t.obligation.name,
                      provider: t.obligation.provider,
                      icon: t.obligation.icon,
                      amountMinor: t.amountMinor,
                      currency: t.obligation.currency,
                      date: t.date,
                      status: t.status,
                      subtitle: `${t.obligation.provider} · ${t.obligation.frequencyLabel}`,
                    }}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Card>
            <EmptyState
              compact
              illustration="empty-calendar"
              title="A quiet month ahead"
              message="Nothing is due in the next 30 days."
            />
          </Card>
        )}
      </View>
    </>
  );
}

export default function HomeTab() {
  const { colors } = useTheme();
  const me = useMe();
  const dashboard = useDashboard();
  const inbox = useInbox();
  const [refreshing, setRefreshing] = useState(false);
  const activeOrgId = useSession((st) => st.activeOrgId);
  const active = me.data?.workspaces.find((w) => w.id === activeOrgId);
  const hour = dashboard.data?.localHour ?? new Date().getHours();
  const firstName = me.data?.name.split(' ')[0] ?? '';

  return (
    <Screen
      edges={['top']}
      contentStyle={{ gap: 20, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.primary}
          onRefresh={async () => {
            setRefreshing(true);
            await Promise.all([dashboard.refetch(), inbox.refetch()]);
            setRefreshing(false);
          }}
        />
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text variant="body" tone="muted">
            {greetingFor(hour)},
          </Text>
          <Text variant="pageTitle" accessibilityRole="header">
            {firstName} 👋
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {active ? (
            <Avatar name={active.name} imageUrl={active.logoUrl} color={colors.primary} size={38} />
          ) : null}
          <IconButton
            accessibilityLabel={`Alerts${inbox.data?.unreadCount ? `, ${inbox.data.unreadCount} unread` : ''}`}
            dot={!!inbox.data?.unreadCount}
            onPress={() => router.push('/alerts')}
          >
            <Bell size={21} color={colors.ink} />
          </IconButton>
        </View>
      </View>
      <WorkspaceSwitcher />
      <OfflineBanner />
      <QueryState
        query={dashboard}
        loading={
          <View style={{ gap: 16 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Skeleton width={164} height={120} radius={16} />
              <Skeleton width={164} height={120} radius={16} />
            </View>
            <Skeleton height={160} radius={16} />
            <Skeleton height={200} radius={16} />
          </View>
        }
      >
        {(d) => <DashboardBody d={d} />}
      </QueryState>
    </Screen>
  );
}
