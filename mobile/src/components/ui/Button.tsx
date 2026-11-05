import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { elevation, palette, radius, useTheme, type ColorScheme } from '@/theme';

import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  children: ReactNode;
  variant?: ButtonVariant;
  /** Leading icon element (e.g. <Plus size={18} />). Colour it with `useButtonColors` or leave lucide's currentColor. */
  icon?: ReactNode;
  trailingIcon?: ReactNode;
  full?: boolean;
  loading?: boolean;
  size?: 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}

function variantColors(variant: ButtonVariant, colors: ColorScheme) {
  switch (variant) {
    case 'primary':
      return { bg: colors.primary, fg: colors.onPrimary, border: colors.primary };
    case 'secondary':
      return { bg: colors.primarySoft, fg: colors.primaryStrong, border: colors.primaryTint };
    case 'ghost':
      return { bg: 'transparent', fg: colors.primaryStrong, border: 'transparent' };
    case 'danger':
      return { bg: colors.danger, fg: colors.onDanger, border: colors.danger };
    case 'inverse':
      // For use on the brand-teal screens (splash, app lock), which are teal in both schemes.
      return { bg: palette.white, fg: palette.teal800, border: palette.white };
  }
}

export function Button({
  children,
  variant = 'primary',
  icon,
  trailingIcon,
  full = false,
  loading = false,
  size = 'md',
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const { colors } = useTheme();
  const c = variantColors(variant, colors);
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      {...rest}
      style={({ pressed }) => [
        {
          minHeight: size === 'lg' ? 52 : 48,
          borderRadius: radius.md,
          backgroundColor: c.bg,
          borderWidth: 1,
          borderColor: c.border,
          paddingHorizontal: 18,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 9,
          alignSelf: full ? 'stretch' : 'auto',
          opacity: isDisabled ? 0.55 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          shadowColor: colors.primary,
          ...(variant === 'primary' && !isDisabled ? elevation.primary : {}),
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <>
          {icon ? <View>{icon}</View> : null}
          {typeof children === 'string' ? (
            <Text variant="bodyStrong" color={c.fg} numberOfLines={1}>
              {children}
            </Text>
          ) : (
            children
          )}
          {trailingIcon ? <View>{trailingIcon}</View> : null}
        </>
      )}
    </Pressable>
  );
}

/** Foreground colour a button variant uses — for tinting icons passed to `icon`. */
export function useButtonForeground(variant: ButtonVariant = 'primary'): string {
  const { colors } = useTheme();
  return variantColors(variant, colors).fg;
}
