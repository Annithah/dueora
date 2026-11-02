import { describe, expect, it } from 'vitest';

import {
  addDays,
  addMonths,
  computeStatus,
  cycleLengthDays,
  daysBetween,
  daysInMonth,
  formatDate,
  frequencyLabel,
  isLeapYear,
  localTimeIn,
  mostRecentMissedReminder,
  nextDueDate,
  paidForCycle,
  parseDate,
  previousDueDate,
  reminderDates,
  reminderDueOn,
  reminderSchedule,
  todayIn,
  type FrequencyUnit,
} from './schedule.js';

/** Walk n cycles forward. */
function walk(start: string, unit: FrequencyUnit, interval: number, anchor: number, n: number): string[] {
  const out = [start];
  let cur = start;
  for (let i = 0; i < n; i++) {
    const next = nextDueDate(cur, unit, interval, anchor);
    if (!next) break;
    out.push(next);
    cur = next;
  }
  return out;
}

describe('date primitives', () => {
  it('parses and formats ISO dates', () => {
    expect(parseDate('2027-10-02')).toEqual({ y: 2027, m: 10, d: 2 });
    expect(formatDate({ y: 987, m: 1, d: 5 })).toBe('0987-01-05');
  });

  it.each(['2027-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-1-1', 'nope', '2026-01-00'])(
    'rejects invalid date %s',
    (v) => {
      expect(() => parseDate(v)).toThrow();
    },
  );

  it('knows leap years (Gregorian rules)', () => {
    expect([1900, 2000, 2024, 2026, 2028, 2100].map(isLeapYear)).toEqual([false, true, true, false, true, false]);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('adds days across months, years and leap days', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-10-20', 0)).toBe('2026-10-20');
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-11-02', '2026-11-05')).toBe(3);
    expect(daysBetween('2026-11-02', '2026-10-20')).toBe(-13);
    expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366);
  });

  it('adds months with an anchor day', () => {
    expect(addMonths('2026-01-31', 1, 31)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1, 31)).toBe('2028-02-29');
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15');
    expect(addMonths('2026-03-31', -1, 31)).toBe('2026-02-28');
    expect(addMonths('2026-01-15', -13)).toBe('2024-12-15');
    expect(() => addMonths('2026-01-15', 1, 32)).toThrow();
    expect(() => addMonths('2026-01-15', 1, 0)).toThrow();
  });
});

