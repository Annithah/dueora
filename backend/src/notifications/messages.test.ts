import { describe, expect, it } from 'vitest';

import { formatLongDate, formatShortDay, formatUSD } from '../lib/format.js';

import { digestCopy, paymentRecordedCopy, reminderCopy, subscriptionLabel } from './messages.js';

describe('formatting', () => {
  it('formats USD cents with two decimals', () => {
    expect(formatUSD(152_300)).toBe('$1,523.00');
    expect(formatUSD(1_300)).toBe('$13.00');
    expect(formatUSD(5)).toBe('$0.05');
    expect(formatUSD(123_456_789)).toBe('$1,234,567.89');
    expect(formatUSD(-500)).toBe('-$5.00');
  });

  it('formats dates', () => {
    expect(formatShortDay('2026-10-20')).toBe('Tue, 20 Oct');
    expect(formatLongDate('2028-10-02')).toBe('02 Oct 2028');
  });
});

describe('notification copy (brief examples)', () => {
  const base = { name: 'Hosting', company: 'Harbor Clinic', amountCents: 152_300, dueDate: '2026-10-20' };

  it('labels subscriptions with their company', () => {
    expect(subscriptionLabel('Hosting', 'Harbor Clinic')).toBe('Harbor Clinic · Hosting');
  });

  it('reminder before the due date', () => {
    const c = reminderCopy({ ...base, daysUntilDue: 7 });
    expect(c.body).toBe('⏰ Harbor Clinic · Hosting is due in 7 days — $1,523.00 on Tue, 20 Oct.');
    expect(c.title).toBe('Due in 7 days');
  });

  it('due tomorrow and due today', () => {
    expect(reminderCopy({ ...base, daysUntilDue: 1 }).title).toBe('Due tomorrow');
    const today = reminderCopy({ name: 'Domain renewal', company: 'Riverside School', amountCents: 1_300, dueDate: '2026-10-20', daysUntilDue: 0 });
    expect(today.body).toBe('📅 Today: Riverside School · Domain renewal — $13.00.');
  });

  it('overdue', () => {
    const c = reminderCopy({ name: 'CDN plan', company: 'Harbor Clinic', amountCents: 24_000, dueDate: '2026-10-20', daysUntilDue: -3 });
    expect(c.body).toBe('⚠️ Harbor Clinic · CDN plan is 3 days overdue — $240.00. Tap to record the payment.');
    expect(reminderCopy({ ...base, daysUntilDue: -1 }).title).toBe('1 day overdue');
  });

  it('payment recorded', () => {
    const paid = { name: 'Hosting', company: 'Riverside School', amountCents: 13_200 };
    expect(paymentRecordedCopy({ ...paid, nextDueDate: '2028-10-02', cycleCompleted: true }).body).toBe(
      '✅ $132.00 recorded for Riverside School · Hosting. Next due: 02 Oct 2028.',
    );
    expect(paymentRecordedCopy({ ...paid, nextDueDate: '2028-10-02', cycleCompleted: false }).body).toMatch(/still open/);
    expect(paymentRecordedCopy({ ...paid, nextDueDate: null, cycleCompleted: true }).body).toMatch(/fully paid/);
  });

  it('digest', () => {
    const c = digestCopy(4, ['A · 1', 'B · 2', 'C · 3', 'D · 4']);
    expect(c.title).toBe('🔔 4 subscriptions need attention this week');
    expect(c.body).toBe('A · 1, B · 2, C · 3 and 1 more.');
  });
});
