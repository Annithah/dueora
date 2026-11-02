import type { ReactNode } from 'react';
import { Pressable, View, type PressableProps } from 'react-native';

import { HIT_SIZE, useTheme } from '@/theme';

export interface IconButtonProps extends Omit<PressableProps, 'children'> {
  /** Required: icon-only buttons need a spoken label. */
  accessibilityLabel: string;
  children: ReactNode;
  /** Small red dot (e.g. unread notifications). */
  dot?: boolean;
  tone?: 'plain' | 'soft';
}

export function IconButton({ children, dot, tone = 'plain', style, ...rest }: IconButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={4}
      {...rest}
      style={(state) => [
        {
          width: HIT_SIZE,
          height: HIT_SIZE,
          borderRadius: 13,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: state.pressed || tone === 'soft' ? colors.primarySoft : 'transparent',
        },
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {children}
      {dot ? (
        <View
          testID="icon-button-dot"
          style={{
            position: 'absolute',
            top: 9,
            right: 10,
            width: 9,
            height: 9,
            borderRadius: 5,
            backgroundColor: colors.red,
            borderWidth: 2,
            borderColor: colors.canvas,
          }}
        />
      ) : null}
    </Pressable>
  );
}
