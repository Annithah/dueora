import type { AppContext } from '../../context.js';
import { paidForCycle, todayIn } from '../../domain/schedule.js';
import { badRequest, notFound } from '../../http/errors.js';
import { notifyBudgetAlert } from '../../notifications/events.js';
import { monthRange, occurrencesBetween } from '../insights/projection.js';

/**
 * Monthly budgets. "Spent" for a month = what was paid in that month + what is still
 * due in it (unpaid parts of cycles whose due date falls in the month). That is the
 * amount the month will cost, so an alert can warn *before* the money is gone.
 */
export interface BudgetProgress {
  id: string;
  categoryId: string | null;
  category: { id: string; name: string; icon: string; color: string } | null;
  monthlyLimitCents: number;
  alertAtPercent: number;
  month: string;
  paidCents: number;
  dueCents: number;
  spentCents: number;
  percent: number;
  state: 'OK' | 'WARNING' | 'OVER';
}

/** Paid and still-due cents in the month containing `today`, per category id (and "all"). */
export async function monthSpending(ctx: AppContext, workspaceId: string, today: string) {
  const { from, to } = monthRange(today);
  const [payments, subs] = await Promise.all([
    ctx.db.paymentRecord.findMany({
      where: { workspaceId, paidOn: { gte: from, lte: to } },
      select: { amountCents: true, bill: { select: { categoryId: true } } },
    }),
    ctx.db.bill.findMany({
      where: { workspaceId, status: 'ACTIVE' },
      select: { id: true, categoryId: true, status: true, nextDueDate: true, frequencyUnit: true, frequencyInterval: true, anchorDay: true, amountCents: true },
    }),
  ]);
  const open = subs.length
    ? await ctx.db.paymentRecord.findMany({
        where: { workspaceId, OR: subs.map((s) => ({ billId: s.id, cycleDueDate: s.nextDueDate })) },
        select: { billId: true, cycleDueDate: true, amountCents: true },
      })
    : [];

  const paid = new Map<string, number>();
  const due = new Map<string, number>();
  const add = (m: Map<string, number>, key: string, v: number) => m.set(key, (m.get(key) ?? 0) + v);
  for (const p of payments) {
    add(paid, 'all', p.amountCents);
    add(paid, p.bill.categoryId, p.amountCents);
  }
  for (const s of subs) {
    for (const occ of occurrencesBetween(s, from, to)) {
      const amount =
        occ.kind === 'current'
          ? Math.max(0, s.amountCents - paidForCycle(open.filter((p) => p.billId === s.id), s.nextDueDate))
          : s.amountCents;
      add(due, 'all', amount);
      add(due, s.categoryId, amount);
    }
  }
  return { month: today.slice(0, 7), paid, due };
}

export async function budgetProgress(ctx: AppContext, workspaceId: string, today: string): Promise<BudgetProgress[]> {
  const budgets = await ctx.db.budget.findMany({
    where: { workspaceId },
    include: { category: { select: { id: true, name: true, icon: true, color: true } } },
    orderBy: [{ categoryId: 'asc' }, { createdAt: 'asc' }],
  });
  if (budgets.length === 0) return [];
  const { month, paid, due } = await monthSpending(ctx, workspaceId, today);
  return budgets
    .map((b) => {
      const key = b.categoryId ?? 'all';
      const paidCents = paid.get(key) ?? 0;
      const dueCents = due.get(key) ?? 0;
      const spentCents = paidCents + dueCents;
      // Rounded down and compared exactly, so 79.98% never shows as (or alerts at) 80%.
      const percent = b.monthlyLimitCents > 0 ? Math.floor((spentCents * 100) / b.monthlyLimitCents) : 0;
      const state: BudgetProgress['state'] = percent >= 100 ? 'OVER' : percent >= b.alertAtPercent ? 'WARNING' : 'OK';
      return {
        id: b.id,
        categoryId: b.categoryId,
        category: b.category,
        monthlyLimitCents: b.monthlyLimitCents,
        alertAtPercent: b.alertAtPercent,
        month,
        paidCents,
        dueCents,
        spentCents,
        percent,
        state,
      };
    })
    .sort((a, b) => Number(a.categoryId !== null) - Number(b.categoryId !== null));
}

export interface BudgetInput {
  categoryId: string | null;
  monthlyLimitCents: number;
  alertAtPercent?: number;
}

/** Create or replace the budget for a scope (the workspace, or one category). */
export async function upsertBudget(ctx: AppContext, workspaceId: string, input: BudgetInput) {
  if (input.categoryId) {
    const category = await ctx.db.category.findFirst({ where: { id: input.categoryId, OR: [{ workspaceId }, { workspaceId: null }] } });
    if (!category) throw badRequest('Choose a category from the list');
  }
  const scope = input.categoryId ?? 'all';
  return ctx.db.budget.upsert({
    where: { workspaceId_scope: { workspaceId, scope } },
    create: { workspaceId, scope, categoryId: input.categoryId, monthlyLimitCents: input.monthlyLimitCents, alertAtPercent: input.alertAtPercent ?? 80 },
    update: { monthlyLimitCents: input.monthlyLimitCents, ...(input.alertAtPercent !== undefined ? { alertAtPercent: input.alertAtPercent } : {}) },
  });
}

export async function deleteBudget(ctx: AppContext, workspaceId: string, id: string) {
  const b = await ctx.db.budget.findFirst({ where: { id, workspaceId } });
  if (!b) throw notFound('Budget');
  await ctx.db.budget.delete({ where: { id } });
}

/**
 * Send BUDGET_ALERT once when a budget reaches its alert percentage and once more at
 * 100%, per month. Dedupe keys include the month and the threshold, so re-running is safe.
 */
export async function checkBudgetAlerts(ctx: AppContext, workspaceId: string, today?: string): Promise<number> {
  const workspace = await ctx.db.workspace.findUnique({ where: { id: workspaceId }, select: { timezone: true } });
  if (!workspace) return 0;
  const date = today ?? todayIn(ctx.clock.now(), workspace.timezone);
  let sent = 0;
  for (const b of await budgetProgress(ctx, workspaceId, date)) {
    const thresholds = [b.alertAtPercent, 100].filter((t, i, arr) => arr.indexOf(t) === i && b.percent >= t);
    // Only the highest threshold crossed: reaching 100% at once doesn't also send the 80% alert.
    const threshold = thresholds.at(-1);
    if (threshold === undefined) continue;
    sent += await notifyBudgetAlert(ctx, {
      workspaceId,
      budgetId: b.id,
      month: b.month,
      threshold,
      percent: b.percent,
      categoryName: b.category?.name ?? null,
    });
  }
  return sent;
}
