import { router } from 'expo-router';
import { View } from 'react-native';

import { Illustration } from '@/components/illustrations/Illustration';
import { Screen } from '@/components/layout/Screen';
import { Button, Logo, Text } from '@/components/ui';
import { useTranslation } from '@/i18n';

/** After the intro slides: choose between creating an account and logging in. */
export default function Welcome() {
  const { t } = useTranslation();
  return (
    <Screen scroll={false} contentStyle={{ gap: 0 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 }}>
        <Logo size={44} />
        <Illustration name="all-caught-up" size={200} />
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Text variant="display" align="center" accessibilityRole="header">
            {t('welcome.title')}
          </Text>
          <Text variant="body" tone="muted" align="center" style={{ paddingHorizontal: 12 }}>
            {t('welcome.text')}
          </Text>
        </View>
      </View>

      <View style={{ gap: 10, paddingTop: 22 }}>
        <Button full size="lg" onPress={() => router.push('/signup')}>
          {t('welcome.createAccount')}
        </Button>
        <Button full size="lg" variant="secondary" onPress={() => router.push('/login')}>
          {t('welcome.haveAccount')}
        </Button>
      </View>
    </Screen>
  );
}
