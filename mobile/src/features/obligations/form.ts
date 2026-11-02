import { z } from 'zod';

import { minorToInput, parseMoneyInput } from '@/lib/money';

import type { FrequencyUnit, Obligation, ObligationInput } from './api';

/** Frequency presets shown as chips. "Custom" exposes unit + interval. */
export const FREQUENCIES = [
  { key: 'weekly', label: 'Weekly', unit: 'WEEK', interval: 1 },
  { key: 'monthly', label: 'Monthly', unit: 'MONTH', interval: 1 },
  { key: 'quarterly', label: 'Quarterly', unit: 'MONTH', interval: 3 },
  { key: 'semiannual', label: 'Every 6 months', unit: 'MONTH', interval: 6 },
  { key: 'yearly', label: 'Yearly', unit: 'YEAR', interval: 1 },
  { key: 'custom', label: 'Custom', unit: 'MONTH', interval: 2 },
  { key: 'once', label: 'One-time', unit: 'ONCE', interval: 1 },
] as const satisfies readonly {
  key: string;
  label: string;
  unit: FrequencyUnit;
  interval: number;
}[];

export type FrequencyKey = (typeof FREQUENCIES)[number]['key'];

export function frequencyKeyFor(unit: FrequencyUnit, interval: number): FrequencyKey {
  return (
    FREQUENCIES.find((f) => f.key !== 'custom' && f.unit === unit && f.interval === interval)
      ?.key ?? 'custom'
  );
}

export const formSchema = z
  .object({
    name: z.string().trim().min(1, 'What are you paying for?').max(120),
    provider: z.string().trim().min(1, 'Who do you pay?').max(120),
    platformId: z.string().nullable(),
    categoryId: z.string().min(1, 'Choose a category'),
    amount: z.string().trim().min(1, 'Enter the amount'),
    currency: z.string().length(3),
    frequency: z.enum(FREQUENCIES.map((f) => f.key) as [FrequencyKey, ...FrequencyKey[]]),
    customUnit: z.enum(['WEEK', 'MONTH', 'YEAR']),
    customInterval: z.coerce.number().int().min(1, 'At least 1').max(120),
    startDate: z.string().min(1, 'Pick a start date'),
    nextDueDate: z.string().min(1, 'Pick the next due date'),
    reminderOffsets: z.array(z.number().int()),
    assigneeUserId: z.string().nullable(),
    departmentId: z.string().nullable(),
    description: z.string().max(2000),
  })
  .superRefine((v, ctx) => {
    const minor = parseMoneyInput(v.amount, v.currency);
    if (minor === null || minor <= 0)
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Enter a valid amount' });
    if (v.nextDueDate < v.startDate)
      ctx.addIssue({
        code: 'custom',
        path: ['nextDueDate'],
        message: 'Must be on or after the start date',
      });
  });

export type FormValues = z.input<typeof formSchema>;

export function defaultsFrom(
  o: Obligation | undefined,
  fallback: { currency: string; offsets: number[]; today: string; userId?: string },
): FormValues {
  if (!o) {
    return {
      name: '',
      provider: '',
      platformId: null,
      categoryId: '',
      amount: '',
      currency: fallback.currency,
      frequency: 'monthly',
      customUnit: 'MONTH',
      customInterval: 2,
      startDate: fallback.today,
      nextDueDate: fallback.today,
      reminderOffsets: fallback.offsets,
      assigneeUserId: fallback.userId ?? null,
      departmentId: null,
      description: '',
    };
  }
  const key = frequencyKeyFor(o.frequencyUnit, o.frequencyInterval);
  return {
    name: o.name,
    provider: o.provider,
    platformId: o.platform?.id ?? null,
    categoryId: o.category.id,
    amount: minorToInput(o.amountMinor, o.currency),
    currency: o.currency,
    frequency: key,
    customUnit: o.frequencyUnit === 'ONCE' ? 'MONTH' : o.frequencyUnit,
    customInterval: o.frequencyInterval,
    startDate: o.startDate,
    nextDueDate: o.nextDueDate,
    reminderOffsets: o.reminderOffsets,
    assigneeUserId: o.assignee?.id ?? null,
    departmentId: o.department?.id ?? null,
    description: o.description ?? '',
  };
}

/** Suggest a friendly icon from the name (domain → globe, hosting → cloud, ...). */
export function suggestIcon(name: string): string | null {
  const n = name.toLowerCase();
  if (/domain/.test(n)) return 'globe';
  if (/host|server|cloud|aws|vps/.test(n)) return 'cloud';
  if (/internet|wifi|fib|broadband/.test(n)) return 'wifi';
  if (/rent|lease|office space/.test(n)) return 'house';
  if (/insur/.test(n)) return 'shield';
  if (/electric|water|power|utility/.test(n)) return 'bulb';
  if (/subscription|premium|clean/.test(n)) return 'sparkles';
  return null;
}

export function toInput(v: FormValues): ObligationInput {
  const preset = FREQUENCIES.find((f) => f.key === v.frequency)!;
  const unit: FrequencyUnit = v.frequency === 'custom' ? v.customUnit : preset.unit;
  const interval = v.frequency === 'custom' ? Number(v.customInterval) : preset.interval;
  return {
    name: v.name.trim(),
    provider: v.provider.trim(),
    description: v.description.trim() || null,
    icon: suggestIcon(v.name),
    amountMinor: parseMoneyInput(v.amount, v.currency)!,
    currency: v.currency,
    frequencyUnit: unit,
    frequencyInterval: interval,
    startDate: v.startDate,
    nextDueDate: v.nextDueDate,
    reminderOffsets: v.reminderOffsets,
    platformId: v.platformId,
    categoryId: v.categoryId,
    departmentId: v.departmentId,
    assigneeUserId: v.assigneeUserId,
  };
}
