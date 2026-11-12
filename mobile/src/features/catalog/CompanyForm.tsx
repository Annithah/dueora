import { Building2, Clock, Plus, Wallet } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Chip, Input, Select, Text } from '@/components/ui';
import { hourLabel, isChoiceSelected, REMINDER_CHOICES, toggleChoice } from '@/features/notifications/reminderOptions';
import { centsToInput, parseUSDInput } from '@/lib/money';
import { useTheme } from '@/theme';

import type { Company, CompanyFields } from './api';

export const COMPANY_COLORS = ['#0F5C5C', '#3B82F6', '#7C3AED', '#F2A33A', '#22A06B', '#EA580C', '#BE185D', '#475569'];

const DEFAULT_HOUR = 'default';
const HOURS = [
  { value: DEFAULT_HOUR, label: 'Workspace default' },
  ...Array.from({ length: 15 }, (_, i) => i + 6).map((h) => ({ value: String(h), label: hourLabel(h) })),
];

/** "Alpha News Ltd" → "AN" (same rule as the server). */
export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length >= 2 ? words[0]![0]! + words[1]![0]! : (words[0] ?? '').slice(0, 2);
  return letters.toUpperCase();
}

/**
 * Create or edit a company: name, initials, colour, description, its own reminder defaults
 * and an optional monthly budget. Empty optional fields fall back to the workspace settings.
 */
export function CompanyForm({
  initial,
  submitLabel,
  loading,
  onSubmit,
}: {
  initial?: Company;
  submitLabel: string;
  loading?: boolean;
  onSubmit: (fields: CompanyFields) => void;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState(initial?.name ?? '');
  const [shortName, setShortName] = useState(initial?.shortName ?? '');
  const [color, setColor] = useState(initial?.color ?? COMPANY_COLORS[0]!);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [offsets, setOffsets] = useState<number[] | null>(initial?.reminderOffsets ?? null);
  const [hour, setHour] = useState(initial?.reminderHour != null ? String(initial.reminderHour) : DEFAULT_HOUR);
  const [budget, setBudget] = useState(initial?.monthlyBudgetCents != null ? centsToInput(initial.monthlyBudgetCents) : '');

  const budgetCents = budget.trim() ? parseUSDInput(budget) : null;
  const budgetError = budget.trim() && budgetCents === null ? 'Enter an amount like 250 or 1,200.50' : undefined;
  const valid = !!name.trim() && !budgetError;

  const submit = () =>
    onSubmit({
      name: name.trim(),
      shortName: shortName.trim() ? shortName.trim().toUpperCase().slice(0, 4) : null,
      color,
      description: description.trim() || null,
      reminderOffsets: offsets && offsets.length ? offsets : null,
      reminderHour: hour === DEFAULT_HOUR ? null : Number(hour),
      monthlyBudgetCents: budgetCents,
    });

  return (
    <View style={{ gap: 14 }}>
      <Input label="Company name" value={name} onChangeText={setName} icon={<Building2 size={18} color={colors.muted} />} autoFocus={!initial} />
      <Input
        label="Short name (initials)"
        value={shortName}
        onChangeText={(v) => setShortName(v.slice(0, 4))}
        autoCapitalize="characters"
        placeholder={initialsFor(name) || 'AN'}
        hint="Shown on chips and avatars. Leave empty to use the initials."
      />
      <Text variant="label">Colour</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {COMPANY_COLORS.map((c) => (
          <Pressable
            key={c}
            accessibilityRole="radio"
            accessibilityLabel={`Colour ${c}`}
            accessibilityState={{ checked: color === c }}
            onPress={() => setColor(c)}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: colors.ink }}
          />
        ))}
      </View>
      <Input label="Description (optional)" value={description} onChangeText={setDescription} multiline maxLength={500} />

      <Text variant="label">Reminders for this company’s new bills</Text>
      <Text variant="small" tone="muted">
        {offsets?.length ? 'New bills in this company start with these.' : 'None picked: the workspace defaults are used.'}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {REMINDER_CHOICES.map((c) => (
          <Chip
            key={c.label}
            label={c.label}
            showCheck
            selected={isChoiceSelected(offsets ?? [], c)}
            onPress={() => setOffsets(toggleChoice(offsets ?? [], c))}
          />
        ))}
      </View>
      <Select label="Reminder time" value={hour} options={HOURS} onChange={setHour} icon={<Clock size={18} color={colors.muted} />} />
      <Input
        label="Monthly budget (USD, optional)"
        value={budget}
        onChangeText={setBudget}
        keyboardType="decimal-pad"
        icon={<Wallet size={18} color={colors.muted} />}
        error={budgetError}
      />
      <Button full icon={!initial ? <Plus size={18} color={colors.onPrimary} /> : undefined} disabled={!valid} loading={loading} onPress={submit}>
        {submitLabel}
      </Button>
    </View>
  );
}
