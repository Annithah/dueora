import { monthGrid, rangeFor, shift, titleFor } from './calendarMath';

describe('calendar maths', () => {
  it('builds Monday-first month grids with whole weeks', () => {
    const grid = monthGrid('2026-10-14');
    expect(grid[0]![0]).toBe('2026-09-28'); // Monday before 1 Oct (a Thursday)
    expect(grid.at(-1)!.at(-1)).toBe('2026-11-01');
    expect(grid.every((row) => row.length === 7)).toBe(true);
  });

  it('computes ranges for each view', () => {
    expect(rangeFor('day', '2026-11-04')).toEqual({ from: '2026-11-04', to: '2026-11-04' });
    expect(rangeFor('week', '2026-11-04')).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    expect(rangeFor('year', '2026-11-04')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('moves by view and handles month ends', () => {
    expect(shift('month', '2027-01-31', 1)).toBe('2027-02-01');
    expect(shift('week', '2026-12-28', 1)).toBe('2027-01-04');
    expect(shift('year', '2026-06-15', -1)).toBe('2025-01-01');
    expect(titleFor('month', '2026-10-01')).toBe('October 2026');
  });
});
