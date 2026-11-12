import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, CategoryIcon, Chip, Input, Segmented, Select, Text } from '@/components/ui';
import { isChoiceSelected, REMINDER_CHOICES, toggleChoice } from '@/features/notifications/reminderOptions';
import { CATEGORY_ICON_KEYS, categoryVisual, radius, useTheme } from '@/theme';

import type { AmountTypeValue, Category, CategoryFields, FrequencyUnitValue, PaymentMethodValue } from './api';

const NONE = 'none';
const FREQUENCIES: { value: string; label: string; unit: FrequencyUnitValue | null; interval: number | null }[] = [
  { value: NONE, label: 'No default', unit: null, interval: null },
  { value: 'WEEK-1', label: 'Weekly', unit: 'WEEK', interval: 1 },
  { value: 'MONTH-1', label: 'Monthly', unit: 'MONTH', interval: 1 },
  { value: 'MONTH-3', label: 'Quarterly', unit: 'MONTH', interval: 3 },
  { value: 'MONTH-6', label: 'Every 6 months', unit: 'MONTH', interval: 6 },
  { value: 'YEAR-1', label: 'Yearly', unit: 'YEAR', interval: 1 },
  { value: 'ONCE-1', label: 'One-time', unit: 'ONCE', interval: 1 },
];
const METHODS: { value: string; label: string }[] = [
  { value: NONE, label: 'No default' },
  { value: 'MOBILE_MONEY', label: 'Mobile money' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CARD', label: 'Card' },
  { value: 'CASH', label: 'Cash' },
  { value: 'OTHER', label: 'Other' },
];

export interface CategorySubmit extends CategoryFields {
  subcategories?: string[];
}

/**
 * Create or edit a category: name, parent (one level of sub-categories), icon, description,
 * sub-categories to create with it, and defaults for new bills.
 */
export function CategoryForm({
  initial,
  parents,
  submitLabel,
  loading,
  compact,
  defaultParentId,
  onSubmit,
}: {
  /** Start as a sub-category of this one. */
  defaultParentId?: string;
  initial?: Category;
  /** Top-level categories of the same company (possible parents). */
  parents: readonly Category[];
  submitLabel: string;
  loading?: boolean;
  /** Inline in the bill form: only the essentials. */
  compact?: boolean;
  onSubmit: (fields: CategorySubmit) => void;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? 'tag');
  const [parentId, setParentId] = useState<string>(initial?.parentId ?? defaultParentId ?? NONE);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [subs, setSubs] = useState('');
  const d = initial?.defaults;
  const [freq, setFreq] = useState(
    FREQUENCIES.find((f) => f.unit === d?.frequencyUnit && f.interval === (d?.frequencyInterval ?? 1))?.value ?? NONE,
  );
  const [amountType, setAmountType] = useState<'none' | AmountTypeValue>(d?.amountType ?? 'none');
  const [method, setMethod] = useState<string>(d?.paymentMethod ?? NONE);
  const [offsets, setOffsets] = useState<number[] | null>(d?.reminderOffsets ?? null);
  const hasChildren = !!initial && parents.some((p) => p.parentId === initial.id);
  const parentOptions = [{ value: NONE, label: 'None (top level)' }, ...parents.filter((p) => p.id !== initial?.id && !p.parentId).map((p) => ({ value: p.id, label: p.name }))];

  const submit = () => {
    const f = FREQUENCIES.find((x) => x.value === freq)!;
    onSubmit({
      name: name.trim(),
      icon,
      color: categoryVisual(icon).fgLight,
      parentId: parentId === NONE ? null : parentId,
      description: description.trim() || null,
      ...(compact
        ? {}
        : {
            defaultFrequencyUnit: f.unit,
            defaultFrequencyInterval: f.interval,
            defaultAmountType: amountType === 'none' ? null : amountType,
            defaultPaymentMethod: method === NONE ? null : (method as PaymentMethodValue),
            defaultReminderOffsets: offsets?.length ? offsets : null,
          }),
      ...(!initial && parentId === NONE
        ? { subcategories: subs.split(',').map((s) => s.trim()).filter(Boolean) }
        : {}),
    });
  };

  return (
    <View style={{ gap: 14 }}>
      <Input label="Name" placeholder="e.g. Utilities" value={name} onChangeText={setName} autoFocus={!initial} />
      {!hasChildren ? <Select label="Parent category" value={parentId} options={parentOptions} onChange={setParentId} /> : null}
      <Text variant="label">Icon</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {CATEGORY_ICON_KEYS.map((k) => (
          <Pressable
            key={k}
            accessibilityRole="radio"
            accessibilityLabel={k}
            accessibilityState={{ checked: icon === k }}
            onPress={() => setIcon(k)}
            style={{ padding: 3, borderRadius: radius.md, borderWidth: 2, borderColor: icon === k ? colors.primaryStrong : 'transparent' }}
          >
            <CategoryIcon icon={k} size={compact ? 34 : 40} />
          </Pressable>
        ))}
      </View>
      {!compact ? (
        <>
          <Input label="Description (optional)" value={description} onChangeText={setDescription} maxLength={300} />
          {!initial && parentId === NONE ? (
            <Input
              label="Sub-categories (optional)"
              placeholder="Electricity, Water"
              value={subs}
              onChangeText={setSubs}
              hint="Separate with commas. One level only."
            />
          ) : null}
          <Text variant="label">Defaults for new bills</Text>
          <Select label="How often" value={freq} options={FREQUENCIES.map(({ value, label }) => ({ value, label }))} onChange={setFreq} />
          <Segmented
            accessibilityLabel="Default amount type"
            value={amountType}
            onChange={setAmountType}
            options={[
              { value: 'none', label: 'No default' },
              { value: 'FIXED', label: 'Fixed' },
              { value: 'VARIABLE', label: 'Variable' },
            ]}
          />
          <Select label="Payment method" value={method} options={METHODS} onChange={setMethod} />
          <Text variant="small" tone="muted">
            Reminders {offsets?.length ? '' : '(none picked: the company or workspace defaults)'}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {REMINDER_CHOICES.map((c) => (
              <Chip key={c.label} label={c.label} showCheck selected={isChoiceSelected(offsets ?? [], c)} onPress={() => setOffsets(toggleChoice(offsets ?? [], c))} />
            ))}
          </View>
        </>
      ) : null}
      <Button full icon={!initial ? <Plus size={18} color={colors.onPrimary} /> : undefined} disabled={!name.trim()} loading={loading} onPress={submit}>
        {submitLabel}
      </Button>
    </View>
  );
}
