import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { LoadMore } from '@/components/layout/LoadMore';
import { OfflineBanner } from '@/components/layout/OfflineBanner';
import { CompanySwitcher } from '@/components/layout/CompanySwitcher';
import { PageHeader } from '@/components/layout/PageHeader';
import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { BillRow } from '@/components/bills/BillRow';
import {
  ActiveFilters,
  Card,
  Chip,
  Text,
  countFilters,
  EMPTY_FILTERS,
  EmptyState,
  FilterSheet,
  IconButton,
  SearchBar,
  SortSheet,
  type ChipSection,
  type FilterState,
} from '@/components/ui';
import { categoryTree, useCategories, useCompanies } from '@/features/catalog/api';
import { useView, type ViewName } from '@/features/insights/api';
import { formatDate } from '@/lib/dates';
import { formatUSD } from '@/lib/money';
import {
  FREQUENCY_FILTERS,
  STATUS_FILTERS,
  BILL_SORTS,
  useBillList,
  type BillSort,
} from '@/features/bills/api';
import { usePermissions } from '@/features/workspaces/api';
import { useDebounced } from '@/lib/useDebounced';
import { useTheme } from '@/theme';

type Segment = 'all' | Exclude<ViewName, 'obligations'>;
const SEGMENTS: { value: Segment; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'this-month', label: 'This month' },
  { value: 'next-month', label: 'Next month' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'outstanding', label: 'Outstanding' },
  { value: 'paid', label: 'Paid' },
  { value: 'all', label: 'All' },
];
const AMOUNT_FILTERS = [
  { value: 'FIXED', label: 'Fixed' },
  { value: 'VARIABLE', label: 'Variable' },
];

