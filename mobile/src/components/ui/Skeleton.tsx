import { useEffect } from 'react';
import { View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { radius as radii, useTheme } from '@/theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Shimmering placeholder block. */
export function Skeleton({ width = '100%', height = 14, radius = 8, style }: SkeletonProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(0.55);

  useEffect(() => {
    if (reduceMotion) return;
    opacity.set(withRepeat(withTiming(1, { duration: 800 }), -1, true));
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: radius, backgroundColor: colors.line },
        animated,
        style,
      ]}
    />
  );
}

/** Placeholder matching a SubscriptionRow (icon tile, two lines, amount). */
export function SkeletonRow() {
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 76 }}
    >
      <Skeleton width={42} height={42} radius={13} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="55%" height={13} />
        <Skeleton width="35%" height={11} />
      </View>
      <View style={{ alignItems: 'flex-end', gap: 8 }}>
        <Skeleton width={56} height={13} />
        <Skeleton width={70} height={11} />
      </View>
    </View>
  );
}

/** A card of skeleton rows, used while lists load. */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel="Loading"
      accessibilityState={{ busy: true }}
      style={{
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
    >
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={i}
          style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.line } : undefined}
        >
          <SkeletonRow />
        </View>
      ))}
    </View>
  );
}
