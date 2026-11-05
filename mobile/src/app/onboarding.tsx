import { router } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Illustration, type IllustrationName } from '@/components/illustrations/Illustration';
import { Screen } from '@/components/layout/Screen';
import { Button, Logo, Text } from '@/components/ui';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme';

const SLIDES: { title: string; text: string; illustration: IllustrationName }[] = [
  {
    title: 'Add everything you pay',
    text: 'Keep hosting, domains, rent, utilities and subscriptions together.',
    illustration: 'add',
  },
  {
    title: "Get reminded before it's due",
    text: 'Choose when we should nudge you, so nothing catches you by surprise.',
    illustration: 'remind',
  },
  {
    title: 'Track every payment in one place',
    text: 'See what is paid, upcoming or overdue at a glance.',
    illustration: 'track',
  },
];

/**
 * Three intro slides. First launch: Skip or "Get started" leads to the Welcome screen.
 * Replayed from Help ("View intro again") while signed in: both just close the intro.
 */
export default function Onboarding() {
  const { colors } = useTheme();
  const [index, setIndex] = useState(0);
  const signedIn = useSession((s) => s.status === 'signedIn');
  const markOnboarded = useSession((s) => s.markOnboarded);
  const slide = SLIDES[index] ?? SLIDES[0]!;
  const last = index === SLIDES.length - 1;

  const finish = async () => {
    if (signedIn) {
      if (router.canGoBack()) router.back();
      else router.replace('/');
      return;
    }
    await markOnboarded();
    router.replace('/welcome');
  };

  return (
    <Screen scroll={false} contentStyle={{ gap: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Logo size={40} markOnly />
        {last ? (
          <View style={{ minHeight: 44 }} />
        ) : (
          <Button variant="ghost" onPress={() => void finish()}>
            Skip
          </Button>
        )}
      </View>

      <Animated.View
        key={index}
        entering={FadeIn.duration(250)}
        exiting={FadeOut.duration(150)}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28 }}
      >
        <Illustration name={slide.illustration} size={230} />
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Text variant="eyebrow" tone="primary">
            STEP {index + 1} OF {SLIDES.length}
          </Text>
          <Text variant="display" align="center" accessibilityRole="header">
            {slide.title}
          </Text>
          <Text variant="body" tone="muted" align="center" style={{ paddingHorizontal: 12 }}>
            {slide.text}
          </Text>
        </View>
      </Animated.View>

      <View
        accessible
        accessibilityLabel={`Step ${index + 1} of ${SLIDES.length}`}
        style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginVertical: 22 }}
      >
        {SLIDES.map((s, i) => (
          <View
            key={s.title}
            style={{
              width: i === index ? 24 : 7,
              height: 7,
              borderRadius: 10,
              backgroundColor: i === index ? colors.primary : colors.switchOff,
            }}
          />
        ))}
      </View>

      <Button
        full
        size="lg"
        onPress={() => (last ? void finish() : setIndex(index + 1))}
        trailingIcon={<ArrowRight size={18} color={colors.onPrimary} />}
      >
        {last ? 'Get started' : 'Next'}
      </Button>
    </Screen>
  );
}
