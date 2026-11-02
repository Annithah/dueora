import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { statusStyle, useTheme, type PaymentStatus } from '@/theme';

import { Text } from './Text';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface CountdownRingProps {
  /** Days until due (negative = overdue). */
  days: number;
  /** Length of the billing cycle in days; drives how full the ring is. */
  cycleDays: number;
  status: PaymentStatus;
  size?: number;
}

/**
 * Fraction of the ring to fill. Upcoming: the share of the cycle already elapsed
 * (fills up as the due date approaches). Due/overdue: full.
 */
export function ringProgress(days: number, cycleDays: number): number {
  if (days <= 0 || cycleDays <= 0) return 1;
  return Math.min(1, Math.max(0.04, 1 - days / cycleDays));
}

export function CountdownRing({ days, cycleDays, status, size = 80 }: CountdownRingProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const target = ringProgress(days, cycleDays);
  const progress = useSharedValue(reduceMotion ? target : 0);
  const color = statusStyle(status, colors).brand;

  useEffect(() => {
    progress.set(
      withTiming(target, { duration: reduceMotion ? 0 : 900, easing: Easing.out(Easing.cubic) }),
    );
  }, [target, reduceMotion, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));
  const abs = Math.abs(days);
  const label =
    days < 0
      ? `Overdue by ${abs} ${abs === 1 ? 'day' : 'days'}`
      : days === 0
        ? 'Due today'
        : `Due in ${abs} ${abs === 1 ? 'day' : 'days'}`;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.line}
          strokeWidth={stroke}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
        />
      </Svg>
      <View
        style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text variant="section" allowFontScaling={false}>
          {days === 0 ? 'Today' : abs}
        </Text>
        {days !== 0 ? (
          <Text variant="caption" tone="muted" allowFontScaling={false}>
            {abs === 1 ? 'day' : 'days'}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
