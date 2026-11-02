import { router } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Logo, Text } from '@/components/ui';
import { palette } from '@/theme';

/** Splash / welcome: teal full-bleed with the brand and a "Get started" button. */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  const next = () => router.push('/onboarding');

  return (
    <Pressable
      accessible={false}
      onPress={next}
      style={{ flex: 1, backgroundColor: palette.teal800, overflow: 'hidden' }}
    >
      {/* Decorative rings */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: 430,
          height: 430,
          borderRadius: 215,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.11)',
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
          borderColor: 'rgba(255,255,255,0.11)',
          bottom: -90,
          left: -170,
        }}
      />

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <Logo size={58} inverse />
        <Text variant="body" color="rgba(255,255,255,0.85)" style={{ fontSize: 15 }}>
          Your dues, on time.
        </Text>
      </View>

      <View
        style={{
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 28,
          gap: 14,
          alignItems: 'center',
        }}
      >
        <Button
          variant="inverse"
          size="lg"
          full
          onPress={next}
          trailingIcon={<ArrowRight size={18} color={palette.teal800} />}
        >
          Get started
        </Button>
        <Text variant="caption" color="rgba(255,255,255,0.7)">
          Tap anywhere to continue
        </Text>
      </View>
    </Pressable>
  );
}
