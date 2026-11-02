import { useEffect } from 'react';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { radius, statusStyle, useTheme, type PaymentStatus } from '@/theme';

import { Text } from './Text';

export interface StatusBadgeProps {
  status: PaymentStatus;
  /** Gentle pulse for overdue items (disabled when the OS asks for reduced motion). */
  pulse?: boolean;
}

/** Status pill — always icon + label, never colour alone. */
export function StatusBadge({ status, pulse = status === 'OVERDUE' }: StatusBadgeProps) {
  const { colors } = useTheme();
  const s = statusStyle(status, colors);
  const Icon = s.icon;
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!pulse || reduceMotion) return;
    scale.set(
      withRepeat(
        withSequence(withTiming(1.06, { duration: 700 }), withTiming(1, { duration: 700 })),
        -1,
      ),
    );
    return () => cancelAnimation(scale);
  }, [pulse, reduceMotion, scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Status: ${s.label}`}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: 4,
          minHeight: 24,
          paddingHorizontal: 8,
          borderRadius: radius.pill,
          backgroundColor: s.soft,
        },
        animatedStyle,
      ]}
    >
      <Icon size={13} color={s.text} strokeWidth={2.4} />
      <Text variant="captionStrong" color={s.text}>
        {s.label}
      </Text>
    </Animated.View>
  );
}
