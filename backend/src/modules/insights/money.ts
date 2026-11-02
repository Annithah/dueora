import { Prisma } from '../../generated/prisma/client.js';
import { minorUnits } from '../../lib/format.js';

/** Totals kept per currency; never mixed without an explicit rate. */
export type CurrencyTotals = Record<string, number>;

export function addTo(totals: CurrencyTotals, currency: string, amountMinor: number): void {
  totals[currency] = (totals[currency] ?? 0) + amountMinor;
}

export function totalsList(totals: CurrencyTotals): { currency: string; amountMinor: number }[] {
  return Object.entries(totals)
    .filter(([, v]) => v !== 0)
    .map(([currency, amountMinor]) => ({ currency, amountMinor }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
}

/**
 * Converts between currencies with the workspace's own rates
 * (1 unit of `from` = `rate` units of the default currency). Decimal maths; the
 * result is rounded to the default currency's minor unit.
 */
export class Converter {
  private readonly rates = new Map<string, Prisma.Decimal>();
  readonly missing = new Set<string>();

  constructor(
    readonly defaultCurrency: string,
    rates: { fromCurrency: string; rate: Prisma.Decimal }[],
  ) {
    for (const r of rates) this.rates.set(r.fromCurrency, r.rate);
  }

  /** Minor units in the default currency, or null when there's no rate. */
  convert(amountMinor: number, currency: string): number | null {
    if (currency === this.defaultCurrency) return amountMinor;
    const rate = this.rates.get(currency);
    if (!rate) {
      this.missing.add(currency);
      return null;
    }
    const major = new Prisma.Decimal(amountMinor).div(new Prisma.Decimal(10).pow(minorUnits(currency)));
    return major
      .mul(rate)
      .mul(new Prisma.Decimal(10).pow(minorUnits(this.defaultCurrency)))
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
      .toNumber();
  }

  /** Sum of every currency converted; currencies without a rate are left out (see `missing`). */
  total(totals: CurrencyTotals): number {
    let sum = 0;
    for (const [currency, amount] of Object.entries(totals)) sum += this.convert(amount, currency) ?? 0;
    return sum;
  }

  /** A per-currency block plus its converted total, as the dashboard cards show it. */
  summary(totals: CurrencyTotals, count: number) {
    return {
      count,
      totals: totalsList(totals),
      converted: { currency: this.defaultCurrency, amountMinor: this.total(totals) },
    };
  }
}
