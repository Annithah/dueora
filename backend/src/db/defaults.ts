import type { Db } from './client.js';

/** Workspace default reminder offsets (days; negative = after the due date). */
export const DEFAULT_REMINDER_OFFSETS = [30, 14, 7, 3, 1, 0, -1, -3, -7] as const;

/**
 * Built-in categories shared by every workspace (workspaceId = null).
 * This list is the ONLY seed data DueOra ever inserts. Icon keys match mobile/src/theme/categories.ts.
 */
export const DEFAULT_CATEGORIES = [
  { name: 'Technology & software', icon: 'cpu', color: '#147070' },
  { name: 'Hosting & domains', icon: 'server', color: '#0F5C5C' },
  { name: 'Communication & internet', icon: 'wifi', color: '#6D36CC' },
  { name: 'Social media', icon: 'share', color: '#C2410C' },
  { name: 'Office & rent', icon: 'house', color: '#A35900' },
  { name: 'Insurance', icon: 'shield', color: '#157A53' },
  { name: 'Marketing', icon: 'megaphone', color: '#BE185D' },
  { name: 'Utilities', icon: 'bulb', color: '#2469CF' },
  { name: 'Other', icon: 'tag', color: '#667373' },
] as const;

/** Idempotently create the built-in categories; returns them keyed by name. */
export async function ensureDefaultCategories(db: Db) {
  const byName = new Map<string, { id: string; name: string }>();
  for (const c of DEFAULT_CATEGORIES) {
    const existing = await db.category.findFirst({ where: { workspaceId: null, name: c.name } });
    const row = existing ?? (await db.category.create({ data: { ...c, isDefault: true, workspaceId: null } }));
    byName.set(row.name, row);
  }
  return byName;
}
