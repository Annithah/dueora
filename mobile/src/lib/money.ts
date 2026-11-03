/**
 * DueOra works only in US dollars. Money is always an integer number of cents (never floats)
 * and is shown like "$1,234.56".
 */

export interface FormatUSDOptions {
  /** Use "$12.5K" style for large values (summary cards, chart axes). */
  compact?: boolean;
  /** Drop ".00" when the amount is whole dollars (chart labels). */
  trimZeroCents?: boolean;
  /** Omit the "$". */
  bare?: boolean;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function compactNumber(dollars: number): string {
  const units: [number, string][] = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [size, suffix] of units) {
    if (dollars >= size) return `${Math.round((dollars / size) * 10) / 10}${suffix}`;
  }
  return groupThousands(Math.trunc(dollars).toString());
}

/** Integer cents → "$1,234.56". Pure string maths — no float rounding errors. */
export function formatUSD(cents: number, options: FormatUSDOptions = {}): string {
  if (!Number.isInteger(cents)) throw new Error(`cents must be an integer, got ${cents}`);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;

  let number: string;
  if (options.compact && whole >= 10_000) {
    number = compactNumber(abs / 100);
  } else {
    number = groupThousands(whole.toString());
    if (!(options.trimZeroCents && fraction === 0)) number += `.${fraction.toString().padStart(2, '0')}`;
  }
  return `${negative ? '-' : ''}${options.bare ? '' : '$'}${number}`;
}

/**
 * Parse what someone typed ("1,234.5", "$ 18 880") into cents. Returns null when invalid.
 * Works on the string so 0.1 + 0.2 style float errors can't creep in.
 */
export function parseUSDInput(input: string): number | null {
  const cleaned = input.replace(/[\s,$]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole = '0', fraction = ''] = cleaned.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0') || '0');
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Inverse of parseUSDInput for prefilling inputs: 24000 → "240.00". */
export function centsToInput(cents: number): string {
  return formatUSD(cents, { bare: true }).replace(/,/g, '');
}
