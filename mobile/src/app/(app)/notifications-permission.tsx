import { router } from 'expo-router';
import { BellRing, CalendarClock, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { Illustration } from '@/components/illustrations/Illustration';
import { Screen } from '@/components/layout/Screen';
import { Button, Text, toast } from '@/components/ui';
import { permissionState, registerDevice, requestPermission } from '@/features/notifications/push';
import { useTheme } from '@/theme';

/** Shown right after the first obligation is created — the moment reminders start to matter. */
export default function NotificationsPermission() {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const enable = async () => {
    setBusy(true);
    try {
      const current = await permissionState();
      if (current === 'denied') {
        // The OS won't show the prompt again; send them to Settings.
        await Linking.openSettings();
        return;
      }
      const result = await requestPermission();
      if (result === 'granted') {
        await registerDevice().catch(() => undefined);
        toast.success('Reminders are on 🎉', 'We’ll nudge you before anything is due.');
      }
      close();
    } finally {
      setBusy(false);
    }
  };

  const points = [
    { icon: CalendarClock, text: 'A heads-up 30, 14, 7, 3 and 1 day before — and on the day.' },
    { icon: BellRing, text: 'One calm summary when several things are due at once.' },
    { icon: ShieldCheck, text: 'Change what we send any time in Settings.' },
  ];

  return (
    <Screen
      footer={
        <View style={{ gap: 8 }}>
          <Button full size="lg" loading={busy} onPress={() => void enable()}>
            Turn on reminders
          </Button>
          <Button full variant="ghost" onPress={close}>
            Not now
          </Button>
        </View>
      }
    >
      <View style={{ alignItems: 'center', paddingTop: 12 }}>
        <Illustration name="notifications" size={200} />
      </View>
      <View style={{ gap: 8 }}>
        <Text variant="display" align="center" accessibilityRole="header">
          Never miss a due date
        </Text>
        <Text variant="body" tone="muted" align="center">
          Your first payment is saved. Let DueOra remind you before it&apos;s due — that&apos;s the
          whole point.
        </Text>
      </View>
      <View style={{ gap: 14 }}>
        {points.map(({ icon: Icon, text }) => (
          <View key={text} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: colors.primarySoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={20} color={colors.primaryStrong} />
            </View>
            <Text variant="body" style={{ flex: 1 }}>
              {text}
            </Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}
