import { defaultsFrom, formSchema, frequencyKeyFor, suggestIcon, toInput } from './form';

const base = defaultsFrom(undefined, { currency: 'USD', offsets: [7, 1, 0], today: '2026-11-02' });

describe('obligation form', () => {
  it('maps frequency presets both ways', () => {
    expect(frequencyKeyFor('MONTH', 3)).toBe('quarterly');
    expect(frequencyKeyFor('MONTH', 6)).toBe('semiannual');
    expect(frequencyKeyFor('WEEK', 2)).toBe('custom');
    expect(
      toInput({
        ...base,
        name: 'Rent',
        provider: 'Landlord',
        categoryId: 'c',
        amount: '1,200',
        frequency: 'quarterly',
      }),
    ).toMatchObject({
      frequencyUnit: 'MONTH',
      frequencyInterval: 3,
      amountMinor: 120000,
      reminderOffsets: [7, 1, 0],
    });
    expect(
      toInput({
        ...base,
        name: 'X',
        provider: 'Y',
        categoryId: 'c',
        amount: '18880',
        currency: 'RWF',
        frequency: 'custom',
        customUnit: 'WEEK',
        customInterval: 2,
      }),
    ).toMatchObject({
      frequencyUnit: 'WEEK',
      frequencyInterval: 2,
      amountMinor: 18880,
    });
  });

  it('validates amount and dates', () => {
    const bad = formSchema.safeParse({
      ...base,
      name: 'A',
      provider: 'B',
      categoryId: 'c',
      amount: '12.345',
      nextDueDate: '2026-11-01',
    });
    expect(bad.success).toBe(false);
    const paths = bad.success ? [] : bad.error.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['amount', 'nextDueDate']));
    expect(
      formSchema.safeParse({ ...base, name: 'A', provider: 'B', categoryId: 'c', amount: '240' })
        .success,
    ).toBe(true);
  });

  it('suggests friendly icons', () => {
    expect(suggestIcon('KT Radio domain')).toBe('globe');
    expect(suggestIcon('Hosting')).toBe('cloud');
    expect(suggestIcon('Office rent')).toBe('house');
    expect(suggestIcon('Accountant')).toBeNull();
  });
});
