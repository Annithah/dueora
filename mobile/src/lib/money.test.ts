import { formatMoney, minorToInput, minorUnits, parseMoneyInput } from './money';

describe('formatMoney', () => {
  it.each([
    [152300, 'USD', '$1,523'],
    [152350, 'USD', '$1,523.50'],
    [13200, 'USD', '$132'],
    [18880, 'RWF', '18,880 RWF'],
    [4000, 'EUR', '€40'],
    [0, 'USD', '$0'],
    [-24000, 'USD', '-$240'],
    [1234567, 'KWD', '1,234.567 KWD'],
    [500, 'KES', '5 KES'],
  ])('%i %s → %s', (minor, currency, expected) => {
    expect(formatMoney(minor, currency)).toBe(expected);
  });

  it('forces decimals when asked', () => {
    expect(formatMoney(24000, 'USD', { forceDecimals: true })).toBe('$240.00');
    expect(formatMoney(18880, 'RWF', { forceDecimals: true })).toBe('18,880 RWF');
  });

  it('compacts large values', () => {
    expect(formatMoney(1_240_000, 'RWF', { compact: true })).toBe('1.2M RWF');
    expect(formatMoney(1_284_000, 'USD', { compact: true })).toBe('$12.8K');
    expect(formatMoney(152300, 'USD', { compact: true })).toBe('$1,523');
  });

  it('can omit the currency', () => {
    expect(formatMoney(1888000, 'RWF', { bare: true })).toBe('1,888,000');
  });

  it('rejects non-integer minor units', () => {
    expect(() => formatMoney(1.5, 'USD')).toThrow();
  });
});

describe('parseMoneyInput', () => {
  it.each([
    ['240', 'USD', 24000],
    ['240.5', 'USD', 24050],
    ['1,523.99', 'USD', 152399],
    ['18 880', 'RWF', 18880],
    ['0.1', 'USD', 10],
    ['.5', 'USD', null],
    ['12.345', 'USD', null],
    ['18880.5', 'RWF', null],
    ['abc', 'USD', null],
    ['', 'USD', null],
  ])('%s %s → %s', (input, currency, expected) => {
    expect(parseMoneyInput(input, currency)).toBe(expected);
  });

  it('round-trips with minorToInput', () => {
    expect(minorToInput(24000, 'USD')).toBe('240.00');
    expect(parseMoneyInput(minorToInput(152399, 'USD'), 'USD')).toBe(152399);
    expect(minorToInput(18880, 'RWF')).toBe('18880');
  });

  it('knows minor units', () => {
    expect(minorUnits('rwf')).toBe(0);
    expect(minorUnits('USD')).toBe(2);
  });
});
