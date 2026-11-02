import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Camera, FileText, Upload, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import {
  BottomSheet,
  Button,
  DatePickerField,
  FormMessage,
  Input,
  Segmented,
  Select,
  Text,
  toast,
} from '@/components/ui';
import { ApiError } from '@/api';
import { formatMoney, minorToInput, parseMoneyInput, currencySymbol } from '@/lib/money';
import { radius, typography, useTheme } from '@/theme';

import {
  METHOD_LABELS,
  uploadAttachment,
  useRecordPayment,
  type Obligation,
  type PaymentMethod,
  type UploadableFile,
} from './api';

const METHODS = (Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => ({
  value: m,
  label: METHOD_LABELS[m],
}));

export function RecordPaymentSheet({
  obligation,
  today,
  visible,
  onClose,
}: {
  obligation: Obligation;
  today: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const record = useRecordPayment(obligation.id);
  const remaining = obligation.remainingMinor || obligation.amountMinor;
  const [mode, setMode] = useState<'full' | 'partial'>('full');
  const [amount, setAmount] = useState(minorToInput(remaining, obligation.currency));
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [receipt, setReceipt] = useState<UploadableFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const minor = parseMoneyInput(amount, obligation.currency);
  const left = minor !== null ? remaining - minor : null;

  const pickDocument = async () => {
    const r = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (!r.canceled && r.assets[0])
      setReceipt({
        uri: r.assets[0].uri,
        name: r.assets[0].name,
        mimeType: r.assets[0].mimeType ?? 'application/pdf',
      });
  };
  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return toast.info('Camera access is off', 'Choose a file instead.');
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!r.canceled && r.assets[0])
      setReceipt({
        uri: r.assets[0].uri,
        name: r.assets[0].fileName ?? 'receipt.jpg',
        mimeType: r.assets[0].mimeType ?? 'image/jpeg',
      });
  };

  const confirm = async () => {
    setError(null);
    if (minor === null || minor <= 0) return setError('Enter the amount you paid');
    try {
      const res = await record.mutateAsync({
        amountMinor: mode === 'full' ? undefined : minor,
        paidOn,
        method,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
      });
      if (receipt) {
        await uploadAttachment({ paymentId: res.payment.id }, receipt).catch(() =>
          toast.error(
            'Payment saved, receipt didn’t upload',
            'You can add it later from the payment.',
          ),
        );
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
      router.push({
        pathname: '/payments/[id]/success',
        params: {
          id: obligation.id,
          name: obligation.name,
          amount: formatMoney(res.payment.amountMinor, res.payment.currency, {
            forceDecimals: true,
          }),
          paidOn: res.payment.paidOn,
          next: res.obligation.status === 'COMPLETED' ? '' : res.obligation.nextDueDate,
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
      eyebrow={obligation.name}
    >
      <Segmented
        accessibilityLabel="Payment type"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setAmount(m === 'full' ? minorToInput(remaining, obligation.currency) : '');
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
          <Text variant="title">{currencySymbol(obligation.currency) ?? ''}</Text>
          <TextInput
            accessibilityLabel={`Amount paid in ${obligation.currency}`}
            value={amount}
            editable={mode === 'partial'}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.placeholder}
            style={[typography.amountXL, { minWidth: 120, textAlign: 'center', color: colors.ink }]}
          />
          <Text variant="small" tone="muted">
            {obligation.currency}
          </Text>
        </View>
        {mode === 'partial' && left !== null && left > 0 ? (
          <Text variant="smallStrong" color={colors.purple}>
            {formatMoney(left, obligation.currency, { forceDecimals: true })} will remain
            outstanding
          </Text>
        ) : null}
      </View>
      <FormMessage message={error} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <DatePickerField
          label="Payment date"
          value={paidOn}
          maximumDate={today}
          onChange={setPaidOn}
        />
        <Select label="Method" value={method} options={METHODS} onChange={setMethod} />
      </View>
      <Input
        label="Transaction reference"
        placeholder="e.g. TXN-482913"
        value={reference}
        onChangeText={setReference}
        autoCapitalize="characters"
      />
      {receipt ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            padding: 12,
            borderRadius: radius.md,
            backgroundColor: colors.primarySoft,
          }}
        >
          <FileText size={20} color={colors.primaryStrong} />
          <Text variant="small" style={{ flex: 1 }} numberOfLines={1}>
            {receipt.name}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove receipt"
            hitSlop={12}
            onPress={() => setReceipt(null)}
          >
            <X size={18} color={colors.muted} />
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void pickDocument()}
            style={{
              flex: 1,
              minHeight: 60,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 12,
              borderRadius: radius.input,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: colors.primaryStrong,
              backgroundColor: colors.primarySoft,
            }}
          >
            <Upload size={20} color={colors.primaryStrong} />
            <View>
              <Text variant="smallStrong" tone="primary">
                Upload receipt
              </Text>
              <Text variant="caption" tone="muted">
                PDF, PNG or JPG
              </Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Take a photo of the receipt"
            onPress={() => void takePhoto()}
            style={{
              width: 60,
              minHeight: 60,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.input,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: colors.primaryStrong,
              backgroundColor: colors.primarySoft,
            }}
          >
            <Camera size={22} color={colors.primaryStrong} />
          </Pressable>
        </View>
      )}
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
