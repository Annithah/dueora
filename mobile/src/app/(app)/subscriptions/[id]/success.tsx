import { router, useLocalSearchParams } from 'expo-router';
import { CalendarDays } from 'lucide-react-native';
import { View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { Button, Card, SuccessCheck, Text, toast } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { useTheme } from '@/theme';

export default function PaymentRecorded() {
  const { colors } = useTheme();
  const p = useLocalSearchParams<{
    id: string;
    name: string;
    amount: string;
    paidOn: string;
    next?: string;
    completed?: string;
  }>();
  const cycleDone = p.completed === '1';

  const rows: [string, string][] = [
    ['Amount paid', p.amount ?? ''],
    ['Payment date', p.paidOn ? formatDate(p.paidOn) : ''],
  ];
  if (p.next) rows.push([cycleDone ? 'Next due date' : 'Still due by', formatDate(p.next)]);

  return (
    <Screen
      scroll={false}
      contentStyle={{ justifyContent: 'center', alignItems: 'center', gap: 22 }}
    >
      <SuccessCheck size={150} />
      <View style={{ gap: 8 }}>
        <Text variant="display" align="center" accessibilityRole="header">
          Payment recorded
        </Text>
        <Text variant="body" tone="muted" align="center">
          {cycleDone
            ? `Great work. ${p.name} is now up to date.`
            : `Saved. Part of ${p.name} is still open.`}
        </Text>
      </View>
      <Card style={{ alignSelf: 'stretch', paddingVertical: 4 }}>
        {rows.map(([k, v], i) => (
          <View
            key={k}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              minHeight: 48,
              borderTopWidth: i ? 1 : 0,
              borderTopColor: colors.line,
            }}
          >
            <Text variant="small" tone="muted">
              {k}
            </Text>
            <Text variant="bodyStrong">{v}</Text>
          </View>
        ))}
      </Card>
      {p.next && cycleDone ? (
        <View
          style={{
            alignSelf: 'stretch',
            flexDirection: 'row',
            gap: 10,
            alignItems: 'center',
            padding: 13,
            borderRadius: 14,
            backgroundColor: colors.primarySoft,
          }}
        >
          <CalendarDays size={21} color={colors.primaryStrong} />
          <View style={{ flex: 1 }}>
            <Text variant="smallStrong" tone="primary">
              Next due date moved
            </Text>
            <Text variant="small" tone="muted">
              We&apos;ll remind you before {formatDate(p.next)}.
            </Text>
          </View>
        </View>
      ) : null}
      <View style={{ alignSelf: 'stretch', gap: 10 }}>
        <Button
          full
          size="lg"
          onPress={() => {
            router.dismissTo('/');
            toast.success('Payment recorded. Dashboard updated.');
          }}
        >
          Back to dashboard
        </Button>
        <Button full variant="secondary" onPress={() => router.back()}>
          View payment
        </Button>
      </View>
    </Screen>
  );
}
