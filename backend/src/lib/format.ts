/**
 * Display formatting for notification copy and emails. Mirrors mobile/src/lib/money.ts
 * so a reminder reads exactly like the app: "$1,523", "18,880 RWF", "Tue, 20 Oct".
 */

const MINOR_UNITS: Record<string, number> = {
  RWF: 0,
  UGX: 0,
  JPY: 0,
  KRW: 0,
  XAF: 0,
  XOF: 0,
  BIF: 0,
  KWD: 3,
  BHD: 3,
  TND: 3,
};
const SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };

export function minorUnits(currency: string): number {
  return MINOR_UNITS[currency.toUpperCase()] ?? 2;
}

/** Integer minor units → "$1,523" / "$1,523.50" / "18,880 RWF". */
export function formatMoney(amountMinor: number, currency: string): string {
  const code = currency.toUpperCase();
  const exponent = minorUnits(code);
  const abs = Math.abs(Math.trunc(amountMinor));
  const divisor = 10 ** exponent;
  let number = Math.floor(abs / divisor)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = abs % divisor;
  if (exponent > 0 && fraction > 0) number += `.${fraction.toString().padStart(exponent, '0')}`;
  const sign = amountMinor < 0 ? '-' : '';
  const symbol = SYMBOLS[code];
  return symbol ? `${sign}${symbol}${number}` : `${sign}${number} ${code}`;
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
