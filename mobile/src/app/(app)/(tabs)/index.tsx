import { router } from 'expo-router';
import {
  BarChart3,
  Bell,
  CalendarDays,
  History,
  Plus,
  ReceiptText,
  Sparkles,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { BudgetBar } from '@/components/budgets/BudgetBar';
import { BreakdownBars } from '@/components/charts/BreakdownBars';
import { BarChart, DonutChart, monthShort } from '@/components/charts/Charts';
import { OfflineBanner } from '@/components/layout/OfflineBanner';
import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { WorkspaceSwitcher } from '@/components/layout/WorkspaceSwitcher';
import { BillRow } from '@/components/bills/BillRow';
import {
  Avatar,
  Card,
  EmptyState,
  IconButton,
  SectionHeader,
  Skeleton,
  Text,
} from '@/components/ui';
import { useAiStatus, useInsight } from '@/features/ai/api';
import { useMe } from '@/features/auth/api';
import { useBudgets } from '@/features/budgets/api';
import {
  useDashboard,
  type Dashboard,
  type MoneyBlock,
  type BillLite,
} from '@/features/insights/api';
import { useInbox } from '@/features/notifications/api';
import { useActiveWorkspaceSummary, usePermissions } from '@/features/workspaces/api';
import { formatUSD } from '@/lib/money';
import { useTranslation } from '@/i18n';
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

const countLabel = (n: number) => `${n} ${n === 1 ? 'bill' : 'bills'}`;

/** One warm sentence about the most urgent bill. */
function headline(d: Dashboard): string {
  const top: BillLite | undefined = d.needsAttention[0];
  if (!top) return d.counts.active ? 'All caught up — nothing due this week 🎉' : '';
  const label = `${top.company.name} · ${top.name}`;
  const n = Math.abs(top.daysUntilDue);
  if (top.daysUntilDue < 0) return `${label} is ${n} day${n === 1 ? '' : 's'} overdue ⚠️`;
  if (top.daysUntilDue === 0) return `${label} is due today 📅`;
  return `${label} is due in ${n} day${n === 1 ? '' : 's'} ⏰`;
}

/** "Good morning, {firstName} 👋" — a template; the name always comes from the account. */
export function greetingKey(
  hour: number,
): 'home.goodMorning' | 'home.goodAfternoon' | 'home.goodEvening' {
  return hour < 12 ? 'home.goodMorning' : hour < 18 ? 'home.goodAfternoon' : 'home.goodEvening';
}

function DashboardBody({ d }: { d: Dashboard }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const can = usePermissions();
  const budgets = useBudgets();
  const budget = budgets.data?.find((b) => b.categoryId === null) ?? budgets.data?.[0];
  const ai = useAiStatus();
  const aiOn = !!ai.data?.enabled;
  const insight = useInsight();

  if (d.counts.total === 0) {
    return (
      <EmptyState
        illustration="empty-bills"
        title="No bills yet"
        message={
          can.manageBills
            ? 'Add your first one — hosting, domains, internet, rent… and DueOra will remind everyone before it’s due.'
            : 'Nothing has been added to this workspace yet. You’ll get reminders once it has.'
        }
        actionLabel={can.manageBills ? 'Add your first bill' : undefined}
        onAction={can.manageBills ? () => router.push('/bills/new') : undefined}
      />
    );
  }

  const quick = [
    ...(can.manageBills
      ? [
          { label: t('home.qaAdd'), icon: Plus, onPress: () => router.push('/bills/new') },
          // A payment belongs to a bill: start from the list, soonest due first.
          {
            label: t('home.qaRecord'),
            icon: ReceiptText,
            onPress: () => router.push('/bills'),
          },
        ]
      : []),
    { label: t('home.qaCalendar'), icon: CalendarDays, onPress: () => router.push('/calendar') },
    { label: t('home.qaHistory'), icon: History, onPress: () => router.push('/history') },
    { label: t('home.qaReports'), icon: BarChart3, onPress: () => router.push('/reports') },
    ...(aiOn
      ? [{ label: t('home.qaAskAi'), icon: Sparkles, onPress: () => router.push('/ai') }]
      : []),
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
        <SummaryCard
          label={t('home.overdue')}
          block={d.summary.overdue}
          sub={countLabel(d.summary.overdue.count)}
          dot={statusBrand.overdue}
        />
        <SummaryCard
          label={t('home.dueThisWeek')}
          block={d.summary.dueThisWeek}
          sub={countLabel(d.summary.dueThisWeek.count)}
          dot={statusBrand.dueSoon}
        />
        <SummaryCard
          label={t('home.dueThisMonth')}
          block={d.summary.dueThisMonth}
          sub={countLabel(d.summary.dueThisMonth.count)}
          dot={statusBrand.upcoming}
        />
        <SummaryCard
          label={t('home.paidThisMonth')}
          block={d.summary.paidThisMonth}
          sub={
            paidChange === null
              ? `${d.summary.paidThisMonth.count} payment${d.summary.paidThisMonth.count === 1 ? '' : 's'}`
              : `${paidChange >= 0 ? '+' : ''}${paidChange}% from last month`
          }
          dot={statusBrand.paid}
        />
      </ScrollView>

      {aiOn && insight.data?.text ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Opens DueOra AI"
          onPress={() => router.push('/ai')}
        >
          <Card tone="primary" style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 11,
                backgroundColor: colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={18} color={colors.primaryStrong} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="eyebrow" tone="primary">
                DueOra AI
              </Text>
              <Text variant="small">{insight.data.text}</Text>
            </View>
          </Card>
        </Pressable>
      ) : null}

      {budget ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Opens budgets"
          onPress={() => router.push('/settings/budgets')}
        >
          <Card style={{ gap: 6 }}>
            <Text variant="eyebrow" tone="muted">
              {t('home.budget')}
            </Text>
            <BudgetBar b={budget} compact />
          </Card>
        </Pressable>
      ) : null}

      <View>
        <SectionHeader
          title={t('home.needsAttention')}
          action={d.needsAttentionCount > 5 ? `View all ${d.needsAttentionCount}` : undefined}
          onAction={() => router.push('/bills')}
        />
        {d.needsAttention.length ? (
          <Card padding={0} style={{ overflow: 'hidden' }}>
            {d.needsAttention.map((s, i) => (
              <BillRow
                key={s.id}
                compact
                divider={i > 0}
                onPress={() => router.push(`/bills/${s.id}`)}
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
            <EmptyState
              compact
              illustration="all-caught-up"
              title="All caught up — nothing due this week 🎉"
              message="We’ll nudge you before anything is due."
            />
          </Card>
        )}
      </View>

      <View>
        <SectionHeader title={t('home.quickActions')} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {quick.map(({ label, icon: Icon, onPress }) => (
            <Pressable
              key={label}
              accessibilityRole="button"
              onPress={onPress}
              style={({ pressed }) => ({
                flexBasis: '31%',
                flexGrow: 1,
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
        <SectionHeader
          title={t('home.next30')}
          action={t('home.qaCalendar')}
          onAction={() => router.push('/calendar')}
        />
        {d.next30Days.length ? (
          <View style={{ gap: 10 }}>
            {d.next30Days.map((t) => (
              <View
                key={`${t.bill.id}-${t.date}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <View style={{ width: 44, alignItems: 'center' }}>
                  <Text variant="section">{t.date.slice(8, 10)}</Text>
                  <Text variant="captionStrong" tone="muted">
                    {monthShort(t.date).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <BillRow
                    bordered
                    compact
                    onPress={() => router.push(`/bills/${t.bill.id}`)}
                    item={{
                      id: t.bill.id,
                      name: t.bill.name,
                      icon: t.bill.category.icon,
                      amountCents: t.amountCents,
                      date: t.date,
                      status: t.status,
                      subtitle: `${t.bill.company.name} · ${t.bill.frequencyLabel}`,
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

      <View>
        <SectionHeader title="Monthly spending" action="12 months" />
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
                {formatUSD(d.spending.paidLast12Months, { compact: true })}
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
            accessibilityLabel={`Monthly spending, last 12 months. This month ${formatUSD(d.spending.months.at(-1)?.amountCents ?? 0)}`}
            data={d.spending.months.map((m) => ({
              label: monthShort(m.month),
              value: m.amountCents,
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
                        amountCents: d.byCategory.slice(4).reduce((s, c) => s + c.amountCents, 0),
                      },
                    ]
                  : []),
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
  const { t } = useTranslation();
  const me = useMe();
  const dashboard = useDashboard();
  const inbox = useInbox();
  const active = useActiveWorkspaceSummary();
  const aiStatus = useAiStatus();
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
          <Text variant="pageTitle" accessibilityRole="header" numberOfLines={2}>
            {t(greetingKey(hour), { firstName })}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {active ? <Avatar name={active.name} color={colors.primary} size={38} /> : null}
          {aiStatus.data?.enabled ? (
            <IconButton accessibilityLabel={t('home.askAi')} onPress={() => router.push('/ai')}>
              <Sparkles size={21} color={colors.primaryStrong} />
            </IconButton>
          ) : null}
          <IconButton
            accessibilityLabel={`${t('home.alerts')}${inbox.data?.unreadCount ? `, ${inbox.data.unreadCount}` : ''}`}
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
