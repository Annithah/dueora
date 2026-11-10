import type { Subscription } from './api';
import { autoNextDueDate, defaultsFrom, formSchema, frequencyKeyFor, toInput } from './form';

// Test-only values.
const base = { ...defaultsFrom(undefined, { offsets: [7, 1, 0], today: '2026-11-03' }), name: 'Test', companyId: 'co', categoryId: 'cat' };

describe('subscription form', () => {
  it('starts today with the next due date following it', () => {
    const d = defaultsFrom(undefined, { offsets: [7], today: '2026-11-03' });
    expect(d).toMatchObject({ startDate: '2026-11-03', nextDueDate: '2026-11-03', nextDueManual: false, frequency: 'monthly' });
  });

  it('offers the brief’s frequency presets and maps them both ways', () => {
    expect(frequencyKeyFor('WEEK', 2)).toBe('biweekly');
    expect(frequencyKeyFor('MONTH', 2)).toBe('bimonthly');
    expect(frequencyKeyFor('MONTH', 3)).toBe('quarterly');
    expect(frequencyKeyFor('MONTH', 6)).toBe('semiannual');
    expect(frequencyKeyFor('MONTH', 5)).toBe('custom');
    expect(toInput({ ...base, amount: '1,200', frequency: 'quarterly' })).toMatchObject({
      frequencyUnit: 'MONTH',
      frequencyInterval: 3,
      amountCents: 120_000,
      reminderOffsets: [7, 1, 0],
    });
    expect(toInput({ ...base, amount: '18.88', frequency: 'custom', customUnit: 'WEEK', customInterval: 3 })).toMatchObject({
      frequencyUnit: 'WEEK',
      frequencyInterval: 3,
      amountCents: 1_888,
    });
  });

  it('calculates the next due date from the start date and frequency', () => {
    expect(autoNextDueDate({ ...base, startDate: '2026-01-15', frequency: 'monthly' }, '2026-11-03')).toBe('2026-11-15');
    expect(autoNextDueDate({ ...base, startDate: '2026-11-10', frequency: 'yearly' }, '2026-11-03')).toBe('2026-11-10');
    expect(autoNextDueDate({ ...base, startDate: '2026-10-01', frequency: 'biweekly' }, '2026-11-03')).toBe('2026-11-12');
  });

  it('sends no currency, project or assignee — only USD cents', () => {
    const input = toInput({ ...base, amount: '13', provider: '  ' });
    expect(input).toEqual({
      name: 'Test',
      companyId: 'co',
      categoryId: 'cat',
      provider: null,
      description: null,
      amountCents: 1_300,
      frequencyUnit: 'MONTH',
      frequencyInterval: 1,
      startDate: '2026-11-03',
      nextDueDate: '2026-11-03',
      reminderOffsets: [7, 1, 0],
      autoRenew: false,
      isTrial: false,
      trialEndsOn: null,
      defaultPaymentMethod: null,
    });
  });

  it('sends trial, auto-renew and default payment method, and needs a trial end date', () => {
    expect(toInput({ ...base, amount: '5', isTrial: true, trialEndsOn: '2026-11-20', autoRenew: true, defaultPaymentMethod: 'CARD' })).toMatchObject({
      isTrial: true,
      trialEndsOn: '2026-11-20',
      autoRenew: true,
      defaultPaymentMethod: 'CARD',
    });
    // Turning the trial off clears its date.
    expect(toInput({ ...base, amount: '5', isTrial: false, trialEndsOn: '2026-11-20' }).trialEndsOn).toBeNull();
    const parsed = formSchema.safeParse({ ...base, amount: '5', isTrial: true, trialEndsOn: '' });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.path.join('.'))).toContain('trialEndsOn');
  });

  it('handles the subscription key: set, keep (blank) and remove', () => {
    expect(toInput({ ...base, amount: '1', subscriptionKey: ' LIC-1234 ' }).subscriptionKey).toBe('LIC-1234');
    const existing = { nextDueDate: '2026-12-01', subscriptionKey: { hasKey: true, last4: '1234', masked: '••••••1234' } } as Subscription;
    const values = { ...base, amount: '1', nextDueDate: '2026-12-01' };
    expect(toInput(values, existing)).not.toHaveProperty('subscriptionKey');
    expect(toInput({ ...values, removeKey: true }, existing).subscriptionKey).toBeNull();
    // An unchanged due date is left to the server when editing.
    expect(toInput(values, existing)).not.toHaveProperty('nextDueDate');
  });

  it('validates amount, company, category and dates', () => {
    const bad = formSchema.safeParse({ ...base, companyId: '', categoryId: '', amount: '12.345', nextDueDate: '2026-11-01' });
    expect(bad.success).toBe(false);
    const paths = bad.success ? [] : bad.error.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['amount', 'nextDueDate', 'companyId', 'categoryId']));
    expect(formSchema.safeParse({ ...base, amount: '240' }).success).toBe(true);
  });
});
