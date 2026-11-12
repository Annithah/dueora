import { describe, expect, it } from 'vitest';

import { cyclesBetween, owedNow, type CycleBill, type StoredCycle } from './cycles.js';

const monthly: CycleBill = {
  status: 'ACTIVE',
  amountType: 'FIXED',
  amountCents: 10_000,
  nextDueDate: '2026-08-05',
  frequencyUnit: 'MONTH',
  frequencyInterval: 1,
  anchorDay: 5,
};
const none = new Map<string, StoredCycle>();

describe('cyclesBetween', () => {
  it('counts every missed cycle of a recurring bill that fell behind', () => {
    // Unpaid since 5 Aug; today is 10 Nov: Aug (current), Sep and Oct (missed) and 5 Nov (missed) are all overdue.
    const list = cyclesBetween(monthly, none, [], '2026-08-01', '2026-12-31', '2026-11-10');
    expect(list.map((c) => [c.dueDate, c.kind, c.state])).toEqual([
      ['2026-08-05', 'current', 'OVERDUE'],
      ['2026-09-05', 'missed', 'OVERDUE'],
      ['2026-10-05', 'missed', 'OVERDUE'],
      ['2026-11-05', 'missed', 'OVERDUE'],
      ['2026-12-05', 'future', 'UPCOMING'],
    ]);
    expect(list[0]!.daysOverdue).toBe(97);
    const owed = owedNow(monthly, none, [], '2026-11-10');
    expect(owed).toEqual({ outstandingCents: 40_000, overdueCents: 40_000, overdueCycles: 4, missedCycles: 3, oldestDueDate: '2026-08-05' });
  });

  it('keeps past cycles at the amount stored for them, and part payments reduce the open cycle', () => {
    const bill = { ...monthly, amountCents: 15_000, nextDueDate: '2026-11-05' };
    const stored = new Map<string, StoredCycle>([['2026-10-05', { dueDate: '2026-10-05', amountCents: 10_000, isActual: false, closedAt: new Date() }]]);
    const pays = [
      { cycleDueDate: '2026-10-05', amountCents: 10_000 },
      { cycleDueDate: '2026-11-05', amountCents: 5_000 },
    ];
    const list = cyclesBetween(bill, stored, pays, '2026-10-01', '2026-11-30', '2026-11-02');
    expect(list.map((c) => [c.dueDate, c.kind, c.expectedCents, c.remainingCents, c.state])).toEqual([
      ['2026-10-05', 'closed', 10_000, 0, 'PAID'],
      ['2026-11-05', 'current', 15_000, 10_000, 'PARTIALLY_PAID'],
    ]);
  });

  it('marks variable cycles as estimates until the real amount is set', () => {
    const bill: CycleBill = { ...monthly, amountType: 'VARIABLE', nextDueDate: '2026-11-20' };
    const stored = new Map<string, StoredCycle>([['2026-11-20', { dueDate: '2026-11-20', amountCents: 12_345, isActual: true, closedAt: null }]]);
    const [now, next] = cyclesBetween(bill, stored, [], '2026-11-01', '2026-12-31', '2026-11-02');
    expect(now).toMatchObject({ expectedCents: 12_345, isEstimate: false, state: 'UPCOMING' });
    expect(next).toMatchObject({ expectedCents: 10_000, isEstimate: true });
  });

  it('a one-time bill has a single cycle; completed bills only have history', () => {
    const once: CycleBill = { ...monthly, frequencyUnit: 'ONCE', nextDueDate: '2026-11-20' };
    expect(cyclesBetween(once, none, [], '2026-01-01', '2027-12-31', '2026-11-02')).toHaveLength(1);
    const done = { ...once, status: 'COMPLETED' };
    const paid = cyclesBetween(done, none, [{ cycleDueDate: '2026-11-20', amountCents: 10_000 }], '2026-01-01', '2027-12-31', '2026-12-01');
    expect(paid.map((c) => [c.kind, c.state])).toEqual([['closed', 'PAID']]);
  });
});
