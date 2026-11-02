import { describe, expect, it } from 'vitest';

import { digestCopy, obligationLabel, paymentRecordedCopy, reminderCopy } from './messages.js';

describe('obligationLabel', () => {
  it.each([
    ['Hosting', 'KigaliToday', 'KigaliToday hosting'],
    ['Domain', 'KT Radio', 'KT Radio domain'],
    ['Cloudflare', 'KigaliToday', 'Cloudflare (KigaliToday)'],
    ['X subscription', 'KT Radio', 'X subscription (KT Radio)'],
    ['Office rent', null, 'Office rent'],
    ['KT Radio streaming', 'KT Radio', 'KT Radio streaming'],
  ])('%s on %s → %s', (name, platform, label) => {
    expect(obligationLabel(name, platform)).toBe(label);
  });
});

describe('reminderCopy (matches the brief)', () => {
  const base = { name: 'Hosting', platform: 'KigaliToday', amountMinor: 152300, currency: 'USD', dueDate: '2026-10-20' };

  it('7 days before', () => {
    expect(reminderCopy({ ...base, daysUntilDue: 7 }).body).toBe('⏰ KigaliToday hosting is due in 7 days — $1,523 on Tue, 20 Oct.');
  });

  it('tomorrow', () => {
    expect(reminderCopy({ ...base, daysUntilDue: 1 })).toEqual({ title: 'Due tomorrow', body: '⏰ KigaliToday hosting is due tomorrow — $1,523.' });
  });

  it('due today', () => {
    expect(reminderCopy({ name: 'Domain', platform: 'KT Radio', amountMinor: 18880, currency: 'RWF', dueDate: '2027-02-26', daysUntilDue: 0 }).body).toBe(
      '📅 Today: KT Radio domain — 18,880 RWF.',
    );
  });

  it('overdue', () => {
    const c = reminderCopy({ name: 'Cloudflare', platform: 'KigaliToday', amountMinor: 24000, currency: 'USD', dueDate: '2026-01-30', daysUntilDue: -3 });
    expect(c).toEqual({ title: '3 days overdue', body: '⚠️ Cloudflare (KigaliToday) is 3 days overdue — $240. Tap to record the payment.' });
    expect(reminderCopy({ ...base, daysUntilDue: -1 }).title).toBe('1 day overdue');
  });
});

describe('paymentRecordedCopy', () => {
  it('names the recorder and the next due date', () => {
    expect(
      paymentRecordedCopy({ recorderName: 'Anitha Uwase', name: 'Hosting', platform: 'KT Radio', amountMinor: 13200, currency: 'USD', nextDueDate: '2028-10-02', cycleCompleted: true }).body,
    ).toBe('✅ Anitha recorded $132 for KT Radio hosting. Next due: 02 Oct 2028.');
  });

  it('handles partial and one-time payments', () => {
    expect(paymentRecordedCopy({ recorderName: 'Isaac', name: 'Rent', amountMinor: 100, currency: 'USD', nextDueDate: '2026-12-01', cycleCompleted: false }).body).toMatch(
      /Part of this cycle is still open\.$/,
    );
    expect(paymentRecordedCopy({ recorderName: 'Isaac', name: 'Audit', amountMinor: 100, currency: 'USD', nextDueDate: null, cycleCompleted: true }).body).toMatch(/fully paid/);
  });
});

describe('digestCopy', () => {
  it('summarises', () => {
    expect(digestCopy(5, ['A', 'B', 'C', 'D', 'E'])).toEqual({ title: '🔔 5 payments need attention this week', body: 'A, B, C and 2 more.' });
  });
});
