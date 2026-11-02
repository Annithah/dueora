import { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { motion, useTheme } from '@/theme';

export interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
}

/** Prototype-styled switch (42×24, teal when on). */
export function Switch({ value, onValueChange, accessibilityLabel, disabled }: SwitchProps) {
  const { colors } = useTheme();
  const x = useSharedValue(value ? 18 : 0);

  useEffect(() => {
    x.set(withTiming(value ? 18 : 0, { duration: motion.base }));
  }, [value, x]);

  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      hitSlop={10}
      onPress={() => onValueChange(!value)}
      style={{
        width: 42,
        height: 24,
        padding: 3,
        borderRadius: 20,
        backgroundColor: value ? colors.primary : colors.switchOff,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Animated.View
        style={[
          {
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: '#FFFFFF',
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
            elevation: 2,
          },
          knob,
        ]}
      />
    </Pressable>
  );
}
