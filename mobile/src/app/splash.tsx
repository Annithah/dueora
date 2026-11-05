import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Logo, Text } from '@/components/ui';
import { onBrand, palette } from '@/theme';

/** How long the brand splash stays before the intro slides (tap to skip). */
const SPLASH_MS = 1800;

/** First launch only: teal full-bleed brand moment, then the onboarding slides. */
export default function Splash() {
  const done = useRef(false);
  const next = useCallback(() => {
    if (done.current) return;
    done.current = true;
    router.replace('/onboarding');
  }, []);

  useEffect(() => {
    const t = setTimeout(next, SPLASH_MS);
    return () => clearTimeout(t);
  }, [next]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="DueOra. Your dues, on time. Tap to continue"
      onPress={next}
      style={{ flex: 1, backgroundColor: palette.teal800, overflow: 'hidden' }}
    >
      <StatusBar style="light" />
      {/* Decorative rings */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: 430,
          height: 430,
          borderRadius: 215,
          borderWidth: 1,
          borderColor: onBrand.ring,
          top: -210,
          right: -220,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: 290,
          height: 290,
          borderRadius: 145,
          borderWidth: 1,
          borderColor: onBrand.ring,
          bottom: -90,
          left: -170,
        }}
      />

      <Animated.View
        entering={FadeIn.duration(400)}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}
      >
        <Logo size={58} inverse />
        <Text variant="body" color={onBrand.muted} style={{ fontSize: 15 }}>
          Your dues, on time.
        </Text>
      </Animated.View>
    </Pressable>
  );
}
