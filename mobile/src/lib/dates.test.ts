import {
  daysUntil,
  formatDate,
  formatShortDay,
  greetingFor,
  humanSpan,
  parseISODate,
  relativeDays,
  toISODate,
} from './dates';

describe('dates', () => {
  it('parses ISO dates as local calendar dates', () => {
    const d = parseISODate('2027-10-02');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2027, 9, 2]);
    expect(toISODate(d)).toBe('2027-10-02');
  });

  it('rejects invalid dates', () => {
    expect(() => parseISODate('2027-02-30')).toThrow();
    expect(() => parseISODate('nope')).toThrow();
  });

  it('formats like the prototype', () => {
    expect(formatDate('2027-10-02')).toBe('02 Oct 2027');
    expect(formatShortDay('2026-10-20')).toBe('Tue, 20 Oct');
  });

  it('counts calendar days', () => {
    expect(daysUntil('2026-11-05', '2026-11-02')).toBe(3);
    expect(daysUntil('2026-10-20', '2026-11-02')).toBe(-13);
    expect(daysUntil('2028-03-01', '2028-02-28')).toBe(2); // leap year
  });

  it.each([
    [0, 'today'],
    [1, 'tomorrow'],
    [-1, 'yesterday'],
    [5, 'in 5 days'],
    [-8, '8 days ago'],
  ])('relativeDays(%i) → %s', (n, expected) => {
    expect(relativeDays(n)).toBe(expected);
  });

  it('describes spans in months and days', () => {
    expect(humanSpan('2026-01-30', '2026-10-20')).toBe('8 months, 20 days');
    expect(humanSpan('2026-10-20', '2026-10-21')).toBe('1 day');
    expect(humanSpan('2026-10-20', '2026-10-20')).toBe('0 days');
    expect(humanSpan('2026-01-15', '2026-03-15')).toBe('2 months');
  });

  it.each([
    [6, 'Good morning'],
    [12, 'Good afternoon'],
    [20, 'Good evening'],
  ])('greetingFor(%i) → %s', (h, g) => {
    expect(greetingFor(h)).toBe(g);
  });
});
