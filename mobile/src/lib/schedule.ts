/**
 * Client-side mirror of backend/src/domain/schedule.ts (calculateNextDueDate, advance),
 * so the Add/Edit form can show the next due date while the user types. The server
 * recalculates on save, so the backend stays the source of truth.
 */
import type { ISODate } from './dates';

export type FrequencyUnit = 'WEEK' | 'MONTH' | 'YEAR' | 'ONCE';

function parts(iso: ISODate) {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return { y, m, d };
}

function format(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDaysISO(iso: ISODate, days: number): ISODate {
  const { y, m, d } = parts(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return format(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Whole months later, keeping the anchor day where the month allows (31 → Feb 28/29 → Mar 31). */
export function addMonthsISO(iso: ISODate, months: number, anchorDay?: number): ISODate {
  const { y, m, d } = parts(iso);
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  return format(ny, nm, Math.min(anchorDay ?? d, daysInMonth(ny, nm)));
}

/** One cycle after `current` (null for one-time). */
export function advance(current: ISODate, unit: FrequencyUnit, interval: number, anchorDay: number): ISODate | null {
  switch (unit) {
    case 'WEEK':
      return addDaysISO(current, 7 * interval);
    case 'MONTH':
      return addMonthsISO(current, interval, anchorDay);
    case 'YEAR':
      return addMonthsISO(current, 12 * interval, anchorDay);
    case 'ONCE':
      return null;
  }
}

/** First due date on or after `today`, counting whole cycles from `startDate`. */
export function calculateNextDueDate(
  startDate: ISODate,
  unit: FrequencyUnit,
  interval: number,
  anchorDay: number,
  today: ISODate,
): ISODate {
  if (startDate >= today || unit === 'ONCE' || interval < 1) return startDate;
  let due = startDate;
  for (let cycles = 1; due < today && cycles < 10_000; cycles++) {
    due =
      unit === 'WEEK'
        ? addDaysISO(startDate, cycles * 7 * interval)
        : addMonthsISO(startDate, cycles * (unit === 'MONTH' ? interval : 12 * interval), anchorDay);
  }
  return due;
}

/** Quick picks shown under date fields. */
export const DATE_QUICK_PICKS = [
  { key: 'today', label: 'Today', apply: (today: ISODate) => today },
  { key: 'week', label: '+1 week', apply: (today: ISODate) => addDaysISO(today, 7) },
  { key: 'month', label: '+1 month', apply: (today: ISODate) => addMonthsISO(today, 1) },
  { key: 'quarter', label: '+3 months', apply: (today: ISODate) => addMonthsISO(today, 3) },
  { key: 'year', label: '+1 year', apply: (today: ISODate) => addMonthsISO(today, 12) },
] as const;
