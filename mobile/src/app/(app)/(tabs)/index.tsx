import { router } from 'expo-router';
import { BarChart3, Bell, CalendarDays, History, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { BreakdownBars } from '@/components/charts/BreakdownBars';
import { BarChart, DonutChart, monthShort } from '@/components/charts/Charts';
import { OfflineBanner } from '@/components/layout/OfflineBanner';
import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { WorkspaceSwitcher } from '@/components/layout/WorkspaceSwitcher';
import { SubscriptionRow } from '@/components/subscriptions/SubscriptionRow';
import { Avatar, Card, EmptyState, IconButton, SectionHeader, Skeleton, Text } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { useDashboard, type Dashboard, type MoneyBlock, type SubscriptionLite } from '@/features/insights/api';
import { useInbox } from '@/features/notifications/api';
import { useActiveWorkspaceSummary, usePermissions } from '@/features/workspaces/api';
import { greetingFor } from '@/lib/dates';
import { formatUSD } from '@/lib/money';
import { elevation, radius, spacing, statusBrand, useTheme } from '@/theme';

function SummaryCard({ label, block, sub, dot }: { label: string; block: MoneyBlock; sub: string; dot: string }) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${formatUSD(block.amountCents)}, ${sub}`}
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
        {formatUSD(block.amountCents, { compact: true })}
      </Text>
      <Text variant="caption" tone="muted" style={{ marginTop: 4 }} numberOfLines={2}>
        {sub}
      </Text>
    </View>
  );
}

const countLabel = (n: number) => `${n} ${n === 1 ? 'subscription' : 'subscriptions'}`;

/** One warm sentence about the most urgent subscription. */
function headline(d: Dashboard): string {
  const top: SubscriptionLite | undefined = d.needsAttention[0];
  if (!top) return d.counts.active ? 'All caught up — nothing due this week 🎉' : '';
  const label = `${top.company.name} · ${top.name}`;
  const n = Math.abs(top.daysUntilDue);
  if (top.daysUntilDue < 0) return `${label} is ${n} day${n === 1 ? '' : 's'} overdue ⚠️`;
  if (top.daysUntilDue === 0) return `${label} is due today 📅`;
  return `${label} is due in ${n} day${n === 1 ? '' : 's'} ⏰`;
}

function DashboardBody({ d }: { d: Dashboard }) {
  const { colors } = useTheme();
  const can = usePermissions();

  if (d.counts.total === 0) {
    return (
      <EmptyState
        illustration="empty-subscriptions"
        title="No subscriptions yet"
        message={
          can.manageSubscriptions
            ? 'Add your first one — hosting, domains, internet, rent… and DueOra will remind everyone before it’s due.'
            : 'Nothing has been added to this workspace yet. You’ll get reminders once it has.'
        }
        actionLabel={can.manageSubscriptions ? 'Add your first subscription' : undefined}
        onAction={can.manageSubscriptions ? () => router.push('/subscriptions/new') : undefined}
      />
    );
  }

  const quick = [
    ...(can.manageSubscriptions ? [{ label: 'Add', icon: Plus, onPress: () => router.push('/subscriptions/new') }] : []),
    { label: 'Calendar', icon: CalendarDays, onPress: () => router.push('/calendar') },
    { label: 'History', icon: History, onPress: () => router.push('/history') },
    { label: 'Reports', icon: BarChart3, onPress: () => router.push('/reports') },
  ];
  const paidChange = d.summary.paidThisMonth.changePercent;
  const line = headline(d);

  return (
    <>
      {line ? (
        <Text variant="bodyStrong" tone={d.summary.overdue.count ? 'danger' : 'primary'}>
          {line}
        </Text>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -spacing.screen }}
        contentContainerStyle={{ gap: 10, paddingHorizontal: spacing.screen, paddingBottom: 6 }}
      >
        <SummaryCard label="Overdue" block={d.summary.overdue} sub={countLabel(d.summary.overdue.count)} dot={statusBrand.overdue} />
        <SummaryCard label="Due this week" block={d.summary.dueThisWeek} sub={countLabel(d.summary.dueThisWeek.count)} dot={statusBrand.dueSoon} />
        <SummaryCard label="Due this month" block={d.summary.dueThisMonth} sub={countLabel(d.summary.dueThisMonth.count)} dot={statusBrand.upcoming} />
        <SummaryCard
          label="Paid this month"
          block={d.summary.paidThisMonth}
          sub={
            paidChange === null
              ? `${d.summary.paidThisMonth.count} payment${d.summary.paidThisMonth.count === 1 ? '' : 's'}`
              : `${paidChange >= 0 ? '+' : ''}${paidChange}% from last month`
          }
          dot={statusBrand.paid}
        />
      </ScrollView>

      <View>
        <SectionHeader
          title="Needs attention"
          action={d.needsAttentionCount > 5 ? `View all ${d.needsAttentionCount}` : undefined}
          onAction={() => router.push('/subscriptions')}
        />
        {d.needsAttention.length ? (
          <Card padding={0} style={{ overflow: 'hidden' }}>
            {d.needsAttention.map((s, i) => (
              <SubscriptionRow
                key={s.id}
                compact
                divider={i > 0}
                onPress={() => router.push(`/subscriptions/${s.id}`)}
                item={{
                  id: s.id,
                  name: s.name,
                  icon: s.category.icon,
                  amountCents: s.remainingCents || s.amountCents,
                  date: s.nextDueDate,
                  status: s.paymentStatus,
                  subtitle: `${s.company.name} · ${s.frequencyLabel}`,
                }}
              />
            ))}
          </Card>
        ) : (
          <Card>
            <EmptyState compact illustration="all-caught-up" title="All caught up — nothing due this week 🎉" message="We’ll nudge you before anything is due." />
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
              <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
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
        <SectionHeader title="Next 30 days" action="Calendar" onAction={() => router.push('/calendar')} />
        {d.next30Days.length ? (
          <View style={{ gap: 10 }}>
            {d.next30Days.map((t) => (
              <View key={`${t.subscription.id}-${t.date}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 44, alignItems: 'center' }}>
                  <Text variant="section">{t.date.slice(8, 10)}</Text>
                  <Text variant="captionStrong" tone="muted">
                    {monthShort(t.date).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <SubscriptionRow
                    bordered
                    compact
                    onPress={() => router.push(`/subscriptions/${t.subscription.id}`)}
                    item={{
                      id: t.subscription.id,
                      name: t.subscription.name,
                      icon: t.subscription.category.icon,
                      amountCents: t.amountCents,
                      date: t.date,
                      status: t.status,
                      subtitle: `${t.subscription.company.name} · ${t.subscription.frequencyLabel}`,
                    }}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Card>
            <EmptyState compact illustration="empty-calendar" title="A quiet month ahead" message="Nothing is due in the next 30 days." />
          </Card>
        )}
      </View>

      <View>
        <SectionHeader title="Monthly spending" action="12 months" />
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text variant="small" tone="muted">
                Paid in the last 12 months
              </Text>
              <Text variant="title">{formatUSD(d.spending.paidLast12Months, { compact: true })}</Text>
            </View>
            {d.spending.changePercent !== null ? (
              <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.greenSoft }}>
                <Text variant="captionStrong" color={colors.green}>
                  {d.spending.changePercent >= 0 ? '+' : ''}
                  {d.spending.changePercent}%
                </Text>
              </View>
            ) : null}
          </View>
          <BarChart
            accessibilityLabel={`Monthly spending, last 12 months. This month ${formatUSD(d.spending.months.at(-1)?.amountCents ?? 0)}`}
            data={d.spending.months.map((m) => ({ label: monthShort(m.month), value: m.amountCents }))}
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
                ...(d.byCategory.length > 4 ? [{ name: 'Other', amountCents: d.byCategory.slice(4).reduce((s, c) => s + c.amountCents, 0) }] : []),
              ].map((c) => ({ label: c.name, value: c.amountCents }))}
              formatValue={(v) => formatUSD(v, { compact: true })}
            />
          </Card>
        </View>
      ) : null}

      {d.byCompany.length ? (
        <View>
          <SectionHeader title="Spending by company" action="12 months" />
          <Card>
            <BreakdownBars items={d.byCompany} />
          </Card>
        </View>
      ) : null}
    </>
  );
}

export default function HomeTab() {
  const { colors } = useTheme();
  const me = useMe();
  const dashboard = useDashboard();
  const inbox = useInbox();
  const active = useActiveWorkspaceSummary();
  const [refreshing, setRefreshing] = useState(false);
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
          {active ? <Avatar name={active.name} color={colors.primary} size={38} /> : null}
          <IconButton
            accessibilityLabel={`Alerts${inbox.data?.unreadCount ? `, ${inbox.data.unreadCount} unread` : ''}`}
            badge={inbox.data?.unreadCount ?? 0}
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