describe('nextDueDate', () => {
  it('weekly and every N weeks', () => {
    expect(walk('2026-11-06', 'WEEK', 1, 6, 3)).toEqual(['2026-11-06', '2026-11-13', '2026-11-20', '2026-11-27']);
    expect(walk('2026-12-24', 'WEEK', 2, 24, 2)).toEqual(['2026-12-24', '2027-01-07', '2027-01-21']);
  });

  it('monthly keeps month-end anchor: 31 → Feb 28/29 → back to Mar 31', () => {
    expect(walk('2027-01-31', 'MONTH', 1, 31, 5)).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
      '2027-05-31',
      '2027-06-30',
    ]);
    expect(walk('2028-01-31', 'MONTH', 1, 31, 2)).toEqual(['2028-01-31', '2028-02-29', '2028-03-31']);
  });

  it('anchor 30 and 29 behave the same way', () => {
    expect(walk('2027-01-30', 'MONTH', 1, 30, 2)).toEqual(['2027-01-30', '2027-02-28', '2027-03-30']);
    expect(walk('2027-01-29', 'MONTH', 1, 29, 2)).toEqual(['2027-01-29', '2027-02-28', '2027-03-29']);
    expect(walk('2028-01-29', 'MONTH', 1, 29, 1)).toEqual(['2028-01-29', '2028-02-29']);
  });

  it('every N months: quarterly, 6-monthly, custom 18 months', () => {
    expect(walk('2026-12-15', 'MONTH', 3, 15, 4)).toEqual(['2026-12-15', '2027-03-15', '2027-06-15', '2027-09-15', '2027-12-15']);
    expect(walk('2026-08-31', 'MONTH', 6, 31, 2)).toEqual(['2026-08-31', '2027-02-28', '2027-08-31']);
    expect(walk('2026-05-31', 'MONTH', 3, 31, 3)).toEqual(['2026-05-31', '2026-08-31', '2026-11-30', '2027-02-28']);
    expect(nextDueDate('2026-01-10', 'MONTH', 18, 10)).toBe('2027-07-10');
  });

  it('yearly, including Feb 29 anchors in and out of leap years', () => {
    expect(walk('2027-10-02', 'YEAR', 1, 2, 2)).toEqual(['2027-10-02', '2028-10-02', '2029-10-02']);
    expect(walk('2028-02-29', 'YEAR', 1, 29, 4)).toEqual(['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
    expect(nextDueDate('2028-02-29', 'YEAR', 4, 29)).toBe('2032-02-29');
    expect(nextDueDate('2026-10-20', 'YEAR', 2, 20)).toBe('2028-10-20');
  });

  it('one-time has no next date', () => {
    expect(nextDueDate('2026-11-20', 'ONCE', 1, 20)).toBeNull();
    expect(previousDueDate('2026-11-20', 'ONCE', 1, 20)).toBeNull();
  });

  it('seed obligations advance correctly', () => {
    expect(nextDueDate('2026-01-30', 'YEAR', 1, 30)).toBe('2027-01-30'); // Cloudflare
    expect(nextDueDate('2026-10-20', 'YEAR', 1, 20)).toBe('2027-10-20'); // KigaliToday hosting
    expect(nextDueDate('2026-11-30', 'MONTH', 1, 31)).toBe('2026-12-31'); // rent anchored to month end
    expect(nextDueDate('2027-02-26', 'YEAR', 1, 26)).toBe('2028-02-26');
  });

  it('rejects invalid schedules', () => {
    expect(() => nextDueDate('2026-01-01', 'MONTH', 0, 1)).toThrow();
    expect(() => nextDueDate('2026-01-01', 'MONTH', 1.5, 1)).toThrow();
    expect(() => nextDueDate('2026-01-01', 'DAY' as FrequencyUnit, 1, 1)).toThrow();
    expect(() => previousDueDate('2026-01-01', 'WEEK', -1, 1)).toThrow();
  });
});

describe('previousDueDate and cycle length', () => {
  it('steps back one cycle', () => {
    expect(previousDueDate('2026-11-13', 'WEEK', 1, 13)).toBe('2026-11-06');
    expect(previousDueDate('2027-03-31', 'MONTH', 1, 31)).toBe('2027-02-28');
    expect(previousDueDate('2029-02-28', 'YEAR', 1, 29)).toBe('2028-02-29');
  });

  it('measures cycle length', () => {
    expect(cycleLengthDays('2027-10-02', 'YEAR', 1, 2)).toBe(365);
    expect(cycleLengthDays('2028-10-02', 'YEAR', 1, 2)).toBe(366);
    expect(cycleLengthDays('2026-11-13', 'WEEK', 2, 13)).toBe(14);
    expect(cycleLengthDays('2026-12-20', 'ONCE', 1, 20, '2026-11-20')).toBe(30);
    expect(cycleLengthDays('2026-11-20', 'ONCE', 1, 20, '2026-11-20')).toBe(1);
    expect(cycleLengthDays('2026-11-20', 'ONCE', 1, 20)).toBe(30);
  });
});

describe('frequencyLabel', () => {
  it.each([
    ['WEEK', 1, 'Weekly'],
    ['WEEK', 2, 'Every 2 weeks'],
    ['MONTH', 1, 'Monthly'],
    ['MONTH', 3, 'Quarterly'],
    ['MONTH', 6, 'Every 6 months'],
    ['MONTH', 18, 'Every 18 months'],
    ['YEAR', 1, 'Yearly'],
    ['YEAR', 2, 'Every 2 years'],
    ['ONCE', 1, 'One-time'],
  ] as const)('%s × %i → %s', (unit, n, label) => {
    expect(frequencyLabel(unit, n)).toBe(label);
  });
});

