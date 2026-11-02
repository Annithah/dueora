import { z } from 'zod';

/** Shared zod building blocks for request validation. */

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((v) => {
    const [y, m, d] = v.split('-').map(Number) as [number, number, number];
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, 'Not a real date');

export const currency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Use a 3-letter ISO currency code');

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const timeZone = z.string().refine(isValidTimeZone, 'Unknown timezone');

export const id = z.string().min(1).max(64);

/** Trimmed before format validation so pasted addresses with spaces still work. */
export const email = z.string().trim().max(254).pipe(z.email('Enter a valid email address'));

/** Integer money in minor units; guards against floats and absurd values. */
export const amountMinor = z
  .number()
  .int('Amount must be in minor units (integer)')
  .positive('Amount must be greater than zero')
  .max(2_000_000_000, 'Amount is too large');

export const reminderOffsets = z
  .array(z.number().int().min(-365).max(365))
  .max(20)
  .transform((arr) => [...new Set(arr)].sort((a, b) => b - a));

export const minutesOfDay = z.number().int().min(0).max(1439);

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
