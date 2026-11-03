import { centsToInput, formatUSD, parseUSDInput } from './money';

describe('formatUSD', () => {
  it.each([
    [152_300, '$1,523.00'],
    [152_350, '$1,523.50'],
    [1_300, '$13.00'],
    [5, '$0.05'],
    [0, '$0.00'],
    [-24_000, '-$240.00'],
    [123_456_789, '$1,234,567.89'],
  ])('%i → %s', (cents, expected) => {
    expect(formatUSD(cents)).toBe(expected);
  });

  it('compacts large values and can trim zero cents', () => {
    expect(formatUSD(1_250_000, { compact: true })).toBe('$12.5K');
    expect(formatUSD(950_000, { compact: true })).toBe('$9,500.00');
    expect(formatUSD(240_000_000, { compact: true })).toBe('$2.4M');
    expect(formatUSD(24_000, { trimZeroCents: true })).toBe('$240');
    expect(formatUSD(24_050, { trimZeroCents: true })).toBe('$240.50');
    expect(formatUSD(24_000, { bare: true })).toBe('240.00');
  });

  it('refuses floats', () => {
    expect(() => formatUSD(10.5)).toThrow();
  });
});

describe('parseUSDInput', () => {
  it.each([
    ['1,523.50', 152_350],
    ['$ 1 523', 152_300],
    ['0.1', 10],
    ['240', 24_000],
    ['13.', 1_300],
  ])('%s → %i', (input, cents) => {
    expect(parseUSDInput(input)).toBe(cents);
  });

  it.each(['', 'abc', '12.345', '-5', '1.2.3'])('rejects %s', (input) => {
    expect(parseUSDInput(input)).toBeNull();
  });

  it('avoids float errors (0.1 + 0.2)', () => {
    expect((parseUSDInput('0.1') ?? 0) + (parseUSDInput('0.2') ?? 0)).toBe(30);
  });

  it('round-trips for inputs', () => {
    expect(centsToInput(152_350)).toBe('1523.50');
    expect(parseUSDInput(centsToInput(99))).toBe(99);
  });
});