describe('time zones', () => {
  it('computes today in the organization timezone, not the server timezone', () => {
    // 22:30 UTC on 1 Nov is already 00:30 on 2 Nov in Kigali (UTC+2).
    const instant = new Date('2026-11-01T22:30:00Z');
    expect(todayIn(instant, 'Africa/Kigali')).toBe('2026-11-02');
    expect(todayIn(instant, 'UTC')).toBe('2026-11-01');
    expect(todayIn(instant, 'America/New_York')).toBe('2026-11-01');
    expect(todayIn(instant, 'Pacific/Kiritimati')).toBe('2026-11-02'); // UTC+14
  });

  it('handles the date line and DST transitions', () => {
    expect(todayIn(new Date('2026-12-31T10:30:00Z'), 'Pacific/Kiritimati')).toBe('2027-01-01');
    expect(todayIn(new Date('2026-12-31T10:30:00Z'), 'Pacific/Pago_Pago')).toBe('2026-12-30'); // UTC-11
    // US DST ended at 06:00Z on 1 Nov 2026 (02:00 EDT → 01:00 EST), so 06:30Z is 01:30 EST.
    const t = localTimeIn(new Date('2026-11-01T06:30:00Z'), 'America/New_York');
    expect(t).toEqual({ date: '2026-11-01', hour: 1, minute: 30, minutes: 90 });
    // Europe/London: 30 Mar 2026 after spring-forward is UTC+1.
    expect(localTimeIn(new Date('2026-03-30T08:15:00Z'), 'Europe/London')).toMatchObject({ hour: 9, minute: 15 });
  });

  it('reports local hour and minutes for the reminder clock', () => {
    expect(localTimeIn(new Date('2026-11-02T07:00:00Z'), 'Africa/Kigali')).toEqual({
      date: '2026-11-02',
      hour: 9,
      minute: 0,
      minutes: 540,
    });
    expect(localTimeIn(new Date('2026-11-02T21:59:00Z'), 'Africa/Kigali').hour).toBe(23);
    expect(localTimeIn(new Date('2026-11-02T22:00:00Z'), 'Africa/Kigali')).toMatchObject({ date: '2026-11-03', hour: 0 });
  });
});

describe('computeStatus', () => {
  const base = { status: 'ACTIVE' as const, nextDueDate: '2026-11-20', amountMinor: 24000 };

  it.each([
    ['2026-11-01', 'UPCOMING'],
    ['2026-11-12', 'UPCOMING'], // 8 days
    ['2026-11-13', 'DUE_SOON'], // 7 days
    ['2026-11-19', 'DUE_SOON'],
    ['2026-11-20', 'DUE_TODAY'],
    ['2026-11-21', 'OVERDUE'],
  ] as const)('on %s → %s', (today, expected) => {
    expect(computeStatus(base, [], today)).toBe(expected);
  });

  it('archived and completed', () => {
    expect(computeStatus({ ...base, status: 'ARCHIVED' }, [], '2026-11-21')).toBe('ARCHIVED');
    expect(computeStatus({ ...base, status: 'COMPLETED' }, [], '2026-11-21')).toBe('PAID');
  });

  it('partial payments for the current cycle', () => {
    const partial = [{ cycleDueDate: '2026-11-20', amountMinor: 12000 }];
    expect(computeStatus(base, partial, '2026-11-01')).toBe('PARTIALLY_PAID');
    expect(computeStatus(base, partial, '2026-11-20')).toBe('PARTIALLY_PAID');
    expect(computeStatus(base, partial, '2026-11-21')).toBe('OVERDUE');
  });

  it('full payment (possibly in several parts) is PAID', () => {
    const parts = [
      { cycleDueDate: '2026-11-20', amountMinor: 12000 },
      { cycleDueDate: '2026-11-20', amountMinor: 12000 },
    ];
    expect(computeStatus(base, parts, '2026-11-25')).toBe('PAID');
    expect(computeStatus(base, [{ cycleDueDate: '2026-11-20', amountMinor: 30000 }], '2026-11-25')).toBe('PAID');
  });

  it('ignores payments from other cycles (history is kept, status is per cycle)', () => {
    const lastYear = [{ cycleDueDate: '2025-11-20', amountMinor: 24000 }];
    expect(computeStatus(base, lastYear, '2026-11-21')).toBe('OVERDUE');
    expect(paidForCycle(lastYear, '2026-11-20')).toBe(0);
  });

  it('seed data on 2 Nov 2026 (Kigali)', () => {
    const today = todayIn(new Date('2026-11-02T07:00:00Z'), 'Africa/Kigali');
    expect(computeStatus({ status: 'ACTIVE', nextDueDate: '2026-10-20', amountMinor: 152300 }, [], today)).toBe('OVERDUE');
    expect(computeStatus({ status: 'ACTIVE', nextDueDate: '2026-01-30', amountMinor: 24000 }, [], today)).toBe('OVERDUE');
    expect(computeStatus({ status: 'ACTIVE', nextDueDate: '2027-10-02', amountMinor: 13200 }, [], today)).toBe('UPCOMING');
    expect(computeStatus({ status: 'ACTIVE', nextDueDate: '2026-11-05', amountMinor: 85000 }, [], today)).toBe('DUE_SOON');
  });
});

