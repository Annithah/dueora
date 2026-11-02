import { router, useLocalSearchParams } from 'expo-router';
import { Search, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { PaymentRow } from '@/components/payments/PaymentRow';
import { Card, Chip, EmptyState, SectionHeader, Select, Text } from '@/components/ui';
import { usePlatforms, useCategories } from '@/features/catalog/api';
import { useHistory, type HistoryItem } from '@/features/insights/api';
import { METHOD_LABELS } from '@/features/obligations/api';
import { toISODate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { radius, spacing, typography, useTheme } from '@/theme';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function rangeFor(key: string): { from?: string; to?: string } {
  const now = new Date();
  const y = now.getFullYear();
  if (key === 'month') return { from: toISODate(new Date(y, now.getMonth(), 1)) };
  if (key === '3m') return { from: toISODate(new Date(y, now.getMonth() - 2, 1)) };
  if (key === 'year') return { from: `${y}-01-01`, to: `${y}-12-31` };
  if (key === 'lastYear') return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  return {};
}

const RANGES = [
  { key: 'all', label: 'All time' },
  { key: 'month', label: 'This month' },
  { key: '3m', label: 'Last 3 months' },
  { key: 'year', label: 'This year' },
  { key: 'lastYear', label: 'Last year' },
];

export default function History() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ obligationId?: string }>();
  const [q, setQ] = useState('');
  const [range, setRange] = useState('all');
  const [categoryId, setCategoryId] = useState('');
  const [platformId, setPlatformId] = useState('');
  const categories = useCategories();
  const platforms = usePlatforms();
  const query = useHistory({
    q: q.trim() || undefined,
    ...rangeFor(range),
    categoryId: categoryId || undefined,
    platformId: platformId || undefined,
    ...(params.obligationId ? { obligationId: params.obligationId } : {}),
  });

  const groups = useMemo(() => {
    const map = new Map<string, HistoryItem[]>();
    for (const p of query.data?.items ?? []) {
      const key = p.paidOn.slice(0, 7);
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map.entries()];
  }, [query.data]);

  return (
    <Screen
      header={<TopBar title="Payment history" />}
      contentStyle={{ gap: 16, paddingBottom: 32 }}
    >
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
          placeholder="Search history"
          placeholderTextColor={colors.placeholder}
          accessibilityLabel="Search history"
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
        style={{ marginHorizontal: -spacing.screen }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.screen }}
      >
        {RANGES.map((r) => (
          <Chip
            key={r.key}
            label={r.label}
            selected={range === r.key}
            onPress={() => setRange(r.key)}
          />
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Select
          label="Category"
          value={categoryId}
          onChange={setCategoryId}
          options={[
            { value: '', label: 'All categories' },
            ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <Select
          label="Project"
          value={platformId}
          onChange={setPlatformId}
          options={[
            { value: '', label: 'All projects' },
            ...(platforms.data ?? []).map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
      </View>

      <QueryState query={query}>
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState
              illustration="no-results"
              title="No payments found"
              message="Recorded payments will show up here."
            />
          ) : (
            <View style={{ gap: 18 }}>
              <Card style={{ gap: 6 }}>
                <Text variant="small" tone="muted">
                  Total recorded · {data.total} payment{data.total === 1 ? '' : 's'}
                </Text>
                <Text variant="title">
                  {data.totals
                    .map((t) => formatMoney(t.amountMinor, t.currency, { compact: true }))
                    .join(' + ')}
                </Text>
              </Card>
              {groups.map(([key, items]) => {
                const totals = new Map<string, number>();
                for (const p of items)
                  totals.set(p.currency, (totals.get(p.currency) ?? 0) + p.amountMinor);
                return (
                  <View key={key}>
                    <SectionHeader
                      title={`${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`}
                      action={[...totals]
                        .map(([c, a]) => formatMoney(a, c, { compact: true }))
                        .join(' + ')}
                    />
                    <Card padding={0} style={{ overflow: 'hidden' }}>
                      {items.map((p, i) => (
                        <PaymentRow
                          key={p.id}
                          compact
                          divider={i > 0}
                          onPress={() => router.push(`/payments/${p.obligationId}`)}
                          item={{
                            id: p.id,
                            name: p.obligation.name,
                            provider: p.obligation.provider,
                            icon: p.obligation.icon,
                            amountMinor: p.amountMinor,
                            currency: p.currency,
                            date: p.paidOn,
                            status: 'PAID',
                            subtitle: `${p.obligation.platform ? `${p.obligation.platform.name} · ` : ''}${METHOD_LABELS[p.method]} · ${p.recordedBy.name.split(' ')[0]}`,
                          }}
                        />
                      ))}
                    </Card>
                  </View>
                );
              })}
            </View>
          )
        }
      </QueryState>
    </Screen>
  );
}
