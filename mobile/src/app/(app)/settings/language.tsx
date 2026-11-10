import { Check } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { Card, Text } from '@/components/ui';
import { useSetLocale } from '@/features/account/api';
import { LOCALES, useLocale, useTranslation, type Locale } from '@/i18n';
import { useTheme } from '@/theme';

const FLAGS: Record<Locale, string> = { en: '🇬🇧', fr: '🇫🇷', rw: '🇷🇼' };

/** Settings → Language: English, French, Kinyarwanda. Saved on the phone and on the account. */
export default function LanguageSettings() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const locale = useLocale((s) => s.locale);
  const setLocale = useLocale((s) => s.setLocale);
  const saveOnAccount = useSetLocale();

  return (
    <Screen header={<TopBar title={t('language.title')} />}>
      <Text variant="small" tone="muted">
        {t('language.hint')}
      </Text>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        {LOCALES.map((l, i) => {
          const selected = l === locale;
          return (
            <Pressable
              key={l}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => {
                setLocale(l);
                // Best effort: emails and summaries can follow the account language later.
                saveOnAccount.mutate(l);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                minHeight: 56,
                paddingHorizontal: 15,
                borderTopWidth: i ? 1 : 0,
                borderTopColor: colors.line,
                backgroundColor: selected ? colors.primarySoft : colors.surface,
              }}
            >
              <Text variant="title" accessibilityElementsHidden>
                {FLAGS[l]}
              </Text>
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {t(`language.${l}`)}
              </Text>
              {selected ? (
                <View>
                  <Check size={20} color={colors.primaryStrong} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </Card>
    </Screen>
  );
}
