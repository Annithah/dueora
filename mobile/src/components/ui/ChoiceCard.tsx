import { CircleCheck } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

import { radius, useTheme } from '@/theme';

import { Text } from './Text';

export interface ChoiceCardProps {
  label: string;
  description?: string;
  icon: (color: string) => ReactNode;
  selected: boolean;
  onPress: () => void;
}

/** Large selectable card (workspace type: Company / Personal). */
export function ChoiceCard({ label, description, icon, selected, onPress }: ChoiceCardProps) {
  const { colors } = useTheme();
  const fg = selected ? colors.primaryStrong : colors.muted;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={description ? `${label}, ${description}` : label}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 96,
        padding: 14,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: selected ? colors.primaryStrong : colors.line,
        backgroundColor: selected ? colors.primarySoft : colors.surface,
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      {icon(fg)}
      {selected ? (
        <CircleCheck
          size={18}
          color={colors.primaryStrong}
          style={{ position: 'absolute', top: 12, right: 12 }}
        />
      ) : null}
      <Text variant="bodyStrong" color={fg}>
        {label}
      </Text>
      {description ? (
        <Text variant="small" tone="muted">
          {description}
        </Text>
      ) : null}
    </Pressable>
  );
}
