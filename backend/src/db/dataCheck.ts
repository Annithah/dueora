import type { Db } from './client.js';

export interface DataCheck {
  ok: boolean;
  /** Row counts for tables that must be empty before anyone signs up. */
  counts: Record<string, number>;
}

/**
 * Proves a freshly set-up database is empty — no demo users, workspaces, companies,
 * categories, bills or payments (DueOra never seeds data; category names are suggestions).
 */
export async function checkOnlyDefaults(db: Db): Promise<DataCheck> {
  const counts = {
    users: await db.user.count(),
    workspaces: await db.workspace.count(),
    companies: await db.company.count(),
    categories: await db.category.count(),
    bills: await db.bill.count(),
    payments: await db.paymentRecord.count(),
    notifications: await db.notification.count(),
  };
  return { ok: Object.values(counts).every((n) => n === 0), counts };
}
