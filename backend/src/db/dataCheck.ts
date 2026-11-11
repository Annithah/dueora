import type { Db } from './client.js';
import { DEFAULT_CATEGORIES } from './defaults.js';

export interface DataCheck {
  ok: boolean;
  /** Row counts for tables that must be empty before anyone signs up. */
  counts: Record<string, number>;
  defaultCategories: number;
  customCategories: number;
}

/**
 * Proves a freshly set-up database holds only the default categories — no demo users,
 * workspaces, companies, bills or payments (DueOra never seeds sample data).
 */
export async function checkOnlyDefaults(db: Db): Promise<DataCheck> {
  const counts = {
    users: await db.user.count(),
    workspaces: await db.workspace.count(),
    companies: await db.company.count(),
    bills: await db.bill.count(),
    payments: await db.paymentRecord.count(),
    notifications: await db.notification.count(),
  };
  const defaultCategories = await db.category.count({ where: { workspaceId: null, isDefault: true } });
  const customCategories = await db.category.count({ where: { OR: [{ workspaceId: { not: null } }, { isDefault: false }] } });
  const ok =
    Object.values(counts).every((n) => n === 0) && defaultCategories === DEFAULT_CATEGORIES.length && customCategories === 0;
  return { ok, counts, defaultCategories, customCategories };
}
