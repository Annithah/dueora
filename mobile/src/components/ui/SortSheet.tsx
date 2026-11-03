import { Check } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';

import { BottomSheet } from './BottomSheet';
import { Text } from './Text';

export interface SortOption<T extends string> {
  value: T;
  label: string;
}

export interface SortSheetProps<T extends string> {
  visible: boolean;
  onClose: () => void;
  options: readonly SortOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Single-choice list of sort orders; picking one applies it and closes the sheet. */
export function SortSheet<T extends string>({ visible, onClose, options, value, onChange }: SortSheetProps<T>) {
  const { colors } = useTheme();
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Sort by" scrollable={false}>
      <View accessibilityRole="radiogroup">
        {options.map((o, i) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => {
                onChange(o.value);
                onClose();
              }}
              style={({ pressed }) => ({
                minHeight: 52,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.line,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text variant="bodyStrong" tone={selected ? 'primary' : 'ink'}>
                {o.label}
              </Text>
              {selected ? <Check size={20} color={colors.primaryStrong} /> : null}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}
