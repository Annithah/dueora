import { routeForNotification } from './push';
import {
  describeOffsets,
  hourLabel,
  isChoiceSelected,
  REMINDER_CHOICES,
  toggleChoice,
} from './reminderOptions';

describe('reminder choices', () => {
  const defaults = [30, 14, 7, 3, 1, 0, -1, -3, -7];

  it('describes the workspace defaults', () => {
    expect(describeOffsets(defaults)).toBe(
      '1 month, 2 weeks, 1 week, 3 days, 1 day, On due date, After due date',
    );
    expect(describeOffsets([14, 7, 1])).toBe('2 weeks, 1 week, 1 day');
    expect(describeOffsets([])).toBe('No reminders');
  });

  it('"After due date" toggles all overdue follow-ups together', () => {
    const after = REMINDER_CHOICES.find((c) => c.label === 'After due date')!;
    expect(isChoiceSelected(defaults, after)).toBe(true);
    expect(toggleChoice(defaults, after)).toEqual([30, 14, 7, 3, 1, 0]);
    expect(toggleChoice([7, 1], after)).toEqual([7, 1, -1, -3, -7]);
  });

  it('keeps offsets sorted and unique', () => {
    const week = REMINDER_CHOICES.find((c) => c.label === '1 week')!;
    expect(toggleChoice([1, 30], week)).toEqual([30, 7, 1]);
    expect(toggleChoice([30, 7, 1], week)).toEqual([30, 1]);
  });

  it('formats hours', () => {
    expect(hourLabel(9)).toBe('09:00');
    expect(hourLabel(20)).toBe('20:00');
  });
});

describe('routeForNotification', () => {
  it('opens the payment for reminders and recorded payments', () => {
    expect(routeForNotification({ obligationId: 'abc', type: 'OVERDUE' })).toBe('/payments/abc');
  });
  it('opens alerts for digests and system messages', () => {
    expect(routeForNotification({ type: 'DIGEST' })).toBe('/alerts');
    expect(routeForNotification({ type: 'SYSTEM' })).toBe('/alerts');
  });
  it('ignores unknown payloads', () => {
    expect(routeForNotification(undefined)).toBeNull();
    expect(routeForNotification({})).toBeNull();
  });
});
