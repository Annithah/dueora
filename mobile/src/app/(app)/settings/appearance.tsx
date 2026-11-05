import { Check, Moon, Smartphone, Sun, type LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { Card, Text } from '@/components/ui';
import { usePreferences } from '@/state/preferences';
import { darkColors, lightColors, radius, useTheme, type ColorScheme, type ThemePreference } from '@/theme';

const THEME_OPTIONS: { value: ThemePreference; label: string; hint: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', hint: 'Default', icon: Sun },
  { value: 'dark', label: 'Dark', hint: 'Gentler in low light', icon: Moon },
  { value: 'system', label: 'System', hint: 'Match your phone’s setting', icon: Smartphone },
];

/** Tiny picture of a screen in the given palette (half light / half dark for "system"). */
function Preview({ value }: { value: ThemePreference }) {
  const { colors } = useTheme();
  const half = (c: ColorScheme, side: 'left' | 'right' | 'full') => (
    <View
      style={{
        flex: 1,
        backgroundColor: c.canvas,
        padding: 5,
        gap: 3,
        borderTopLeftRadius: side === 'right' ? 0 : 7,
        borderBottomLeftRadius: side === 'right' ? 0 : 7,
        borderTopRightRadius: side === 'left' ? 0 : 7,
        borderBottomRightRadius: side === 'left' ? 0 : 7,
      }}
    >
      <View style={{ height: 6, width: '70%', borderRadius: 3, backgroundColor: c.ink }} />
      <View style={{ height: 12, borderRadius: 3, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }} />
      <View style={{ height: 5, width: '45%', borderRadius: 3, backgroundColor: c.primary }} />
    </View>
  );
  return (
    <View
      style={{ width: 46, height: 46, flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: colors.line }}
    >
      {value === 'system' ? (
        <>
          {half(lightColors, 'left')}
          {half(darkColors, 'right')}
        </>
      ) : (
        half(value === 'dark' ? darkColors : lightColors, 'full')
      )}
    </View>
  );
}

export default function AppearanceSettings() {
  const { colors } = useTheme();
  const theme = usePreferences((s) => s.theme);
  const setTheme = usePreferences((s) => s.setTheme);

  return (
    <Screen header={<TopBar title="Appearance" />}>
      <Text variant="small" tone="muted">
        Choose how DueOra looks on this phone. The change applies straight away.
      </Text>
      <Card padding={0} style={{ overflow: 'hidden' }} accessibilityRole="radiogroup">
        {THEME_OPTIONS.map((o, i) => {
          const selected = theme === o.value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${o.label}. ${o.hint}`}
              onPress={() => setTheme(o.value)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                minHeight: 68,
                paddingHorizontal: 14,
                borderTopWidth: i ? 1 : 0,
                borderTopColor: colors.line,
                backgroundColor: pressed ? colors.primarySoft : 'transparent',
              })}
            >
              <Preview value={o.value} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <o.icon size={16} color={colors.primaryStrong} />
                  <Text variant="bodyStrong">{o.label}</Text>
                </View>
                <Text variant="small" tone="muted">
                  {o.hint}
                </Text>
              </View>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: radius.pill,
                  borderWidth: 2,
                  borderColor: selected ? colors.primary : colors.dashed,
                  backgroundColor: selected ? colors.primary : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {selected ? <Check size={14} color={colors.onPrimary} strokeWidth={3} /> : null}
              </View>
            </Pressable>
          );
        })}
      </Card>
    </Screen>
  );
}
