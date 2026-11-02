import { Check } from 'lucide-react-native';
import { Pressable, type PressableProps } from 'react-native';

import { radius, useTheme } from '@/theme';

import { Text } from './Text';

export interface ChipProps extends Omit<PressableProps, 'children'> {
  label: string;
  selected?: boolean;
  /** Toggle chips (multi-select) show a check mark when selected. */
  showCheck?: boolean;
}

export function Chip({ label, selected = false, showCheck = false, style, ...rest }: ChipProps) {
  const { colors } = useTheme();
  const fg = selected ? colors.onPrimary : colors.muted;
  return (
    <Pressable
      accessibilityRole={showCheck ? 'checkbox' : 'button'}
      accessibilityState={showCheck ? { checked: selected } : { selected }}
      accessibilityLabel={label}
      hitSlop={{ top: 4, bottom: 4 }}
      {...rest}
      style={(state) => [
        {
          minHeight: 36,
          paddingHorizontal: 14,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: selected ? colors.primary : colors.line,
          backgroundColor: selected ? colors.primary : colors.surface,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          opacity: state.pressed ? 0.85 : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {showCheck && selected ? <Check size={14} color={fg} strokeWidth={2.5} /> : null}
      <Text variant="smallStrong" color={fg}>
        {label}
      </Text>
    </Pressable>
  );
}
