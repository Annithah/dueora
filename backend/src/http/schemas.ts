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

/** US dollars as integer cents; guards against floats and absurd values. */
export const amountCents = z
  .number()
  .int('Amount must be in cents (integer)')
  .positive('Amount must be greater than zero')
  .max(2_000_000_000, 'Amount is too large');

export const reminderOffsets = z
  .array(z.number().int().min(-365).max(365))
  .max(20)
  .transform((arr) => [...new Set(arr)].sort((a, b) => b - a));

export const minutesOfDay = z.number().int().min(0).max(1439);

/** Every list in DueOra pages 10 items at a time unless the client asks otherwise (max 50). */
export const PAGE_SIZE = 10;

export const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(PAGE_SIZE),
});

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export function pageOf<T>(items: T[], total: number, page: number, limit: number): Page<T> {
  return { items, page, limit, total, hasMore: page * limit < total };
}

/** Slice an already filtered and sorted array into one page. */
export function slicePage<T>(all: T[], page: number, limit: number): Page<T> {
  return pageOf(all.slice((page - 1) * limit, page * limit), all.length, page, limit);
}

/** "a,b,c" query value → ["A","B","C"] validated against an enum. */
export function csvEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : undefined))
    .pipe(z.array(z.enum(values)).optional());
}
