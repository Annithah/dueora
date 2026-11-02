import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { typography, useTheme, type ColorScheme, type TypographyVariant } from '@/theme';

export type TextTone = 'ink' | 'muted' | 'primary' | 'danger' | 'inverse' | 'success';

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  tone?: TextTone;
  /** Explicit colour; wins over `tone`. */
  color?: string;
  align?: 'left' | 'center' | 'right';
}

function toneColor(tone: TextTone, colors: ColorScheme): string {
  switch (tone) {
    case 'ink':
      return colors.ink;
    case 'muted':
      return colors.muted;
    case 'primary':
      return colors.primaryStrong;
    case 'danger':
      return colors.red;
    case 'success':
      return colors.green;
    case 'inverse':
      return colors.onPrimary;
  }
}

export function Text({ variant = 'body', tone = 'ink', color, align, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[
        typography[variant],
        { color: color ?? toneColor(tone, colors) },
        align && { textAlign: align },
        style,
      ]}
    />
  );
}
