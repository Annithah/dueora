import type { Request } from 'express';

import type { AppContext } from '../../context.js';
import { can, canRecordPayment, canViewObligation } from '../../domain/permissions.js';
import type { PaymentMethod, Prisma } from '../../generated/prisma/client.js';
import { AppError, badRequest, forbidden, notFound } from '../../http/errors.js';
import { actorOf, orgIdOf } from '../../http/middleware/auth.js';
import { loadObligation, orgToday, viewsFor } from '../obligations/service.js';
import { obligationInclude } from '../obligations/view.js';
import { audit } from '../workspaces/service.js';

import { reconcileCycle, type CycleChange } from './cycle.js';

/** Hook for side effects after a payment is recorded (notifications, Phase 6). */
export type PaymentRecordedListener = (ctx: AppContext, event: PaymentRecordedEvent) => Promise<void>;

export interface PaymentRecordedEvent {
  organizationId: string;
  obligationId: string;
  paymentId: string;
  recordedById: string;
  amountMinor: number;
  currency: string;
  cycleDueDate: string;
  change: CycleChange;
}

const listeners: PaymentRecordedListener[] = [];
export function onPaymentRecorded(listener: PaymentRecordedListener): void {
  listeners.push(listener);
}

export interface RecordInput {
  amountMinor?: number;
  currency?: string;
  paidOn?: string;
  method: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
}

const paymentInclude = {
  recordedBy: { select: { id: true, name: true } },
  attachments: { select: { id: true, fileName: true, mimeType: true, size: true } },
  obligation: { include: obligationInclude },
} satisfies Prisma.PaymentRecordInclude;

type PaymentWithRelations = Prisma.PaymentRecordGetPayload<{ include: typeof paymentInclude }>;

export function paymentView(p: PaymentWithRelations) {
  return {
    id: p.id,
    obligationId: p.obligationId,
    cycleDueDate: p.cycleDueDate,
    amountMinor: p.amountMinor,
    currency: p.currency,
    paidOn: p.paidOn,
    method: p.method,
    reference: p.reference,
    notes: p.notes,
    recordedBy: p.recordedBy,
    attachments: p.attachments,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    obligation: {
      id: p.obligation.id,
      name: p.obligation.name,
      provider: p.obligation.provider,
      icon: p.obligation.icon ?? p.obligation.category.icon,
      platform: p.obligation.platform,
      category: p.obligation.category,
    },
  };
}

/** Record a full or partial payment against the obligation's current cycle. */
export async function recordPayment(ctx: AppContext, req: Request, obligationId: string, input: RecordInput) {
  const orgId = orgIdOf(req);
  const actor = actorOf(req);
  const o = await loadObligation(ctx, req, obligationId, 'view');
  if (!canRecordPayment(actor, o)) throw forbidden('You can view this payment but not record it');
  if (o.status === 'ARCHIVED') throw badRequest('Unarchive this payment before recording');
  if (o.status === 'COMPLETED') throw new AppError(409, 'ALREADY_PAID', 'This one-time payment is already fully paid');
  if (input.currency && input.currency !== o.currency) {
    throw badRequest(`Record the payment in ${o.currency}, the currency of this obligation`);
  }
  const today = orgToday(ctx, req);
  if (input.paidOn && input.paidOn > today) throw badRequest('The payment date cannot be in the future');

  const cycleDueDate = o.nextDueDate;
  const { payment, change } = await ctx.db.$transaction(async (tx) => {
    const paid = await tx.paymentRecord.aggregate({ where: { obligationId, cycleDueDate }, _sum: { amountMinor: true } });
    const remaining = Math.max(0, o.amountMinor - (paid._sum.amountMinor ?? 0));
    const amountMinor = input.amountMinor ?? remaining;
    if (amountMinor <= 0) throw badRequest('Enter an amount greater than zero');
    const created = await tx.paymentRecord.create({
      data: {
        organizationId: orgId,
        obligationId,
        cycleDueDate,
        amountMinor,
        currency: o.currency,
        paidOn: input.paidOn ?? today,
        method: input.method,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        recordedById: actor.userId,
        createdAt: ctx.clock.now(),
      },
    });
    return { payment: created, change: await reconcileCycle(tx, obligationId) };
  });

  await audit(ctx, orgId, actor.userId, 'payment.record', 'PaymentRecord', payment.id, {
    obligationId,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    cycleDueDate,
    completedCycle: change.completedCycle,
  });

  const event: PaymentRecordedEvent = {
    organizationId: orgId,
    obligationId,
    paymentId: payment.id,
    recordedById: actor.userId,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    cycleDueDate,
    change,
  };
  for (const listener of listeners) {
    try {
      await listener(ctx, event);
    } catch (err) {
      ctx.logger.error({ err, paymentId: payment.id }, 'payment listener failed');
    }
  }

  return result(ctx, req, payment.id, obligationId, change);
}

async function result(ctx: AppContext, req: Request, paymentId: string, obligationId: string, change: CycleChange) {
  const [payment, obligation] = await Promise.all([
    ctx.db.paymentRecord.findUniqueOrThrow({ where: { id: paymentId }, include: paymentInclude }),
    ctx.db.obligation.findUniqueOrThrow({ where: { id: obligationId }, include: obligationInclude }),
  ]);
  const [view] = await viewsFor(ctx, orgIdOf(req), [obligation], orgToday(ctx, req));
  return { payment: paymentView(payment), obligation: view!, cycleCompleted: change.completedCycle !== null, cycleReopened: change.reopenedCycle !== null };
}

