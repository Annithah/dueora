import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { LoadMore } from '@/components/layout/LoadMore';
import { OfflineBanner } from '@/components/layout/OfflineBanner';
import { PageHeader } from '@/components/layout/PageHeader';
import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { SubscriptionRow } from '@/components/subscriptions/SubscriptionRow';
import {
  ActiveFilters,
  Card,
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
import { useCategories, useCompanies } from '@/features/catalog/api';
import {
  FREQUENCY_FILTERS,
  STATUS_FILTERS,
  SUBSCRIPTION_SORTS,
  useSubscriptionList,
  type SubscriptionSort,
} from '@/features/subscriptions/api';
import { usePermissions } from '@/features/workspaces/api';
import { useDebounced } from '@/lib/useDebounced';
import { useTheme } from '@/theme';

export default function SubscriptionsTab() {
  const { colors } = useTheme();
  const can = usePermissions();
  const companies = useCompanies();
  const categories = useCategories();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SubscriptionSort>('due_asc');
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [sheet, setSheet] = useState<'sort' | 'filter' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const search = useDebounced(q);

  const sections: ChipSection[] = useMemo(
    () => [
      { key: 'status', title: 'Status', options: STATUS_FILTERS },
      { key: 'company', title: 'Company', options: (companies.data ?? []).map((c) => ({ value: c.id, label: c.name })) },
      { key: 'category', title: 'Category', options: (categories.data ?? []).map((c) => ({ value: c.id, label: c.name })) },
      { key: 'frequency', title: 'Frequency', options: FREQUENCY_FILTERS },
    ],
    [companies.data, categories.data],
  );

  const query = useSubscriptionList({
    q: search,
    sort,
    statuses: filters.selections.status,
    companyIds: filters.selections.company,
    categoryIds: filters.selections.category,
    frequencies: filters.selections.frequency,
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
        eyebrow={total ? `${total} ${total === 1 ? 'subscription' : 'subscriptions'}` : 'Your dues'}
        title="Subscriptions"
        right={
          can.manageSubscriptions ? (
            <IconButton accessibilityLabel="Add subscription" tone="soft" onPress={() => router.push('/subscriptions/new')}>
              <Plus size={20} color={colors.primaryStrong} />
            </IconButton>
          ) : undefined
        }
      />
      <SearchBar
        value={q}
        onChangeText={setQ}
        placeholder="Search name, company, provider or key"
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
                illustration="empty-subscriptions"
                title="No subscriptions yet"
                message={
                  can.manageSubscriptions
                    ? 'Add your first one — hosting, domains, internet, rent… DueOra will remind you before it’s due.'
                    : 'Nothing has been added to this workspace yet.'
                }
                actionLabel={can.manageSubscriptions ? 'Add your first subscription' : undefined}
                onAction={can.manageSubscriptions ? () => router.push('/subscriptions/new') : undefined}
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
                    <SubscriptionRow
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

      <SortSheet visible={sheet === 'sort'} onClose={() => setSheet(null)} options={SUBSCRIPTION_SORTS} value={sort} onChange={setSort} />
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