export default function BillsTab() {
  const { colors } = useTheme();
  const can = usePermissions();
  const companies = useCompanies();
  const categories = useCategories();
  // The Bills tab segments (Finalize brief, Part 5): views computed by the server, or the full list.
  const [segment, setSegment] = useState<Segment>('all');
  const [days, setDays] = useState(30);
  const view = useView(segment === 'all' ? 'upcoming' : segment, { days: segment === 'upcoming' ? days : undefined, enabled: segment !== 'all' });
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<BillSort>('due_asc');
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [sheet, setSheet] = useState<'sort' | 'filter' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const search = useDebounced(q);

  const sections: ChipSection[] = useMemo(
    () => [
      { key: 'status', title: 'Status', options: STATUS_FILTERS },
      { key: 'company', title: 'Company', options: (companies.data ?? []).map((c) => ({ value: c.id, label: c.name })) },
      {
        key: 'category',
        title: 'Category',
        // Sub-categories show their parent; with several companies, the company too.
        options: categoryTree(categories.data ?? []).map(({ category: c }) => {
          const company = (companies.data?.length ?? 0) > 1 ? `${companies.data?.find((x) => x.id === c.companyId)?.name ?? ''} · ` : '';
          return { value: c.id, label: `${company}${c.parent ? `${c.parent.name} › ` : ''}${c.name}` };
        }),
      },
      { key: 'frequency', title: 'Frequency', options: FREQUENCY_FILTERS },
      { key: 'amount', title: 'Amount', options: AMOUNT_FILTERS },
    ],
    [companies.data, categories.data],
  );

  const query = useBillList({
    q: search,
    sort,
    statuses: filters.selections.status,
    companyIds: filters.selections.company,
    categoryIds: filters.selections.category,
    frequencies: filters.selections.frequency,
    amountType: filters.selections.amount?.length === 1 ? (filters.selections.amount[0] as 'FIXED' | 'VARIABLE') : undefined,
    dueFrom: filters.from,
    dueTo: filters.to,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const filtered = !!search || countFilters(filters) > 0;
  const loadMore = () => {
    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  };

  return (
    <Screen
      edges={['top']}
      contentStyle={{ gap: 16, paddingBottom: 32 }}
      onEndReached={loadMore}
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
      <PageHeader
        eyebrow={total ? `${total} ${total === 1 ? 'bill' : 'bills'}` : 'Your dues'}
        title="Bills"
        right={
          can.manageBills ? (
            <IconButton accessibilityLabel="Add bill" tone="soft" onPress={() => router.push('/bills/new')}>
              <Plus size={20} color={colors.primaryStrong} />
            </IconButton>
          ) : undefined
        }
      />
      <CompanySwitcher />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {SEGMENTS.map((s) => (
          <Chip key={s.value} label={s.label} selected={segment === s.value} onPress={() => setSegment(s.value)} />
        ))}
      </ScrollView>
      {segment !== 'all' ? (
        <SegmentView segment={segment} days={days} setDays={setDays} view={view} />
      ) : null}
      {segment === 'all' ? (
      <>
      <SearchBar
        value={q}
        onChangeText={setQ}
        placeholder="Search name, company, provider or reference"
        onSortPress={() => setSheet('sort')}
        onFilterPress={() => setSheet('filter')}
        sortActive={sort !== 'due_asc'}
        filterCount={countFilters(filters)}
      />
      <ActiveFilters sections={sections} value={filters} onChange={setFilters} />
      <OfflineBanner />

      <QueryState query={query}>
        {() =>
          items.length === 0 ? (
            !filtered ? (
              <EmptyState
                illustration="empty-bills"
                title="No bills yet"
                message={
                  can.manageBills
                    ? 'Add your first one — hosting, domains, internet, rent… DueOra will remind you before it’s due.'
                    : 'Nothing has been added to this workspace yet.'
                }
                actionLabel={can.manageBills ? 'Add your first bill' : undefined}
                onAction={can.manageBills ? () => router.push('/bills/new') : undefined}
              />
            ) : (
              <EmptyState
                illustration="no-results"
                title="Nothing matches"
                message="Try another search or clear your filters."
                actionLabel="Clear search and filters"
                actionVariant="secondary"
                onAction={() => {
                  setQ('');
                  setFilters(EMPTY_FILTERS);
                }}
              />
            )
          ) : (
            <View style={{ gap: 14 }}>
              <Card padding={0} style={{ overflow: 'hidden' }}>
                {items.map((s, i) => (
                  <Animated.View key={s.id} entering={FadeIn} layout={LinearTransition}>
                    <BillRow
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
                  </Animated.View>
                ))}
              </Card>
              <LoadMore
                shown={items.length}
                total={total}
                hasMore={!!query.hasNextPage}
                loading={query.isFetchingNextPage}
                onLoadMore={loadMore}
              />
            </View>
          )
        }
      </QueryState>
      </>
      ) : null}

      <SortSheet visible={sheet === 'sort'} onClose={() => setSheet(null)} options={BILL_SORTS} value={sort} onChange={setSort} />
      <FilterSheet
        visible={sheet === 'filter'}
        onClose={() => setSheet(null)}
        sections={sections}
        dateRangeTitle="Next due date"
        value={filters}
        onApply={setFilters}
      />
    </Screen>
  );
}

const SEGMENT_EMPTY: Record<Exclude<Segment, 'all'>, string> = {
  upcoming: 'Nothing due in this window. 🌿',
  'this-month': 'Nothing is due this month.',
  'next-month': 'Nothing is due next month yet.',
  overdue: 'Nothing is overdue. Nice work! 🎉',
  outstanding: 'Everything due has been paid. 🎉',
  paid: 'No payments this month yet.',
};

/** One server-computed view: totals, per company (with several), then each cycle. */
function SegmentView({
  segment,
  days,
  setDays,
  view,
}: {
  segment: Exclude<Segment, 'all'>;
  days: number;
  setDays: (d: number) => void;
  view: ReturnType<typeof useView>;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 14 }}>
      {segment === 'upcoming' ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[7, 30, 60, 90].map((d) => (
            <Chip key={d} label={`${d} days`} selected={days === d} onPress={() => setDays(d)} />
          ))}
        </View>
      ) : null}
      <QueryState query={view}>
        {(v) => (
          <>
            <Card style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              {(segment === 'this-month' || segment === 'next-month'
                ? [
                    ['Total', v.totals.expectedCents],
                    ['Paid', v.totals.paidCents],
                    ['Left', v.totals.remainingCents],
                  ]
                : segment === 'paid'
                  ? [['Paid', v.totals.paidCents]]
                  : [['Owed', v.totals.remainingCents]]
              ).map(([label, cents]) => (
                <View key={label as string} style={{ flex: 1 }}>
                  <Text variant="caption" tone="muted">
                    {label as string}
                  </Text>
                  <Text variant="bodyStrong">{formatUSD(cents as number)}</Text>
                </View>
              ))}
              <View style={{ flex: 1 }}>
                <Text variant="caption" tone="muted">
                  Cycles
                </Text>
                <Text variant="bodyStrong">{v.totals.count}</Text>
              </View>
            </Card>
            {v.totals.estimatedCents > 0 ? (
              <Text variant="small" tone="muted">
                {formatUSD(v.totals.estimatedCents)} is still an estimate (variable bills).
              </Text>
            ) : null}
            {v.byCompany.length > 1 ? (
              <Card padding={0} style={{ overflow: 'hidden' }}>
                {v.byCompany.map((c, i) => (
                  <View key={c.company.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.company.color }} />
                    <Text variant="body" style={{ flex: 1 }}>
                      {c.company.name}
                    </Text>
                    <Text variant="bodyStrong">{formatUSD(segment === 'paid' ? c.paidCents : segment === 'this-month' || segment === 'next-month' ? c.expectedCents : c.remainingCents)}</Text>
                  </View>
                ))}
              </Card>
            ) : null}
            {v.ageing && v.ageing.some((b) => b.count) ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {v.ageing.map((b) => (
                  <Card key={b.bucket} style={{ flex: 1, padding: 10 }}>
                    <Text variant="caption" tone="muted">
                      {b.bucket} days
                    </Text>
                    <Text variant="smallStrong">{formatUSD(b.amountCents)}</Text>
                  </Card>
                ))}
              </View>
            ) : null}
            {v.items.length ? (
              <Card padding={0} style={{ overflow: 'hidden' }}>
                {v.items.map((c, i) => (
                  <BillRow
                    key={`${c.bill.id}-${c.dueDate}`}
                    divider={i > 0}
                    onPress={() => router.push(`/bills/${c.bill.id}`)}
                    item={{
                      id: c.bill.id,
                      name: c.bill.name,
                      icon: c.bill.category.icon,
                      amountCents: segment === 'paid' ? Math.min(c.paidCents, c.expectedCents) : c.remainingCents || c.expectedCents,
                      date: c.dueDate,
                      status: c.state,
                      subtitle: [
                        c.bill.company.name,
                        c.isEstimate ? 'estimated' : null,
                        c.daysOverdue ? `${c.daysOverdue} days late` : null,
                        c.nextReminder && segment !== 'paid' && c.nextReminder !== c.dueDate ? `reminder ${formatDate(c.nextReminder)}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · '),
                    }}
                  />
                ))}
              </Card>
            ) : (
              <EmptyState compact illustration="all-caught-up" title={SEGMENT_EMPTY[segment]} />
            )}
          </>
        )}
      </QueryState>
    </View>
  );
}