describe('reminders', () => {
  const offsets = [30, 14, 7, 3, 1, 0, -1, -3, -7];

  it('maps offsets to dates, earliest first, deduplicated', () => {
    expect(reminderDates('2026-11-20', [1, 7, 7, 0, -3])).toEqual([
      { offsetDays: 7, date: '2026-11-13' },
      { offsetDays: 1, date: '2026-11-19' },
      { offsetDays: 0, date: '2026-11-20' },
      { offsetDays: -3, date: '2026-11-23' },
    ]);
  });

  it('crosses month and leap-year boundaries', () => {
    expect(reminderDates('2028-03-01', [1, 30]).map((r) => r.date)).toEqual(['2028-01-31', '2028-02-29']);
  });

  it('adds weekly follow-ups after the last overdue offset until `through`', () => {
    const schedule = reminderSchedule('2026-01-30', offsets, '2026-03-05');
    // -35 would be 6 March, after `through`, so the schedule stops at -28.
    expect(schedule.map((r) => r.offsetDays)).toEqual([30, 14, 7, 3, 1, 0, -1, -3, -7, -14, -21, -28]);
    expect(schedule.at(-1)).toEqual({ offsetDays: -28, date: '2026-02-27' });
    expect(schedule.every((r, i, a) => i === 0 || a[i - 1]!.date < r.date)).toBe(true);
  });

  it('weekly follow-ups land exactly 7 days apart', () => {
    const s = reminderSchedule('2026-01-30', offsets, '2026-12-31');
    const after = s.filter((r) => r.offsetDays <= -7);
    for (let i = 1; i < after.length; i++) expect(daysBetween(after[i - 1]!.date, after[i]!.date)).toBe(7);
    expect(after.at(-1)!.date <= '2026-12-31').toBe(true);
  });

  it('no follow-ups when no after-due offset is configured', () => {
    expect(reminderSchedule('2026-11-20', [7, 1, 0], '2027-01-01').map((r) => r.offsetDays)).toEqual([7, 1, 0]);
  });

  it('finds the reminder due on a given day', () => {
    expect(reminderDueOn('2026-11-20', offsets, '2026-11-13')).toEqual({ offsetDays: 7, date: '2026-11-13' });
    expect(reminderDueOn('2026-11-20', offsets, '2026-11-14')).toBeNull();
    expect(reminderDueOn('2026-11-20', offsets, '2026-12-11')).toEqual({ offsetDays: -21, date: '2026-12-11' });
  });

  it('catch-up returns only the latest missed reminder', () => {
    // Server down 11–18 Nov: the 7-day (13th) and 3-day (17th) reminders were missed → send only the 3-day one.
    expect(mostRecentMissedReminder('2026-11-20', offsets, '2026-11-10', '2026-11-18')).toEqual({ offsetDays: 3, date: '2026-11-17' });
    // Nothing missed since yesterday's run.
    expect(mostRecentMissedReminder('2026-11-20', offsets, '2026-11-17', '2026-11-18')).toBeNull();
    // Today's own reminder counts.
    expect(mostRecentMissedReminder('2026-11-20', offsets, '2026-11-18', '2026-11-19')).toEqual({ offsetDays: 1, date: '2026-11-19' });
  });
});
