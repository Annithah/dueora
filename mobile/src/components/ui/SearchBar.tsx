import { ArrowUpDown, Search, SlidersHorizontal, X } from 'lucide-react-native';
import { Pressable, TextInput, View } from 'react-native';

import { radius, typography, useTheme } from '@/theme';

import { Text } from './Text';

export interface SearchBarProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  onSortPress?: () => void;
  onFilterPress?: () => void;
  /** Number of active filters, shown as a badge on the Filter button. */
  filterCount?: number;
  /** True when the sort isn't the default (tints the Sort button). */
  sortActive?: boolean;
}

function SquareButton({
  label,
  active,
  badge,
  onPress,
  children,
}: {
  label: string;
  active?: boolean;
  badge?: number;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} active` : label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.line,
        backgroundColor: active ? colors.primarySoft : colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {children}
      {badge ? (
        <View
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            minWidth: 20,
            height: 20,
            paddingHorizontal: 5,
            borderRadius: 10,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="captionStrong" tone="inverse">
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Search input with Sort and Filter buttons beside it (bills and history lists). */
export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search',
  onSortPress,
  onFilterPress,
  filterCount = 0,
  sortActive = false,
}: SearchBarProps) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View
        style={{
          flex: 1,
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
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          accessibilityLabel={placeholder}
          returnKeyType="search"
          autoCorrect={false}
          style={[typography.body, { flex: 1, color: colors.ink, paddingVertical: 10 }]}
        />
        {value ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={12} onPress={() => onChangeText('')}>
            <X size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {onSortPress ? (
        <SquareButton label="Sort" active={sortActive} onPress={onSortPress}>
          <ArrowUpDown size={19} color={sortActive ? colors.primaryStrong : colors.ink} />
        </SquareButton>
      ) : null}
      {onFilterPress ? (
        <SquareButton label="Filter" active={filterCount > 0} badge={filterCount} onPress={onFilterPress}>
          <SlidersHorizontal size={19} color={filterCount > 0 ? colors.primaryStrong : colors.ink} />
        </SquareButton>
      ) : null}
    </View>
  );
}
