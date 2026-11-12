import type { Request } from 'express';

import type { AppContext } from '../context.js';
import { canAnywhere } from '../domain/access.js';
import { type WorkspaceAction } from '../domain/permissions.js';
import type { PaymentMethod, Prisma } from '../generated/prisma/client.js';
import { AppError, forbidden, notFound } from '../http/errors.js';
import { accessOf, actorOf, workspaceIdOf } from '../http/middleware/auth.js';
import { checkBudgetAlerts, upsertBudget } from '../modules/budgets/service.js';
import { recordPayment } from '../modules/payments/service.js';
import { createBill, loadBill, setArchived, snooze, updateBill, workspaceToday } from '../modules/bills/service.js';
import { audit } from '../modules/workspaces/service.js';
import { prefsFor } from '../notifications/store.js';

import type { ActionKind, Card } from './tools.js';

/**
 * Runs an action DueOra AI proposed, after the user tapped Confirm. Everything goes through
 * the same services and permission checks as the app's own screens, as the signed-in user.
 */
const NEEDS: Record<ActionKind, WorkspaceAction | null> = {
  add_bill: 'bills:manage',
  record_payment: 'payments:record',
  update_bill: 'bills:manage',
  archive: 'bills:manage',
  create_company: 'companies:manage',
  create_category: 'categories:manage',
  set_budget: 'budgets:manage',
  remember: 'bills:manage',
  // Personal: they only change the caller's own reminders.
  snooze: null,
  mute: null,
};

async function execute(ctx: AppContext, req: Request, card: Extract<Card, { type: 'action' }>): Promise<string> {
  const p = card.payload;
  const workspaceId = workspaceIdOf(req);
  switch (card.kind) {
    case 'add_bill': {
      let companyId = p.companyId as string | null;
      if (!companyId && p.newCompanyName) {
        // Only admins create companies (same rule as the Companies screen).
        if (accessOf(req).workspaceRole !== 'ADMIN') throw forbidden('Only an admin can create a company.');
        const existing = await ctx.db.company.findFirst({ where: { workspaceId, name: String(p.newCompanyName) } });
        companyId = existing?.id ?? (await ctx.db.company.create({ data: { workspaceId, name: String(p.newCompanyName) } })).id;
      }
      const s = await createBill(ctx, req, {
        name: String(p.name),
        companyId: companyId!,
        categoryId: String(p.categoryId),
        provider: (p.provider as string | null) ?? null,
        amountCents: Number(p.amountCents),
        frequencyUnit: p.frequencyUnit as 'WEEK' | 'MONTH' | 'YEAR' | 'ONCE',
        frequencyInterval: Number(p.frequencyInterval),
        startDate: String(p.startDate),
        nextDueDate: String(p.nextDueDate),
        autoRenew: p.autoRenew === true,
        isTrial: p.isTrial === true,
        trialEndsOn: (p.trialEndsOn as string | null) ?? null,
      });
      return `Added ${s.company.name} · ${s.name} ✅ — next due ${s.nextDueDate}.`;
    }
    case 'record_payment': {
      const r = await recordPayment(ctx, req, String(p.billId), {
        amountCents: Number(p.amountCents),
        paidOn: String(p.paidOn),
        ...(p.method ? { method: p.method as PaymentMethod } : {}),
      });
      return r.cycleCompleted
        ? `Payment recorded ✅ Next due: ${r.bill.nextDueDate}.`
        : `Payment recorded ✅ ${(r.bill.remainingCents / 100).toFixed(2)} USD is still open on this cycle.`;
    }
    case 'update_bill': {
      const s = await updateBill(ctx, req, String(p.billId), p.changes as Record<string, never>);
      return `Updated ${s.company.name} · ${s.name} ✅`;
    }
    case 'snooze': {
      const r = await snooze(ctx, req, String(p.billId), { days: Number(p.days) });
      return `Snoozed until ${r.snoozedUntil} 😴`;
    }
    case 'mute': {
      const s = await loadBill(ctx, req, String(p.billId));
      const userId = actorOf(req).userId;
      const prefs = await prefsFor(ctx, userId, workspaceId);
      if (p.muted) prefs.muted.add(s.id);
      else prefs.muted.delete(s.id);
      await ctx.db.notificationPreference.upsert({
        where: { userId_workspaceId: { userId, workspaceId } },
        update: { mutedBillIds: [...prefs.muted] },
        create: { userId, workspaceId, mutedBillIds: [...prefs.muted] },
      });
      return p.muted ? 'Muted for you 🔕' : 'Reminders are back on 🔔';
    }
    case 'archive': {
      const s = await setArchived(ctx, req, String(p.billId), true);
      return `Archived ${s.name}. Its history is kept.`;
    }
    case 'create_company': {
      const name = String(p.name);
      if (await ctx.db.company.findFirst({ where: { workspaceId, name } })) throw new AppError(409, 'CONFLICT', 'A company with this name already exists');
      const c = await ctx.db.company.create({ data: { workspaceId, name } });
      await audit(ctx, workspaceId, actorOf(req).userId, 'company.create', 'Company', c.id, { name, via: 'ai' });
      return `Created the company "${name}" ✅`;
    }
    case 'create_category': {
      const name = String(p.name);
      if (await ctx.db.category.findFirst({ where: { name, OR: [{ workspaceId }, { workspaceId: null }] } })) throw new AppError(409, 'CONFLICT', 'That category already exists');
      await ctx.db.category.create({ data: { workspaceId, name, icon: 'tag', color: '#667373' } });
      return `Created the category "${name}" ✅`;
    }
    case 'set_budget': {
      await upsertBudget(ctx, workspaceId, { categoryId: (p.categoryId as string | null) ?? null, monthlyLimitCents: Number(p.monthlyLimitCents), alertAtPercent: Number(p.alertAtPercent) });
      await checkBudgetAlerts(ctx, workspaceId, workspaceToday(ctx, req));
      return 'Budget saved 📊';
    }
    case 'remember': {
      await ctx.db.aiMemory.create({ data: { workspaceId, text: String(p.fact), createdBy: actorOf(req).userId, createdAt: ctx.clock.now() } });
      return 'Got it — I’ll remember that 🧠';
    }
  }
}

