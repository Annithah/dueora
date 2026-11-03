/**
 * Scheduling engine — pure functions, no database, no wall clock.
 *
 * All calendar maths works on ISO date strings ("YYYY-MM-DD") broken into
 * year/month/day numbers, so neither the server's timezone nor DST can shift a
 * due date. "Today" is always derived from an instant + the workspace's IANA
 * timezone (todayIn).
 */

export type ISODate = string;
export type FrequencyUnit = 'WEEK' | 'MONTH' | 'YEAR' | 'ONCE';
export type SubscriptionStatus = 'ACTIVE' | 'ARCHIVED' | 'COMPLETED';
export type PaymentStatus =
  | 'UPCOMING'
  | 'DUE_SOON'
  | 'DUE_TODAY'
  | 'OVERDUE'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'ARCHIVED';

/** Due within this many days (inclusive) counts as "due soon". */
export const DUE_SOON_DAYS = 7;

interface YMD {
  y: number;
  m: number; // 1–12
  d: number;
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDate(value: ISODate): YMD {
  const match = ISO_RE.exec(value);
  if (!match) throw new Error(`Invalid ISO date "${value}"`);
  const ymd = { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
  if (ymd.m < 1 || ymd.m > 12 || ymd.d < 1 || ymd.d > daysInMonth(ymd.y, ymd.m)) {
    throw new Error(`Invalid ISO date "${value}"`);
  }
  return ymd;
}

export function formatDate({ y, m, d }: YMD): ISODate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/** Days since 1970-01-01 for a calendar date (proleptic Gregorian; UTC-free integer maths). */
function toDayNumber({ y, m, d }: YMD): number {
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function fromDayNumber(n: number): YMD {
  const dt = new Date(n * 86_400_000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function addDays(date: ISODate, days: number): ISODate {
  return formatDate(fromDayNumber(toDayNumber(parseDate(date)) + days));
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: ISODate, to: ISODate): number {
  return toDayNumber(parseDate(to)) - toDayNumber(parseDate(from));
}

/**
 * Shift by whole months keeping the anchor day where possible:
 * anchor 31 → Jan 31, Feb 28 (29 in leap years), Mar 31, Apr 30, ...
 */
export function addMonths(date: ISODate, months: number, anchorDay?: number): ISODate {
  const { y, m, d } = parseDate(date);
  const anchor = anchorDay ?? d;
  if (!Number.isInteger(anchor) || anchor < 1 || anchor > 31) throw new Error(`Invalid anchor day ${anchor}`);
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  return formatDate({ y: ny, m: nm, d: Math.min(anchor, daysInMonth(ny, nm)) });
}

function assertSchedule(unit: FrequencyUnit, interval: number): void {
  if (!Number.isInteger(interval) || interval < 1) throw new Error(`Invalid interval ${interval}`);
  if (!['WEEK', 'MONTH', 'YEAR', 'ONCE'].includes(unit)) throw new Error(`Invalid unit ${unit}`);
}

/**
 * Move one cycle forward: the due date one cycle after `current`, or null for one-time subscriptions.
 *
 * - WEEK × n: every n weeks (weekly, fortnightly, ...)
 * - MONTH × n: monthly (1), quarterly (3), every 6 months (6), any custom n
 * - YEAR × n: yearly / every n years (Feb 29 anchors fall back to Feb 28)
 * - ONCE: no next cycle
 */
export function advance(current: ISODate, unit: FrequencyUnit, interval: number, anchorDay: number): ISODate | null {
  assertSchedule(unit, interval);
  switch (unit) {
    case 'WEEK':
      return addDays(current, 7 * interval);
    case 'MONTH':
      return addMonths(current, interval, anchorDay);
    case 'YEAR':
      return addMonths(current, 12 * interval, anchorDay);
    case 'ONCE':
      return null;
  }
}

/**
 * Due date for a NEW subscription: the first cycle date on or after `today`, counting
 * from `startDate` (which is itself the first due date).
 *
 * - startDate today or in the future → startDate
 * - startDate in the past → step whole cycles from startDate (keeping the anchor day) until ≥ today
 * - one-time → startDate (even when it's in the past: the single payment is still owed)
 */
export function calculateNextDueDate(
  startDate: ISODate,
  unit: FrequencyUnit,
  interval: number,
  anchorDay: number,
  today: ISODate,
): ISODate {
  assertSchedule(unit, interval);
  if (startDate >= today || unit === 'ONCE') return startDate;
  if (unit === 'WEEK') {
    const step = 7 * interval;
    const cycles = Math.ceil(daysBetween(startDate, today) / step);
    return addDays(startDate, cycles * step);
  }
  const months = unit === 'MONTH' ? interval : 12 * interval;
  const start = parseDate(startDate);
  const now = parseDate(today);
  // Jump close to today in one step, then walk forward (at most a couple of cycles).
  let cycles = Math.max(0, Math.floor(((now.y - start.y) * 12 + (now.m - start.m)) / months) - 1);
  let due = addMonths(startDate, cycles * months, anchorDay);
  while (due < today) {
    cycles += 1;
    due = addMonths(startDate, cycles * months, anchorDay);
  }
  return due;
}

/** The due date one cycle before `current` (null for one-time). Used for cycle length. */
export function previousDueDate(current: ISODate, unit: FrequencyUnit, interval: number, anchorDay: number): ISODate | null {
  assertSchedule(unit, interval);
  switch (unit) {
    case 'WEEK':
      return addDays(current, -7 * interval);
    case 'MONTH':
      return addMonths(current, -interval, anchorDay);
    case 'YEAR':
      return addMonths(current, -12 * interval, anchorDay);
    case 'ONCE':
      return null;
  }
}

/** Length of the cycle ending on `due`, in days (one-time: days since `startDate`, min 1). */
export function cycleLengthDays(
  due: ISODate,
  unit: FrequencyUnit,
  interval: number,
  anchorDay: number,
  startDate?: ISODate,
): number {
  const prev = previousDueDate(due, unit, interval, anchorDay);
  if (prev) return daysBetween(prev, due);
  return startDate ? Math.max(1, daysBetween(startDate, due)) : 30;
}

/** Human label for a schedule: "Weekly", "Every 2 weeks", "Quarterly", "Yearly", "One-time"... */
export function frequencyLabel(unit: FrequencyUnit, interval: number): string {
  if (unit === 'ONCE') return 'One-time';
  if (interval === 1) return { WEEK: 'Weekly', MONTH: 'Monthly', YEAR: 'Yearly' }[unit];
  if (unit === 'MONTH' && interval === 3) return 'Quarterly';
  if (unit === 'MONTH' && interval === 6) return 'Every 6 months';
  return `Every ${interval} ${{ WEEK: 'weeks', MONTH: 'months', YEAR: 'years' }[unit]}`;
}

// --- Time zones ------------------------------------------------------------

export interface LocalTime {
  date: ISODate;
  hour: number;
  minute: number;
  /** Minutes after local midnight. */
  minutes: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Wall-clock date and time of `instant` in an IANA timezone. */
export function localTimeIn(instant: Date, timeZone: string): LocalTime {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(instant).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour, minute, minutes: hour * 60 + minute };
}

/** "Today" for an workspace. */
export function todayIn(instant: Date, timeZone: string): ISODate {
  return localTimeIn(instant, timeZone).date;
}

// --- Status ------------------------------------------------------------------

export interface StatusInput {
  status: SubscriptionStatus;
  nextDueDate: ISODate;
  amountCents: number;
}

export interface PaymentInput {
  cycleDueDate: ISODate;
  amountCents: number;
}

/** Sum of payments recorded against the cycle that ends on `cycleDueDate`. */
export function paidForCycle(payments: readonly PaymentInput[], cycleDueDate: ISODate): number {
  return payments.reduce((sum, p) => (p.cycleDueDate === cycleDueDate ? sum + p.amountCents : sum), 0);
}

/**
 * Status of the subscription's current cycle as seen on `today` (org-local date).
 * Precedence: ARCHIVED → PAID (completed or fully paid) → OVERDUE → PARTIALLY_PAID →
 * DUE_TODAY → DUE_SOON (≤ 7 days) → UPCOMING. A part-paid cycle past its due date is
 * OVERDUE: it is the more urgent fact (the remaining balance is reported separately).
 */
export function computeStatus(o: StatusInput, payments: readonly PaymentInput[], today: ISODate): PaymentStatus {
  if (o.status === 'ARCHIVED') return 'ARCHIVED';
  if (o.status === 'COMPLETED') return 'PAID';
  const paid = paidForCycle(payments, o.nextDueDate);
  if (paid >= o.amountCents) return 'PAID';
  const days = daysBetween(today, o.nextDueDate);
  if (days < 0) return 'OVERDUE';
  if (paid > 0) return 'PARTIALLY_PAID';
  if (days === 0) return 'DUE_TODAY';
  if (days <= DUE_SOON_DAYS) return 'DUE_SOON';
  return 'UPCOMING';
}

// --- Reminders -------------------------------------------------------------

export interface ReminderDate {
  /** Days relative to the due date (positive = before, negative = after). */
  offsetDays: number;
  date: ISODate;
}

/** Calendar dates for each reminder offset, earliest first. Duplicate offsets collapse. */
export function reminderDates(dueDate: ISODate, offsets: readonly number[]): ReminderDate[] {
  return [...new Set(offsets)]
    .filter((o) => Number.isInteger(o))
    .sort((a, b) => b - a)
    .map((offsetDays) => ({ offsetDays, date: addDays(dueDate, -offsetDays) }));
}

/**
 * Full reminder schedule for one cycle up to and including `through`:
 * the configured offsets, then — if any after-due offset is configured — weekly
 * follow-ups after the last one (default -7 → -14, -21, ...) until paid or archived.
 */
export function reminderSchedule(dueDate: ISODate, offsets: readonly number[], through: ISODate): ReminderDate[] {
  const base = reminderDates(dueDate, offsets).filter((r) => r.date <= through);
  const overdueOffsets = offsets.filter((o) => o < 0);
  if (overdueOffsets.length === 0) return base;
  const last = Math.min(...overdueOffsets);
  const followUps: ReminderDate[] = [];
  for (let offset = last - 7; ; offset -= 7) {
    const date = addDays(dueDate, -offset);
    if (date > through) break;
    followUps.push({ offsetDays: offset, date });
  }
  return [...base, ...followUps];
}

/** Reminder offset that falls on `today` for this cycle, if any (includes weekly follow-ups). */
export function reminderDueOn(dueDate: ISODate, offsets: readonly number[], today: ISODate): ReminderDate | null {
  return reminderSchedule(dueDate, offsets, today).find((r) => r.date === today) ?? null;
}

/**
 * Catch-up after downtime: the single most relevant reminder that should have gone
 * out between `since` (exclusive) and `today` (inclusive) — the latest one — so a
 * restarted server sends "due in 2 days" rather than a burst of old messages.
 */
export function mostRecentMissedReminder(
  dueDate: ISODate,
  offsets: readonly number[],
  since: ISODate,
  today: ISODate,
): ReminderDate | null {
  const missed = reminderSchedule(dueDate, offsets, today).filter((r) => r.date > since);
  return missed.length ? missed[missed.length - 1]! : null;
}
