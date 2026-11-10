import { AlertTriangle, CheckCircle2, CircleAlert } from 'lucide-react-native';
import { View } from 'react-native';

import { Text } from '@/components/ui';
import type { BudgetProgress } from '@/features/budgets/api';
import { formatUSD } from '@/lib/money';
import { useTheme } from '@/theme';

/** One budget: label, progress bar and an icon + word for the state (never colour alone). */
export function BudgetBar({ b, compact = false }: { b: BudgetProgress; compact?: boolean }) {
  const { colors } = useTheme();
  const tone = b.state === 'OVER' ? colors.red : b.state === 'WARNING' ? colors.orange : colors.green;
  const Icon = b.state === 'OVER' ? CircleAlert : b.state === 'WARNING' ? AlertTriangle : CheckCircle2;
  const word = b.state === 'OVER' ? 'Over budget' : b.state === 'WARNING' ? 'Close to the limit' : 'On track';
  const label = b.category?.name ?? 'Whole workspace';
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${b.percent}% used, ${formatUSD(b.spentCents)} of ${formatUSD(b.monthlyLimitCents)}. ${word}.`}
      style={{ gap: 6 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text variant={compact ? 'smallStrong' : 'bodyStrong'} style={{ flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
        <Text variant="smallStrong">{b.percent}%</Text>
      </View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.line, overflow: 'hidden' }}>
        <View style={{ width: `${Math.min(100, b.percent)}%`, height: '100%', borderRadius: 5, backgroundColor: tone }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon size={14} color={tone} />
        <Text variant="caption" tone="muted" style={{ flex: 1 }}>
          {word} · {formatUSD(b.spentCents)} of {formatUSD(b.monthlyLimitCents)}
          {compact ? '' : ` (${formatUSD(b.paidCents)} paid, ${formatUSD(b.dueCents)} still due)`}
        </Text>
      </View>
    </View>
  );
}
