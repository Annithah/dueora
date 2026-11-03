/** Reminder offset chips used in the add-subscription form and notification settings. */
export const REMINDER_CHOICES: { label: string; offsets: number[] }[] = [
  { label: '1 month', offsets: [30] },
  { label: '2 weeks', offsets: [14] },
  { label: '1 week', offsets: [7] },
  { label: '3 days', offsets: [3] },
  { label: '1 day', offsets: [1] },
  { label: 'On due date', offsets: [0] },
  // "After due date" = the overdue follow-ups: 1, 3 and 7 days after (then weekly).
  { label: 'After due date', offsets: [-1, -3, -7] },
];

export function isChoiceSelected(
  offsets: readonly number[],
  choice: { offsets: number[] },
): boolean {
  return choice.offsets.every((o) => offsets.includes(o));
}

export function toggleChoice(offsets: readonly number[], choice: { offsets: number[] }): number[] {
  const on = isChoiceSelected(offsets, choice);
  const next = on
    ? offsets.filter((o) => !choice.offsets.includes(o))
    : [...offsets, ...choice.offsets];
  return [...new Set(next)].sort((a, b) => b - a);
}

/** "2 weeks, 1 week, 1 day" summary for a list row. */
export function describeOffsets(offsets: readonly number[]): string {
  const labels = REMINDER_CHOICES.filter((c) => isChoiceSelected(offsets, c)).map((c) => c.label);
  return labels.length ? labels.join(', ') : 'No reminders';
}

export function hourLabel(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}