/** Confirm or cancel a pending action card on one of the user's own AI messages. */
export async function resolveAction(ctx: AppContext, req: Request, messageId: string, actionId: string, decision: 'confirm' | 'cancel') {
  const workspaceId = workspaceIdOf(req);
  const userId = actorOf(req).userId;
  const message = await ctx.db.aiMessage.findFirst({
    where: { id: messageId, role: 'ASSISTANT', conversation: { workspaceId, userId } },
  });
  if (!message) throw notFound('Message');
  const cards = message.cards as unknown as Card[];
  const card = cards.find((c): c is Extract<Card, { type: 'action' }> => c.type === 'action' && c.id === actionId);
  if (!card) throw notFound('Action');
  if (card.status !== 'pending') throw new AppError(409, 'ALREADY_RESOLVED', 'This action was already handled');

  if (decision === 'cancel') {
    card.status = 'cancelled';
  } else {
    const need = NEEDS[card.kind];
    if (need && !canAnywhere(accessOf(req), need)) throw forbidden('Your role can’t make this change. Ask an admin or finance member.');
    try {
      card.result = await execute(ctx, req, card);
      card.status = 'confirmed';
    } catch (err) {
      card.status = 'failed';
      card.result = err instanceof AppError ? err.message : 'That didn’t work. Please try again in the app.';
      if (!(err instanceof AppError)) ctx.logger.error({ err, kind: card.kind }, 'AI action failed');
    }
  }
  await ctx.db.aiMessage.update({ where: { id: message.id }, data: { cards: cards as unknown as Prisma.InputJsonValue } });
  return card;
}
