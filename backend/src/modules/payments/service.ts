import type { Request } from 'express';

import type { AppContext } from '../../context.js';
import type { PaymentMethod, Prisma } from '../../generated/prisma/client.js';
import { AppError, badRequest, notFound } from '../../http/errors.js';
import { actorOf, workspaceIdOf } from '../../http/middleware/auth.js';
import { pageOf } from '../../http/schemas.js';
import { notifyPaymentRecorded } from '../../notifications/paymentRecorded.js';
import { loadSubscription, viewsFor, workspaceToday } from '../subscriptions/service.js';
import { subscriptionInclude } from '../subscriptions/view.js';
import { audit } from '../workspaces/service.js';

import { reconcileCycle, type CycleChange } from './cycle.js';

export interface PaymentRecordedEvent {
  workspaceId: string;
  subscriptionId: string;
  paymentId: string;
  /** Who recorded it — used only to skip notifying that person; never stored or displayed. */
  actorUserId: string;
  amountCents: number;
  cycleDueDate: string;
  change: CycleChange;
}

export interface RecordInput {
  amountCents?: number;
  paidOn?: string;
  method: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
}

const paymentInclude = {
  subscription: {
    select: {
      id: true,
      name: true,
      provider: true,
      company: { select: { id: true, name: true, color: true } },
      category: { select: { id: true, name: true, icon: true, color: true } },
    },
  },
} satisfies Prisma.PaymentRecordInclude;

type PaymentWithRelations = Prisma.PaymentRecordGetPayload<{ include: typeof paymentInclude }>;

export function paymentView(p: PaymentWithRelations) {
  return {
    id: p.id,
    subscriptionId: p.subscriptionId,
    cycleDueDate: p.cycleDueDate,
    amountCents: p.amountCents,
    paidOn: p.paidOn,
    method: p.method,
    reference: p.reference,
    notes: p.notes,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    subscription: p.subscription,
  };
}

/** Record a full or partial payment against the subscription's current cycle. */
export async function recordPayment(ctx: AppContext, req: Request, subscriptionId: string, input: RecordInput) {
  const workspaceId = workspaceIdOf(req);
  const actor = actorOf(req);
  const s = await loadSubscription(ctx, req, subscriptionId);
  if (s.status === 'ARCHIVED') throw badRequest('Unarchive this subscription before recording a payment');
  if (s.status === 'COMPLETED') throw new AppError(409, 'ALREADY_PAID', 'This one-time subscription is already fully paid');
  const today = workspaceToday(ctx, req);
  if (input.paidOn && input.paidOn > today) throw badRequest('The payment date cannot be in the future');

  const cycleDueDate = s.nextDueDate;
  const { payment, change } = await ctx.db.$transaction(async (tx) => {
    const paid = await tx.paymentRecord.aggregate({ where: { subscriptionId, cycleDueDate }, _sum: { amountCents: true } });
    const remaining = Math.max(0, s.amountCents - (paid._sum.amountCents ?? 0));
    const amountCents = input.amountCents ?? remaining;
    if (amountCents <= 0) throw badRequest('Enter an amount greater than zero');
    const created = await tx.paymentRecord.create({
      data: {
        workspaceId,
        subscriptionId,
        cycleDueDate,
        amountCents,
        paidOn: input.paidOn ?? today,
        method: input.method,
        reference: input.reference || null,
        notes: input.notes || null,
        createdAt: ctx.clock.now(),
      },
    });
    return { payment: created, change: await reconcileCycle(tx, subscriptionId) };
  });

  await audit(ctx, workspaceId, actor.userId, 'payment.record', 'PaymentRecord', payment.id, {
    subscriptionId,
    amountCents: payment.amountCents,
    cycleDueDate,
    completedCycle: change.completedCycle,
  });

  try {
    await notifyPaymentRecorded(ctx, {
      workspaceId,
      subscriptionId,
      paymentId: payment.id,
      actorUserId: actor.userId,
      amountCents: payment.amountCents,
      cycleDueDate,
      change,
    });
  } catch (err) {
    // The payment is saved; a notification problem must not fail the request.
    ctx.logger.error({ err, paymentId: payment.id }, 'Payment-recorded notification failed');
  }

  return result(ctx, req, payment.id, subscriptionId, change);
}

async function result(ctx: AppContext, req: Request, paymentId: string, subscriptionId: string, change: CycleChange) {
  const [payment, subscription] = await Promise.all([
    ctx.db.paymentRecord.findUniqueOrThrow({ where: { id: paymentId }, include: paymentInclude }),
    ctx.db.subscription.findUniqueOrThrow({ where: { id: subscriptionId }, include: subscriptionInclude }),
  ]);
  const [view] = await viewsFor(ctx, workspaceIdOf(req), [subscription], workspaceToday(ctx, req));
  return {
    payment: paymentView(payment),
    subscription: view!,
    cycleCompleted: change.completedCycle !== null,
    cycleReopened: change.reopenedCycle !== null,
  };
}

/** Load a payment in this workspace (404 otherwise). */
async function loadPayment(ctx: AppContext, req: Request, id: string) {
  const p = await ctx.db.paymentRecord.findFirst({ where: { id, workspaceId: workspaceIdOf(req) }, include: paymentInclude });
  if (!p) throw notFound('Payment');
  return p;
}

