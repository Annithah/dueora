import { ChevronDown, ChevronUp, Mail } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { Button, Card, Text } from '@/components/ui';
import { useTheme } from '@/theme';

const FAQ: [string, string][] = [
  [
    'When do reminders go out?',
    'At your workspace’s reminder time (09:00 by default, in its timezone): 30, 14, 7, 3 and 1 day before, on the day, then 1, 3 and 7 days after — and weekly until it’s paid. Change them per subscription or in Notifications.',
  ],
  [
    'I paid part of a bill. What happens?',
    'Record a partial payment. The subscription stays “Partially paid” and reminders mention what’s left. When the rest is recorded, the next due date moves forward automatically.',
  ],
  [
    'How do I stop reminders for one subscription?',
    'Open it, tap ••• and choose Mute (just for you) or Archive (for everyone, history is kept).',
  ],
  [
    'Why didn’t I get a push notification?',
    'Check that notifications are allowed for DueOra in your phone settings, then use Notifications → Send test notification. If you have no phone registered we email you instead.',
  ],
  [
    'Who can see what?',
    'Admins can do everything. Finance manages subscriptions, payments and reports. Viewers can look but not change anything — everyone gets the reminders. Subscription keys are shown in full only to admins and finance.',
  ],
  [
    'Does DueOra work offline?',
    'Yes, for reading: your latest data is saved on the phone. Adding subscriptions and recording payments needs a connection.',
  ],
];

export default function Help() {
  const { colors } = useTheme();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Screen header={<TopBar title="Help & support" />}>
      <Text variant="section">Common questions</Text>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        {FAQ.map(([q, a], i) => (
          <View key={q} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: open === i }}
              onPress={() => setOpen(open === i ? null : i)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                minHeight: 56,
                paddingHorizontal: 14,
              }}
            >
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {q}
              </Text>
              {open === i ? (
                <ChevronUp size={18} color={colors.muted} />
              ) : (
                <ChevronDown size={18} color={colors.muted} />
              )}
            </Pressable>
            {open === i ? (
              <Text
                variant="body"
                tone="muted"
                style={{ paddingHorizontal: 14, paddingBottom: 14 }}
              >
                {a}
              </Text>
            ) : null}
          </View>
        ))}
      </Card>
      <Card tone="primary" style={{ gap: 10 }}>
        <Text variant="bodyStrong">Still stuck?</Text>
        <Text variant="small" tone="muted">
          Write to us and a person will get back to you within one working day.
        </Text>
        <Button
          variant="secondary"
          icon={<Mail size={18} color={colors.primaryStrong} />}
          onPress={() => void Linking.openURL('mailto:support@dueora.app?subject=DueOra%20help')}
        >
          Email support
        </Button>
      </Card>
    </Screen>
  );
}
