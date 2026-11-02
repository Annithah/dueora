import { Check, ChevronDown } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { radius, useTheme } from '@/theme';

import { BottomSheet } from './BottomSheet';
import { Text } from './Text';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  /** Leading visual (e.g. CategoryIcon or Avatar). */
  leading?: ReactNode;
}

export interface SelectProps<T extends string> {
  label?: string;
  value: T | null | undefined;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  error?: string;
  icon?: ReactNode;
  disabled?: boolean;
  /** Title of the picker sheet (defaults to label). */
  sheetTitle?: string;
}

/** A field that opens a bottom-sheet list. Native pickers look out of place in the design. */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Choose an option',
  error,
  icon,
  disabled,
  sheetTitle,
}: SelectProps<T>) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={{ gap: 8, flex: 1 }}>
      {label ? <Text variant="label">{label}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          label ? `${label}: ${selected?.label ?? placeholder}` : (selected?.label ?? placeholder)
        }
        accessibilityHint="Opens a list of options"
        accessibilityState={{ disabled: !!disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          minHeight: 48,
          borderRadius: radius.input,
          borderWidth: 1,
          borderColor: error ? colors.red : colors.line,
          backgroundColor: colors.surface,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 14,
          opacity: disabled ? 0.55 : pressed ? 0.85 : 1,
        })}
      >
        {icon ?? selected?.leading ?? null}
        <Text
          variant="body"
          tone={selected ? 'ink' : 'muted'}
          numberOfLines={1}
          style={{ flex: 1 }}
        >
          {selected?.label ?? placeholder}
        </Text>
        <ChevronDown size={18} color={colors.muted} />
      </Pressable>
      {error ? (
        <Text variant="small" tone="danger">
          {error}
        </Text>
      ) : null}

      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={sheetTitle ?? label ?? placeholder}
      >
        <View accessibilityRole="radiogroup" style={{ gap: 4 }}>
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={({ pressed }) => ({
                  minHeight: 52,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 12,
                  borderRadius: radius.sm,
                  backgroundColor: isSelected || pressed ? colors.primarySoft : 'transparent',
                })}
              >
                {option.leading}
                <View style={{ flex: 1 }}>
                  <Text variant={isSelected ? 'bodyStrong' : 'body'}>{option.label}</Text>
                  {option.description ? (
                    <Text variant="small" tone="muted">
                      {option.description}
                    </Text>
                  ) : null}
                </View>
                {isSelected ? <Check size={18} color={colors.primaryStrong} /> : null}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </View>
  );
}
