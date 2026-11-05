import { router } from 'expo-router';
import { View } from 'react-native';

import { Illustration } from '@/components/illustrations/Illustration';
import { Screen } from '@/components/layout/Screen';
import { Button, Logo, Text } from '@/components/ui';

/** After the intro slides: choose between creating an account and logging in. */
export default function Welcome() {
  return (
    <Screen scroll={false} contentStyle={{ gap: 0 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 }}>
        <Logo size={44} />
        <Illustration name="all-caught-up" size={200} />
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Text variant="display" align="center" accessibilityRole="header">
            Welcome to DueOra
          </Text>
          <Text variant="body" tone="muted" align="center" style={{ paddingHorizontal: 12 }}>
            Every bill, subscription and renewal — paid on time, for you and your team.
          </Text>
        </View>
      </View>

      <View style={{ gap: 10, paddingTop: 22 }}>
        <Button full size="lg" onPress={() => router.push('/signup')}>
          Create account
        </Button>
        <Button full size="lg" variant="secondary" onPress={() => router.push('/login')}>
          I already have an account
        </Button>
      </View>
    </Screen>
  );
}
