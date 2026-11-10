import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import {
  BottomSheet,
  Button,
  DateField,
  FormMessage,
  Input,
  Segmented,
  Select,
  Text,
} from '@/components/ui';
import { ApiError } from '@/api';
import { centsToInput, formatUSD, parseUSDInput } from '@/lib/money';
import { typography, useTheme } from '@/theme';

import { METHOD_LABELS, useRecordPayment, type PaymentMethod, type Subscription } from './api';

const METHODS = (Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => ({
  value: m,
  label: METHOD_LABELS[m],
}));

export function RecordPaymentSheet({
  subscription,
  today,
  visible,
  onClose,
}: {
  subscription: Subscription;
  today: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const record = useRecordPayment(subscription.id);
  const remaining = subscription.remainingCents || subscription.amountCents;
  const [mode, setMode] = useState<'full' | 'partial'>('full');
  const [amount, setAmount] = useState(centsToInput(remaining));
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<PaymentMethod>(subscription.defaultPaymentMethod ?? 'BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cents = parseUSDInput(amount);
  const left = cents !== null ? remaining - cents : null;

  const confirm = async () => {
    setError(null);
    if (cents === null || cents <= 0) return setError('Enter the amount you paid, in US dollars');
    try {
      const res = await record.mutateAsync({
        amountCents: mode === 'full' ? undefined : cents,
        paidOn,
        method,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
      router.push({
        pathname: '/subscriptions/[id]/success',
        params: {
          id: subscription.id,
          name: subscription.name,
          amount: formatUSD(res.payment.amountCents),
          company: subscription.company.name,
          paidOn: res.payment.paidOn,
          next: res.subscription.status === 'COMPLETED' ? '' : res.subscription.nextDueDate,
          completed: res.cycleCompleted ? '1' : '0',
        },
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record the payment');
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Record payment"
      eyebrow={subscription.name}
    >
      <Segmented
        accessibilityLabel="Payment type"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setAmount(m === 'full' ? centsToInput(remaining) : '');
        }}
        options={[
          { value: 'full', label: 'Full payment' },
          { value: 'partial', label: 'Partial payment' },
        ]}
      />
      <View style={{ alignItems: 'center', gap: 6, paddingVertical: 6 }}>
        <Text variant="small" tone="muted">
          Amount paid
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text variant="title">$</Text>
          <TextInput
            accessibilityLabel="Amount paid in US dollars"
            value={amount}
            editable={mode === 'partial'}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.placeholder}
            style={[typography.amountXL, { minWidth: 120, textAlign: 'center', color: colors.ink }]}
          />
          <Text variant="small" tone="muted">
            USD
          </Text>
        </View>
        {mode === 'partial' && left !== null && left > 0 ? (
          <Text variant="smallStrong" color={colors.purple}>
            {formatUSD(left)} will remain outstanding
          </Text>
        ) : null}
      </View>
      <FormMessage message={error} />
      <DateField label="Date paid" today={today} quickPicks={false} value={paidOn} maximumDate={today} onChange={setPaidOn} />
      <Select label="Method" value={method} options={METHODS} onChange={setMethod} />
      <Input
        label="Transaction reference"
        placeholder="e.g. TXN-482913"
        value={reference}
        onChangeText={setReference}
        autoCapitalize="characters"
      />
      <Input
        label="Notes"
        placeholder="Optional note..."
        multiline
        value={notes}
        onChangeText={setNotes}
      />
      <Button full size="lg" loading={record.isPending} onPress={() => void confirm()}>
        Confirm payment
      </Button>
    </BottomSheet>
  );
}