/** Load a payment in this workspace that the caller may see. */
async function loadPayment(ctx: AppContext, req: Request, id: string) {
  const p = await ctx.db.paymentRecord.findFirst({ where: { id, organizationId: orgIdOf(req) }, include: paymentInclude });
  if (!p || !canViewObligation(actorOf(req), p.obligation)) throw notFound('Payment');
  return p;
}

export async function getPayment(ctx: AppContext, req: Request, id: string) {
  return paymentView(await loadPayment(ctx, req, id));
}

export interface EditInput {
  amountMinor?: number;
  paidOn?: string;
  method?: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
}

/** ADMIN/FINANCE only: correct a payment and recalculate the obligation's cycle. */
export async function editPayment(ctx: AppContext, req: Request, id: string, input: EditInput) {
  const actor = actorOf(req);
  const before = await loadPayment(ctx, req, id); // 404 before 403: don't reveal hidden payments
  if (!can(actor.role, 'payments:edit')) throw forbidden('Only admins and finance can edit payments');
  if (input.paidOn && input.paidOn > orgToday(ctx, req)) throw badRequest('The payment date cannot be in the future');

  const change = await ctx.db.$transaction(async (tx) => {
    await tx.paymentRecord.update({ where: { id }, data: input });
    return reconcileCycle(tx, before.obligationId, before.cycleDueDate);
  });
  await audit(ctx, orgIdOf(req), actor.userId, 'payment.update', 'PaymentRecord', id, {
    before: { amountMinor: before.amountMinor, paidOn: before.paidOn, method: before.method, reference: before.reference },
    after: input,
    cycle: change,
  });
  return result(ctx, req, id, before.obligationId, change);
}

/** ADMIN/FINANCE only: remove a payment (and its receipts) and recalculate. */
export async function deletePayment(ctx: AppContext, req: Request, id: string) {
  const actor = actorOf(req);
  const before = await loadPayment(ctx, req, id);
  if (!can(actor.role, 'payments:edit')) throw forbidden('Only admins and finance can delete payments');
  const files = await ctx.db.attachment.findMany({ where: { paymentRecordId: id }, select: { fileKey: true } });

  const change = await ctx.db.$transaction(async (tx) => {
    await tx.paymentRecord.delete({ where: { id } });
    return reconcileCycle(tx, before.obligationId, before.cycleDueDate);
  });
  await Promise.allSettled(files.map((f) => ctx.storage.delete(f.fileKey)));
  await audit(ctx, orgIdOf(req), actor.userId, 'payment.delete', 'PaymentRecord', id, {
    obligationId: before.obligationId,
    amountMinor: before.amountMinor,
    currency: before.currency,
    cycleDueDate: before.cycleDueDate,
    paidOn: before.paidOn,
    cycle: change,
  });
  const obligation = await ctx.db.obligation.findUniqueOrThrow({ where: { id: before.obligationId }, include: obligationInclude });
  const [view] = await viewsFor(ctx, orgIdOf(req), [obligation], orgToday(ctx, req));
  return { obligation: view!, cycleReopened: change.reopenedCycle !== null };
}

export interface HistoryFilters {
  q?: string;
  from?: string;
  to?: string;
  categoryId?: string;
  platformId?: string;
  provider?: string;
  obligationId?: string;
  method?: PaymentMethod;
  page: number;
  pageSize: number;
}

/** Payment history across every cycle, newest first, with per-currency totals for the filter. */
export async function history(ctx: AppContext, req: Request, f: HistoryFilters) {
  const actor = actorOf(req);
  const orgId = orgIdOf(req);

  // Text matching is done here rather than in SQL so it is case-insensitive on both
  // SQLite and Postgres; a workspace has at most a few hundred obligations.
  let obligationIds: string[] | undefined;
  if (f.q || f.provider) {
    const candidates = await ctx.db.obligation.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, provider: true, platform: { select: { name: true } } },
    });
    const q = f.q?.toLowerCase();
    const provider = f.provider?.toLowerCase();
    obligationIds = candidates
      .filter((o) => !provider || o.provider.toLowerCase().includes(provider))
      .filter((o) => !q || [o.name, o.provider, o.platform?.name ?? ''].some((v) => v.toLowerCase().includes(q)))
      .map((o) => o.id);
  }

  const where: Prisma.PaymentRecordWhereInput = {
    organizationId: orgId,
    method: f.method,
    paidOn: { gte: f.from, lte: f.to },
    obligation: {
      categoryId: f.categoryId,
      platformId: f.platformId,
      ...(actor.role === 'EMPLOYEE' ? { assigneeUserId: actor.userId } : {}),
    },
    AND: [
      f.obligationId ? { obligationId: f.obligationId } : {},
      obligationIds && f.q
        ? { OR: [{ obligationId: { in: obligationIds } }, { reference: { contains: f.q } }] }
        : obligationIds
          ? { obligationId: { in: obligationIds } }
          : {},
    ],
  };

  const [rows, total, sums] = await Promise.all([
    ctx.db.paymentRecord.findMany({
      where,
      include: paymentInclude,
      orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
    }),
    ctx.db.paymentRecord.count({ where }),
    ctx.db.paymentRecord.groupBy({ by: ['currency'], where, _sum: { amountMinor: true }, _count: true }),
  ]);

  return {
    items: rows.map(paymentView),
    page: f.page,
    pageSize: f.pageSize,
    total,
    totals: sums
      .map((s) => ({ currency: s.currency, amountMinor: s._sum.amountMinor ?? 0, count: s._count }))
      .sort((a, b) => b.amountMinor - a.amountMinor),
  };
}
