import { addDaysISO, addMonthsISO, advance, calculateNextDueDate, DATE_QUICK_PICKS } from './schedule';

describe('client schedule mirror', () => {
  it('adds days and months with month-end anchors', () => {
    expect(addDaysISO('2026-12-30', 3)).toBe('2027-01-02');
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsISO('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsISO('2026-02-28', 1, 31)).toBe('2026-03-31');
  });

  it('advances one cycle', () => {
    expect(advance('2026-11-05', 'WEEK', 2, 5)).toBe('2026-11-19');
    expect(advance('2026-11-30', 'MONTH', 1, 31)).toBe('2026-12-31');
    expect(advance('2028-02-29', 'YEAR', 1, 29)).toBe('2029-02-28');
    expect(advance('2026-11-05', 'ONCE', 1, 5)).toBeNull();
  });

  it('matches the backend for new bills', () => {
    const today = '2026-11-03';
    expect(calculateNextDueDate('2026-11-03', 'MONTH', 1, 3, today)).toBe('2026-11-03');
    expect(calculateNextDueDate('2026-01-15', 'MONTH', 1, 15, today)).toBe('2026-11-15');
    expect(calculateNextDueDate('2026-01-31', 'MONTH', 3, 31, today)).toBe('2027-01-31');
    expect(calculateNextDueDate('2024-02-29', 'YEAR', 1, 29, today)).toBe('2027-02-28');
    expect(calculateNextDueDate('2026-10-07', 'WEEK', 1, 7, today)).toBe('2026-11-04');
    expect(calculateNextDueDate('2026-10-01', 'ONCE', 1, 1, today)).toBe('2026-10-01');
  });

  it('offers the five quick picks relative to today', () => {
    expect(DATE_QUICK_PICKS.map((p) => [p.label, p.apply('2026-01-31')])).toEqual([
      ['Today', '2026-01-31'],
      ['+1 week', '2026-02-07'],
      ['+1 month', '2026-02-28'],
      ['+3 months', '2026-04-30'],
      ['+1 year', '2027-01-31'],
    ]);
  });
});
