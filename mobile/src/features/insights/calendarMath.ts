import { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';

import { parseISODate, toISODate } from '@/lib/dates';

export type CalendarView = 'day' | 'week' | 'month' | 'year';

/** Weeks start on Monday, as in the prototype (M T W T F S S). */
const WEEK = { weekStartsOn: 1 } as const;

/** Inclusive date range the API needs for a view anchored on `focus`. */
export function rangeFor(view: CalendarView, focus: string): { from: string; to: string } {
  const d = parseISODate(focus);
  switch (view) {
    case 'day':
      return { from: focus, to: focus };
    case 'week':
      return { from: toISODate(startOfWeek(d, WEEK)), to: toISODate(endOfWeek(d, WEEK)) };
    case 'month':
      // Whole weeks so leading/trailing days show their dots too.
      return {
        from: toISODate(startOfWeek(startOfMonth(d), WEEK)),
        to: toISODate(endOfWeek(endOfMonth(d), WEEK)),
      };
    case 'year':
      return { from: `${focus.slice(0, 4)}-01-01`, to: `${focus.slice(0, 4)}-12-31` };
  }
}

/** The 5–6 rows of 7 ISO dates for a month grid. */
export function monthGrid(focus: string): string[][] {
  const { from, to } = rangeFor('month', focus);
  const rows: string[][] = [];
  for (let d = parseISODate(from); toISODate(d) <= to; d = addDays(d, 7)) {
    rows.push(Array.from({ length: 7 }, (_, i) => toISODate(addDays(d, i))));
  }
  return rows;
}

/** Move the focus one step for the view (−1 = previous). */
export function shift(view: CalendarView, focus: string, step: number): string {
  const d = parseISODate(focus);
  switch (view) {
    case 'day':
      return toISODate(addDays(d, step));
    case 'week':
      return toISODate(addDays(d, 7 * step));
    case 'month':
      return toISODate(new Date(d.getFullYear(), d.getMonth() + step, 1));
    case 'year':
      return `${d.getFullYear() + step}-01-01`;
  }
}

export function titleFor(view: CalendarView, focus: string): string {
  const d = parseISODate(focus);
  switch (view) {
    case 'day':
      return format(d, 'EEEE, d MMM yyyy');
    case 'week': {
      const { from, to } = rangeFor('week', focus);
      return `${format(parseISODate(from), 'd MMM')} – ${format(parseISODate(to), 'd MMM yyyy')}`;
    }
    case 'month':
      return format(d, 'MMMM yyyy');
    case 'year':
      return format(d, 'yyyy');
  }
}