export async function getPayment(ctx: AppContext, req: Request, id: string) {
  return paymentView(await loadPayment(ctx, req, id));
}

export interface EditInput {
  amountCents?: number;
  paidOn?: string;
  method?: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
}

/** ADMIN/FINANCE (route-guarded): correct a payment and recalculate the subscription's cycle. */
export async function editPayment(ctx: AppContext, req: Request, id: string, input: EditInput) {
  const before = await loadPayment(ctx, req, id);
  if (input.paidOn && input.paidOn > workspaceToday(ctx, req)) throw badRequest('The payment date cannot be in the future');

  const change = await ctx.db.$transaction(async (tx) => {
    await tx.paymentRecord.update({ where: { id }, data: input });
    return reconcileCycle(tx, before.subscriptionId, before.cycleDueDate);
  });
  await audit(ctx, workspaceIdOf(req), actorOf(req).userId, 'payment.update', 'PaymentRecord', id, {
    before: { amountCents: before.amountCents, paidOn: before.paidOn, method: before.method, reference: before.reference },
    after: input,
    cycle: change,
  });
  return result(ctx, req, id, before.subscriptionId, change);
}

/** ADMIN/FINANCE (route-guarded): remove a payment and recalculate. */
export async function deletePayment(ctx: AppContext, req: Request, id: string) {
  const before = await loadPayment(ctx, req, id);
  const change = await ctx.db.$transaction(async (tx) => {
    await tx.paymentRecord.delete({ where: { id } });
    return reconcileCycle(tx, before.subscriptionId, before.cycleDueDate);
  });
  await audit(ctx, workspaceIdOf(req), actorOf(req).userId, 'payment.delete', 'PaymentRecord', id, {
    subscriptionId: before.subscriptionId,
    amountCents: before.amountCents,
    cycleDueDate: before.cycleDueDate,
    paidOn: before.paidOn,
    cycle: change,
  });
  const subscription = await ctx.db.subscription.findUniqueOrThrow({
    where: { id: before.subscriptionId },
    include: subscriptionInclude,
  });
  const [view] = await viewsFor(ctx, workspaceIdOf(req), [subscription], workspaceToday(ctx, req));
  return { subscription: view!, cycleReopened: change.reopenedCycle !== null };
}

export const HISTORY_SORTS = ['paid_desc', 'paid_asc', 'amount_desc', 'amount_asc'] as const;
export type HistorySort = (typeof HISTORY_SORTS)[number];

const HISTORY_ORDER: Record<HistorySort, Prisma.PaymentRecordOrderByWithRelationInput[]> = {
  paid_desc: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
  paid_asc: [{ paidOn: 'asc' }, { createdAt: 'asc' }],
  amount_desc: [{ amountCents: 'desc' }, { paidOn: 'desc' }],
  amount_asc: [{ amountCents: 'asc' }, { paidOn: 'desc' }],
};

export interface HistoryFilters {
  q?: string;
  from?: string;
  to?: string;
  companyIds?: string[];
  categoryIds?: string[];
  subscriptionId?: string;
  method?: PaymentMethod;
  sort: HistorySort;
  page: number;
  limit: number;
}

/**
 * Payment history across every cycle (never lost when a new cycle begins), 10 per page,
 * newest first by default, with the USD total of everything matching the filter.
 */
export async function history(ctx: AppContext, req: Request, f: HistoryFilters) {
  const workspaceId = workspaceIdOf(req);

  // Text matching runs here rather than in SQL so it's case-insensitive on SQLite and
  // Postgres alike; a workspace has at most a few hundred subscriptions.
  let matchingSubscriptionIds: string[] | undefined;
  if (f.q) {
    const q = f.q.toLowerCase();
    const candidates = await ctx.db.subscription.findMany({
      where: { workspaceId },
      select: { id: true, name: true, provider: true, company: { select: { name: true } }, category: { select: { name: true } } },
    });
    matchingSubscriptionIds = candidates
      .filter((s) => [s.name, s.provider ?? '', s.company.name, s.category.name].some((v) => v.toLowerCase().includes(q)))
      .map((s) => s.id);
  }

  const where: Prisma.PaymentRecordWhereInput = {
    workspaceId,
    method: f.method,
    paidOn: { gte: f.from, lte: f.to },
    subscription: {
      ...(f.companyIds?.length ? { companyId: { in: f.companyIds } } : {}),
      ...(f.categoryIds?.length ? { categoryId: { in: f.categoryIds } } : {}),
    },
    AND: [
      f.subscriptionId ? { subscriptionId: f.subscriptionId } : {},
      matchingSubscriptionIds && f.q
        ? { OR: [{ subscriptionId: { in: matchingSubscriptionIds } }, { reference: { contains: f.q } }] }
        : {},
    ],
  };

  const [rows, total, sum] = await Promise.all([
    ctx.db.paymentRecord.findMany({
      where,
      include: paymentInclude,
      orderBy: HISTORY_ORDER[f.sort],
      skip: (f.page - 1) * f.limit,
      take: f.limit,
    }),
    ctx.db.paymentRecord.count({ where }),
    ctx.db.paymentRecord.aggregate({ where, _sum: { amountCents: true } }),
  ]);

  return { ...pageOf(rows.map(paymentView), total, f.page, f.limit), totalCents: sum._sum.amountCents ?? 0 };
}
