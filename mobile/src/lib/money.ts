/**
 * Money is always an integer in the currency's smallest unit (never floats).
 * Display follows the prototype: "$1,523", "$1,523.50", "18,880 RWF", "€40".
 */

/** ISO 4217 minor-unit exponents for currencies that differ from the default of 2. */
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

/** Currencies shown with a leading symbol; everything else shows the code after the number. */
const SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
};

export const COMMON_CURRENCIES = ['USD', 'RWF', 'EUR', 'GBP', 'KES', 'UGX', 'TZS'] as const;

export function minorUnits(currency: string): number {
  return MINOR_UNITS[currency.toUpperCase()] ?? 2;
}

export function currencySymbol(currency: string): string | undefined {
  return SYMBOLS[currency.toUpperCase()];
}

export interface FormatMoneyOptions {
  /** Always show minor digits ("$240.00"). Default: only when the amount has a fraction. */
  forceDecimals?: boolean;
  /** Use "1.2M" style for large values (summary cards, hero totals). */
  compact?: boolean;
  /** Omit the symbol / code. */
  bare?: boolean;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function compactNumber(value: number): string {
  const abs = Math.abs(value);
  const units: [number, string][] = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const scaled = Math.round((value / size) * 10) / 10;
      return `${scaled.toString()}${suffix}`;
    }
  }
  return groupThousands(Math.trunc(value).toString());
}

/** Format integer minor units as a human string. Pure string maths — no float rounding errors. */
export function formatMoney(
  amountMinor: number,
  currency: string,
  options: FormatMoneyOptions = {},
): string {
  if (!Number.isInteger(amountMinor)) {
    throw new Error(`amountMinor must be an integer, got ${amountMinor}`);
  }
  const code = currency.toUpperCase();
  const exponent = minorUnits(code);
  const negative = amountMinor < 0;
  const abs = Math.abs(amountMinor);

  let number: string;
  if (options.compact && abs / 10 ** exponent >= 10_000) {
    number = compactNumber(abs / 10 ** exponent);
  } else {
    const divisor = 10 ** exponent;
    const whole = Math.floor(abs / divisor);
    const fraction = abs % divisor;
    number = groupThousands(whole.toString());
    if (exponent > 0 && (fraction > 0 || options.forceDecimals)) {
      number += `.${fraction.toString().padStart(exponent, '0')}`;
    }
  }

  const sign = negative ? '-' : '';
  if (options.bare) return `${sign}${number}`;
  const symbol = currencySymbol(code);
  return symbol ? `${sign}${symbol}${number}` : `${sign}${number} ${code}`;
}

/**
 * Parse user input ("1,523.5", "18 880") into minor units. Returns null when invalid.
 * Works on the string so 0.1 + 0.2 style float errors can't creep in.
 */
export function parseMoneyInput(input: string, currency: string): number | null {
  const exponent = minorUnits(currency);
  const cleaned = input.replace(/[\s,]/g, '');
  if (!/^\d+(\.\d*)?$/.test(cleaned)) return null;
  const [whole = '0', fraction = ''] = cleaned.split('.');
  if (fraction.length > exponent) return null;
  const minor = Number(whole) * 10 ** exponent + Number(fraction.padEnd(exponent, '0') || '0');
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Inverse of parseMoneyInput for prefilling inputs ("240.00"). */
export function minorToInput(amountMinor: number, currency: string): string {
  return formatMoney(amountMinor, currency, { bare: true, forceDecimals: true }).replace(/,/g, '');
}
