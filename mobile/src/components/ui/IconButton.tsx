import type { ReactNode } from 'react';
import { Pressable, Text, View, type PressableProps } from 'react-native';

import { fontFamily, HIT_SIZE, useTheme } from '@/theme';

export interface IconButtonProps extends Omit<PressableProps, 'children'> {
  /** Required: icon-only buttons need a spoken label. */
  accessibilityLabel: string;
  children: ReactNode;
  /** Small red dot (e.g. unread notifications). */
  dot?: boolean;
  /** Count badge (e.g. unread alerts); hidden when 0. Shows "99+" above 99. */
  badge?: number;
  tone?: 'plain' | 'soft';
}

export function IconButton({ children, dot, badge = 0, tone = 'plain', style, ...rest }: IconButtonProps) {
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
      {badge > 0 ? (
        <View
          testID="icon-button-badge"
          style={{
            position: 'absolute',
            top: 4,
            right: 2,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: 9,
            backgroundColor: colors.badge,
            borderWidth: 2,
            borderColor: colors.canvas,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            allowFontScaling={false}
            style={{ fontFamily: fontFamily.extrabold, fontSize: 10, lineHeight: 12, color: colors.onBadge }}
          >
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : dot ? (
        <View
          testID="icon-button-dot"
          style={{
            position: 'absolute',
            top: 9,
            right: 10,
            width: 9,
            height: 9,
            borderRadius: 5,
            backgroundColor: colors.badge,
            borderWidth: 2,
            borderColor: colors.canvas,
          }}
        />
      ) : null}
    </Pressable>
  );
}
