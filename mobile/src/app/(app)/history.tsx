import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { LoadMore } from '@/components/layout/LoadMore';
import { OfflineBanner } from '@/components/layout/OfflineBanner';
import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { BillRow } from '@/components/bills/BillRow';
import {
  ActiveFilters,
  Card,
  countFilters,
  EMPTY_FILTERS,
  EmptyState,
  FilterSheet,
  SearchBar,
  SortSheet,
  Text,
  type ChipSection,
  type FilterState,
} from '@/components/ui';
import { useCategories, useCompanies } from '@/features/catalog/api';
import { HISTORY_SORTS, useHistory, type HistorySort } from '@/features/insights/api';
import { METHOD_LABELS } from '@/features/bills/api';
import { formatUSD } from '@/lib/money';
import { useDebounced } from '@/lib/useDebounced';
import { useTheme } from '@/theme';

export default function HistoryScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ billId?: string; name?: string }>();
  const companies = useCompanies({ includeArchived: true });
  const categories = useCategories();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<HistorySort>('paid_desc');
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [sheet, setSheet] = useState<'sort' | 'filter' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const search = useDebounced(q);

  const sections: ChipSection[] = useMemo(
    () => [
      { key: 'company', title: 'Company', options: (companies.data ?? []).map((c) => ({ value: c.id, label: c.name })) },
      {
        key: 'category',
        title: 'Category',
        options: (categories.data ?? []).map((c) => ({
          value: c.id,
          label: `${(companies.data?.length ?? 0) > 1 ? `${companies.data?.find((x) => x.id === c.companyId)?.name ?? ''} · ` : ''}${c.parent ? `${c.parent.name} › ` : ''}${c.name}`,
        })),
      },
    ],
    [companies.data, categories.data],
  );

  const query = useHistory({
    q: search,
    sort,
    from: filters.from,
    to: filters.to,
    companyIds: filters.selections.company,
    categoryIds: filters.selections.category,
    billId: params.billId,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const first = query.data?.pages[0];
  const filtered = !!search || countFilters(filters) > 0;
  const loadMore = () => {
    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  };

  return (
    <Screen
      header={<TopBar title={params.name ? `${params.name} · history` : 'Payment history'} />}
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
      <SearchBar
        value={q}
        onChangeText={setQ}
        placeholder="Search bill, company or reference"
        onSortPress={() => setSheet('sort')}
        onFilterPress={() => setSheet('filter')}
        sortActive={sort !== 'paid_desc'}
        filterCount={countFilters(filters)}
      />
      <ActiveFilters sections={sections} value={filters} onChange={setFilters} />
      <OfflineBanner />

      <QueryState query={query}>
        {() =>
          items.length === 0 ? (
            filtered ? (
              <EmptyState
                illustration="no-results"
                title="No payments match"
                message="Try another search or clear your filters."
                actionLabel="Clear search and filters"
                actionVariant="secondary"
                onAction={() => {
                  setQ('');
                  setFilters(EMPTY_FILTERS);
                }}
              />
            ) : (
              <EmptyState
                illustration="all-caught-up"
                title="No payments recorded yet"
                message="When you record a payment it lands here — history is kept forever, even after a new cycle starts."
              />
            )
          ) : (
            <View style={{ gap: 14 }}>
              <Card style={{ gap: 4 }}>
                <Text variant="small" tone="muted">
                  {filtered ? 'Total for this filter' : 'Total recorded'} · {first?.total ?? 0} payment{first?.total === 1 ? '' : 's'}
                </Text>
                <Text variant="title">{formatUSD(first?.totalCents ?? 0)}</Text>
              </Card>
              <Card padding={0} style={{ overflow: 'hidden' }}>
                {items.map((p, i) => (
                  <BillRow
                    key={p.id}
                    compact
                    divider={i > 0}
                    onPress={() => router.push(`/bills/${p.billId}`)}
                    item={{
                      id: p.id,
                      name: p.bill.name,
                      icon: p.bill.category.icon,
                      amountCents: p.amountCents,
                      date: p.paidOn,
                      status: 'PAID',
                      subtitle: `${p.bill.company.name} · ${METHOD_LABELS[p.method]}${p.reference ? ` · ${p.reference}` : ''}`,
                    }}
                  />
                ))}
              </Card>
              <LoadMore
                shown={items.length}
                total={first?.total ?? 0}
                hasMore={!!query.hasNextPage}
                loading={query.isFetchingNextPage}
                onLoadMore={loadMore}
                noun="payments"
              />
            </View>
          )
        }
      </QueryState>

      <SortSheet visible={sheet === 'sort'} onClose={() => setSheet(null)} options={HISTORY_SORTS} value={sort} onChange={setSort} />
      <FilterSheet
        visible={sheet === 'filter'}
        onClose={() => setSheet(null)}
        sections={sections}
        dateRangeTitle="Date paid"
        value={filters}
        onApply={setFilters}
      />
    </Screen>
  );
}
