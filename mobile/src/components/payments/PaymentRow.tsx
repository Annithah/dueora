import { Pressable, View } from 'react-native';

import { AmountText, CategoryIcon, StatusBadge, Text } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { useTheme, type PaymentStatus } from '@/theme';

export interface PaymentRowData {
  id: string;
  name: string;
  provider: string;
  icon: string;
  amountMinor: number;
  currency: string;
  date: string;
  status: PaymentStatus;
  subtitle?: string;
  platform?: string | null;
}

export interface PaymentRowProps {
  item: PaymentRowData;
  onPress?: () => void;
  /** Compact rows put the badge under the amount (dashboard lists). */
  compact?: boolean;
  divider?: boolean;
  /** Bordered card style used in the timeline. */
  bordered?: boolean;
}

/** The prototype's payment row: category tile, name + "provider · cycle", amount, date and status. */
export function PaymentRow({
  item,
  onPress,
  compact = false,
  divider = false,
  bordered = false,
}: PaymentRowProps) {
  const { colors } = useTheme();
  const overdue = item.status === 'OVERDUE';
  const label = `${item.name}, ${item.platform ? `${item.platform}, ` : ''}${item.subtitle ?? item.provider}`;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 76,
        padding: 12,
        backgroundColor: pressed ? colors.primarySoft : colors.surface,
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: colors.line,
        ...(bordered ? { borderWidth: 1, borderColor: colors.line, borderRadius: 14 } : {}),
      })}
    >
      {overdue ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 10,
            bottom: 10,
            width: 3,
            borderRadius: 3,
            backgroundColor: colors.red,
          }}
        />
      ) : null}
      <CategoryIcon icon={item.icon} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {item.name}
        </Text>
        <Text variant="small" tone="muted" numberOfLines={1}>
          {item.subtitle ?? item.provider}
        </Text>
        {!compact ? <StatusBadge status={item.status} /> : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <AmountText amountMinor={item.amountMinor} currency={item.currency} variant="bodyStrong" />
        <Text variant="caption" tone="muted">
          {formatDate(item.date)}
        </Text>
        {compact ? <StatusBadge status={item.status} /> : null}
      </View>
    </Pressable>
  );
}
