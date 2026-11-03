/**
 * Display formatting for notification copy, emails and reports. Mirrors mobile/src/lib/money.ts
 * so a reminder reads exactly like the app: "$1,523.00", "Tue, 20 Oct".
 * DueOra works only in US dollars; amounts are integer cents.
 */

/** Integer cents → "$1,523.00" (negative → "-$5.00"). */
export function formatUSD(cents: number): string {
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = (abs % 100).toString().padStart(2, '0');
  return `${cents < 0 ? '-' : ''}$${dollars}.${fraction}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  return { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** "Tue, 20 Oct" */
export function formatShortDay(isoDate: string): string {
  const p = parts(isoDate);
  return `${WEEKDAYS[p.weekday]}, ${p.d} ${MONTHS[p.m - 1]}`;
}

/** "02 Oct 2028" */
export function formatLongDate(isoDate: string): string {
  const p = parts(isoDate);
  return `${String(p.d).padStart(2, '0')} ${MONTHS[p.m - 1]} ${p.y}`;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
