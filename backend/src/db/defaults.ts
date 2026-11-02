import type { Db } from './client.js';

/** Org-level default reminder offsets (days; negative = after the due date). */
export const DEFAULT_REMINDER_OFFSETS = [30, 14, 7, 3, 1, 0, -1, -3, -7] as const;

/**
 * Built-in categories shared by every organization (organizationId = null).
 * Icon keys match mobile/src/theme/categories.ts.
 */
export const DEFAULT_CATEGORIES = [
  { name: 'Technology & software', icon: 'cpu', color: '#147070' },
  { name: 'Hosting & domains', icon: 'server', color: '#0F5C5C' },
  { name: 'Communication & internet', icon: 'wifi', color: '#6D36CC' },
  { name: 'Office', icon: 'house', color: '#A35900' },
  { name: 'Insurance', icon: 'shield', color: '#157A53' },
  { name: 'Marketing', icon: 'megaphone', color: '#BB4109' },
  { name: 'Utilities', icon: 'bulb', color: '#A35900' },
  { name: 'Other', icon: 'tag', color: '#667373' },
] as const;

/** Idempotently create the built-in categories; returns them keyed by name. */
export async function ensureDefaultCategories(db: Db) {
  const byName = new Map<string, { id: string; name: string }>();
  for (const c of DEFAULT_CATEGORIES) {
    const existing = await db.category.findFirst({ where: { organizationId: null, name: c.name } });
    const row = existing ?? (await db.category.create({ data: { ...c, isDefault: true, organizationId: null } }));
    byName.set(row.name, row);
  }
  return byName;
}
