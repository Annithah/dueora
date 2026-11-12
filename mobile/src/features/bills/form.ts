import { z } from 'zod';

import { centsToInput, parseUSDInput } from '@/lib/money';
import { calculateNextDueDate } from '@/lib/schedule';

import type { FrequencyUnit, PaymentMethod, Bill, BillInput } from './api';

/** Frequency presets shown as chips. "Custom" exposes unit + interval. */
export const FREQUENCIES = [
  { key: 'weekly', label: 'Weekly', unit: 'WEEK', interval: 1 },
  { key: 'biweekly', label: 'Every 2 weeks', unit: 'WEEK', interval: 2 },
  { key: 'monthly', label: 'Monthly', unit: 'MONTH', interval: 1 },
  { key: 'bimonthly', label: 'Every 2 months', unit: 'MONTH', interval: 2 },
  { key: 'quarterly', label: 'Quarterly', unit: 'MONTH', interval: 3 },
  { key: 'semiannual', label: 'Every 6 months', unit: 'MONTH', interval: 6 },
  { key: 'yearly', label: 'Yearly', unit: 'YEAR', interval: 1 },
  { key: 'custom', label: 'Custom', unit: 'MONTH', interval: 4 },
  { key: 'once', label: 'One-time', unit: 'ONCE', interval: 1 },
] as const satisfies readonly { key: string; label: string; unit: FrequencyUnit; interval: number }[];

export type FrequencyKey = (typeof FREQUENCIES)[number]['key'];

export function frequencyKeyFor(unit: FrequencyUnit, interval: number): FrequencyKey {
  return FREQUENCIES.find((f) => f.key !== 'custom' && f.unit === unit && f.interval === interval)?.key ?? 'custom';
}

