import { differenceInCalendarDays, format, isValid, parse } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

/**
 * Due dates are calendar dates without a time ("2027-10-02"), exchanged with the API
 * as ISO date strings. Parse them as *local* dates so a device timezone can never
 * shift the day (new Date('2027-10-02') would be UTC midnight).
 */
export type ISODate = string;

const ISO = 'yyyy-MM-dd';

export function parseISODate(value: ISODate): Date {
  const d = parse(value, ISO, new Date(2000, 0, 1));
  if (!isValid(d)) throw new Error(`Invalid ISO date: ${value}`);
  return d;
}

export function toISODate(date: Date): ISODate {
  return format(date, ISO);
}

/** Today (YYYY-MM-DD) in an IANA timezone; falls back to the device date when unknown. */
export function todayInTimeZone(timeZone: string | undefined, now: Date = new Date()): ISODate {
  if (!timeZone) return toISODate(now);
  try {
    return formatInTimeZone(now, timeZone, ISO);
  } catch {
    return toISODate(now);
  }
}

/** "02 Oct 2027" — the prototype's date style. */
export function formatDate(value: ISODate | Date): string {
  return format(typeof value === 'string' ? parseISODate(value) : value, 'dd MMM yyyy');
}

/** "Tue, 20 Oct" — used in reminder copy. */
export function formatShortDay(value: ISODate | Date): string {
  return format(typeof value === 'string' ? parseISODate(value) : value, 'EEE, d MMM');
}

/** Whole days from `today` to `due` (negative when overdue). */
export function daysUntil(due: ISODate, today: ISODate): number {
  return differenceInCalendarDays(parseISODate(due), parseISODate(today));
}

/** "in 3 days", "tomorrow", "today", "yesterday", "8 days ago". */
export function relativeDays(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** "8 months, 21 days" style span for the countdown card. */
export function humanSpan(fromISO: ISODate, toISO: ISODate): string {
  let from = parseISODate(fromISO);
  let to = parseISODate(toISO);
  if (from > to) [from, to] = [to, from];
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  const anchor = new Date(from.getFullYear(), from.getMonth() + months, from.getDate());
  const days = differenceInCalendarDays(to, anchor);
  const parts: string[] = [];
  if (months > 0) parts.push(`${months} month${months === 1 ? '' : 's'}`);
  if (days > 0 || parts.length === 0) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  return parts.join(', ');
}

/** "Good morning" / "Good afternoon" / "Good evening" for an hour 0–23. */
export function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
