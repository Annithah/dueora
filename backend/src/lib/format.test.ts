import { describe, expect, it } from 'vitest';

import { formatLongDate, formatMoney, formatShortDay, plural } from './format.js';

describe('format', () => {
  it.each([
    [152300, 'USD', '$1,523'],
    [152350, 'usd', '$1,523.50'],
    [18880, 'RWF', '18,880 RWF'],
    [4000, 'EUR', '€40'],
    [-500, 'GBP', '-£5'],
    [1234567, 'KWD', '1,234.567 KWD'],
  ])('formatMoney(%i, %s) → %s', (minor, cur, out) => {
    expect(formatMoney(minor, cur)).toBe(out);
  });

  it('formats dates like the prototype', () => {
    expect(formatShortDay('2026-10-20')).toBe('Tue, 20 Oct');
    expect(formatLongDate('2028-10-02')).toBe('02 Oct 2028');
    expect(formatShortDay('2028-02-29')).toBe('Tue, 29 Feb');
  });

  it('pluralises', () => {
    expect(plural(1, 'day')).toBe('1 day');
    expect(plural(3, 'day')).toBe('3 days');
  });
});
