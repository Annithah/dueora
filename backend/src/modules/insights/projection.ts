import { addDays, nextDueDate, type FrequencyUnit } from '../../domain/schedule.js';

export interface Projectable {
  status: string;
  nextDueDate: string;
  frequencyUnit: FrequencyUnit;
  frequencyInterval: number;
  anchorDay: number;
}

export interface Occurrence {
  date: string;
  /** The open (current) cycle, or a projected future one. */
  kind: 'current' | 'future';
}

/**
 * Due dates of an obligation's open cycle and future cycles that fall in [from, to].
 * Archived and completed obligations have none. Capped to avoid runaway loops.
 */
export function occurrencesBetween(o: Projectable, from: string, to: string, max = 400): Occurrence[] {
  if (o.status !== 'ACTIVE') return [];
  const out: Occurrence[] = [];
  let date: string | null = o.nextDueDate;
  let kind: Occurrence['kind'] = 'current';
  for (let i = 0; date && date <= to && i < max; i++) {
    if (date >= from) out.push({ date, kind });
    date = nextDueDate(date, o.frequencyUnit, o.frequencyInterval, o.anchorDay);
    kind = 'future';
  }
  return out;
}

/** First and last day of the month containing `date`, and helpers for month keys. */
export function monthRange(date: string): { from: string; to: string } {
  const from = `${date.slice(0, 7)}-01`;
  const next = addMonthsKey(date.slice(0, 7), 1);
  return { from, to: addDays(`${next}-01`, -1) };
}

/** "2026-11" + 2 → "2027-01" */
export function addMonthsKey(key: string, months: number): string {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const index = y * 12 + (m - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** The last `count` month keys ending with `endKey`, oldest first. */
export function lastMonths(endKey: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonthsKey(endKey, i - count + 1));
}
