import { router } from 'expo-router';
import { Plus, Search, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { OfflineBanner } from '@/components/layout/OfflineBanner';
import { PageHeader } from '@/components/layout/PageHeader';
import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { PaymentRow } from '@/components/payments/PaymentRow';
import { Card, Chip, EmptyState, IconButton, SectionHeader } from '@/components/ui';
import { useObligations, type Obligation } from '@/features/obligations/api';
import { radius, spacing, typography, useTheme } from '@/theme';

const FILTERS = [
  { label: 'All', status: undefined },
  { label: 'Overdue', status: 'OVERDUE' },
  { label: 'Due soon', status: 'DUE_TODAY,DUE_SOON' },
  { label: 'Partially paid', status: 'PARTIALLY_PAID' },
  { label: 'Upcoming', status: 'UPCOMING' },
  { label: 'Paid', status: 'PAID' },
  { label: 'Archived', status: 'ARCHIVED' },
] as const;

function groupByPlatform(items: Obligation[]) {
  const groups = new Map<string, Obligation[]>();
  for (const o of items) {
    const key = o.platform?.name ?? 'Other payments';
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  // Named platforms alphabetically, ungrouped last.
  return [...groups.entries()].sort(([a], [b]) =>
    a === 'Other payments' ? 1 : b === 'Other payments' ? -1 : a.localeCompare(b),
  );
}

export default function PaymentsTab() {
  const { colors } = useTheme();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>(FILTERS[0]);
  const [q, setQ] = useState('');
  const query = useObligations({ status: filter.status });
  const [refreshing, setRefreshing] = useState(false);

  // Search locally for instant feedback (lists are small and cached for offline use).
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const items = query.data?.items ?? [];
    return needle
      ? items.filter((o) =>
          [o.name, o.provider, o.platform?.name ?? '', o.category.name].some((s) =>
            s.toLowerCase().includes(needle),
          ),
        )
      : items;
  }, [query.data, q]);

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
            await query.refetch();
            setRefreshing(false);
          }}
        />
      }
    >
      <PageHeader
        eyebrow="All obligations"
        title="Payments"
        right={
          <IconButton
            accessibilityLabel="Add payment"
            tone="soft"
            onPress={() => router.push('/payments/new')}
          >
            <Plus size={20} color={colors.primaryStrong} />
          </IconButton>
        }
      />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 9,
          minHeight: 48,
          paddingHorizontal: 13,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.surface,
        }}
      >
        <Search size={18} color={colors.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search payments"
          placeholderTextColor={colors.placeholder}
          accessibilityLabel="Search payments"
          returnKeyType="search"
          style={[typography.body, { flex: 1, color: colors.ink, paddingVertical: 10 }]}
        />
        {q ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={12}
            onPress={() => setQ('')}
          >
            <X size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -spacing.screen, marginTop: -6 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.screen }}
      >
        {FILTERS.map((f) => (
          <Chip
            key={f.label}
            label={f.label}
            selected={f.label === filter.label}
            onPress={() => setFilter(f)}
          />
        ))}
      </ScrollView>
      <OfflineBanner />

      <QueryState query={query}>
        {() =>
          visible.length === 0 ? (
            (query.data?.total ?? 0) === 0 && !q && filter.label === 'All' ? (
              <EmptyState
                illustration="empty-payments"
                title="No payments yet"
                message="Add your first obligation and DueOra will keep watch."
                actionLabel="Add payment"
                onAction={() => router.push('/payments/new')}
              />
            ) : (
              <EmptyState
                illustration="no-results"
                title="No matching payments"
                message="Try another search or clear your filters."
                actionLabel="Clear filters"
                actionVariant="secondary"
                onAction={() => {
                  setQ('');
                  setFilter(FILTERS[0]);
                }}
              />
            )
          ) : (
            <View style={{ gap: 20 }}>
              {groupByPlatform(visible).map(([name, items]) => (
                <Animated.View key={name} entering={FadeIn} layout={LinearTransition}>
                  <SectionHeader
                    title={name}
                    action={`${items.length} ${items.length === 1 ? 'item' : 'items'}`}
                  />
                  <Card padding={0} style={{ overflow: 'hidden' }}>
                    {items.map((o, i) => (
                      <PaymentRow
                        key={o.id}
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
                          subtitle: `${o.provider} · ${o.frequencyLabel}`,
                        }}
                      />
                    ))}
                  </Card>
                </Animated.View>
              ))}
            </View>
          )
        }
      </QueryState>
    </Screen>
  );
}
