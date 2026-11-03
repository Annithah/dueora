import { View } from 'react-native';

import { Text } from '@/components/ui';
import type { Breakdown } from '@/features/insights/api';
import { formatUSD } from '@/lib/money';
import { useTheme } from '@/theme';

/** Horizontal bars for a spending breakdown (e.g. by company), largest first. */
export function BreakdownBars({ items }: { items: Breakdown[] }) {
  const { colors } = useTheme();
  const max = Math.max(...items.map((i) => i.amountCents), 1);
  return (
    <View style={{ gap: 14 }}>
      {items.map((c) => (
        <View key={c.id} accessible accessibilityLabel={`${c.name}: ${formatUSD(c.amountCents)}, ${c.share}%`} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="smallStrong" numberOfLines={1} style={{ flex: 1 }}>
              {c.name}
            </Text>
            <Text variant="smallStrong">{formatUSD(c.amountCents, { compact: true })}</Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.primarySoft, overflow: 'hidden' }}>
            <View style={{ width: `${(c.amountCents / max) * 100}%`, height: 8, borderRadius: 4, backgroundColor: c.color || colors.primary }} />
          </View>
        </View>
      ))}
    </View>
  );
}