export const formSchema = z
  .object({
    name: z.string().trim().min(1, 'What is this bill for?').max(120),
    companyId: z.string().min(1, 'Choose a company'),
    categoryId: z.string().min(1, 'Choose a category'),
    provider: z.string().trim().max(120),
    /** Typed key. When editing, blank means "keep the stored key". */
    accountReference: z.string().trim().max(500),
    removeKey: z.boolean(),
    amount: z.string().trim().min(1, 'Enter the amount'),
    frequency: z.enum(FREQUENCIES.map((f) => f.key) as [FrequencyKey, ...FrequencyKey[]]),
    customUnit: z.enum(['WEEK', 'MONTH', 'YEAR']),
    customInterval: z.coerce.number().int().min(1, 'At least 1').max(120),
    startDate: z.string().min(1, 'Pick a start date'),
    nextDueDate: z.string().min(1, 'Pick the next due date'),
    /** True once the user picks the next due date themselves (stops auto-calculation). */
    nextDueManual: z.boolean(),
    reminderOffsets: z.array(z.number().int()),
    description: z.string().max(2000),
    autoRenew: z.boolean(),
    isTrial: z.boolean(),
    trialEndsOn: z.string(),
    defaultPaymentMethod: z.enum(['', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CARD', 'CASH', 'OTHER']),
    /** FIXED, or VARIABLE (the amount is an estimate). */
    amountType: z.enum(['FIXED', 'VARIABLE']),
    /** { [customFieldId]: typed text } — checked by the server against the company's fields. */
    customValues: z.record(z.string(), z.string()),
  })
  .superRefine((v, ctx) => {
    if (v.isTrial && !v.trialEndsOn) ctx.addIssue({ code: 'custom', path: ['trialEndsOn'], message: 'When does the free trial end?' });
    const cents = parseUSDInput(v.amount);
    if (cents === null || cents <= 0) ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Enter an amount in US dollars, e.g. 49.99' });
    if (v.nextDueDate < v.startDate) {
      ctx.addIssue({ code: 'custom', path: ['nextDueDate'], message: 'Must be on or after the start date' });
    }
  });

export type FormValues = z.input<typeof formSchema>;

export function scheduleOf(v: Pick<FormValues, 'frequency' | 'customUnit' | 'customInterval'>): { unit: FrequencyUnit; interval: number } {
  const preset = FREQUENCIES.find((f) => f.key === v.frequency)!;
  if (v.frequency !== 'custom') return { unit: preset.unit, interval: preset.interval };
  return { unit: v.customUnit, interval: Math.max(1, Number(v.customInterval) || 1) };
}

/** The next due date the server will calculate for these values (shown live in the form). */
export function autoNextDueDate(v: Pick<FormValues, 'frequency' | 'customUnit' | 'customInterval' | 'startDate'>, today: string): string {
  const { unit, interval } = scheduleOf(v);
  return calculateNextDueDate(v.startDate, unit, interval, Number(v.startDate.slice(8, 10)), today);
}

export function defaultsFrom(
  s: Bill | undefined,
  fallback: { offsets: number[]; today: string; companyId?: string },
): FormValues {
  if (!s) {
    return {
      name: '',
      companyId: fallback.companyId ?? '',
      categoryId: '',
      provider: '',
      accountReference: '',
      removeKey: false,
      amount: '',
      frequency: 'monthly',
      customUnit: 'MONTH',
      customInterval: 4,
      startDate: fallback.today,
      nextDueDate: fallback.today,
      nextDueManual: false,
      reminderOffsets: fallback.offsets,
      description: '',
      autoRenew: false,
      isTrial: false,
      trialEndsOn: '',
      defaultPaymentMethod: '',
      amountType: 'FIXED',
      customValues: {},
    };
  }
  return {
    name: s.name,
    companyId: s.company.id,
    categoryId: s.category.id,
    provider: s.provider ?? '',
    accountReference: '',
    removeKey: false,
    amount: centsToInput(s.amountCents),
    frequency: frequencyKeyFor(s.frequencyUnit, s.frequencyInterval),
    customUnit: s.frequencyUnit === 'ONCE' ? 'MONTH' : s.frequencyUnit,
    customInterval: s.frequencyInterval,
    startDate: s.startDate,
    nextDueDate: s.nextDueDate,
    // An existing bill's due date reflects recorded payments: keep it unless the user changes it.
    nextDueManual: true,
    reminderOffsets: s.reminderOffsets,
    description: s.description ?? '',
    autoRenew: s.autoRenew,
    isTrial: s.isTrial,
    trialEndsOn: s.trialEndsOn ?? '',
    defaultPaymentMethod: s.defaultPaymentMethod ?? '',
    amountType: s.amountType ?? 'FIXED',
    customValues: Object.fromEntries(Object.entries(s.customValues ?? {}).map(([k, v]) => [k, String(v)])),
  };
}

export function toInput(v: FormValues, existing?: Bill): BillInput {
  const { unit, interval } = scheduleOf(v);
  const key = v.accountReference.trim();
  const input: BillInput = {
    name: v.name.trim(),
    companyId: v.companyId,
    categoryId: v.categoryId,
    provider: v.provider.trim() || null,
    description: v.description.trim() || null,
    amountCents: parseUSDInput(v.amount)!,
    frequencyUnit: unit,
    frequencyInterval: interval,
    startDate: v.startDate,
    reminderOffsets: v.reminderOffsets,
    autoRenew: v.autoRenew,
    isTrial: v.isTrial,
    trialEndsOn: v.isTrial ? v.trialEndsOn : null,
    defaultPaymentMethod: (v.defaultPaymentMethod || null) as PaymentMethod | null,
    amountType: v.amountType,
    customValues: Object.fromEntries(Object.entries(v.customValues).map(([k, val]) => [k, val.trim() || null])),
  };
  // New: always send the date shown. Edit: only when changed, so the server can re-derive it.
  if (!existing || v.nextDueDate !== existing.nextDueDate) input.nextDueDate = v.nextDueDate;
  if (key) input.accountReference = key;
  else if (existing && v.removeKey) input.accountReference = null;
  return input;
}
