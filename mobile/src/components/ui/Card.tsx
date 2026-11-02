import { View, type ViewProps } from 'react-native';

import { elevation, radius, useTheme } from '@/theme';

export interface CardProps extends ViewProps {
  /** Inner padding in px (default 16). Use 0 for lists whose rows pad themselves. */
  padding?: number;
  /** Tinted variant used for informational callouts. */
  tone?: 'default' | 'primary' | 'accent';
}

export function Card({ padding = 16, tone = 'default', style, ...rest }: CardProps) {
  const { colors } = useTheme();
  const background =
    tone === 'primary'
      ? colors.primarySoft
      : tone === 'accent'
        ? colors.accentSoft
        : colors.surface;
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: background,
          borderRadius: radius.card,
          borderWidth: tone === 'default' ? 1 : 0,
          borderColor: colors.line,
          padding,
          shadowColor: colors.shadow,
          ...(tone === 'default' ? elevation.soft : {}),
        },
        style,
      ]}
    />
  );
}
