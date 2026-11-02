import type { Request } from 'express';

import type { AppContext } from '../../context.js';
import {
  canCreateObligationIn,
  canManageObligation,
  canViewObligation,
  type Actor,
} from '../../domain/permissions.js';
import { parseDate, reminderDates, reminderSchedule, todayIn, type PaymentStatus } from '../../domain/schedule.js';
import type { FrequencyUnit, Prisma } from '../../generated/prisma/client.js';
import { AppError, badRequest, forbidden, notFound } from '../../http/errors.js';
import { actorOf, orgIdOf } from '../../http/middleware/auth.js';
import { audit } from '../workspaces/service.js';

import { obligationInclude, obligationView, type ObligationView, type ObligationWithRelations } from './view.js';

/** Today in the request's workspace timezone. */
export function orgToday(ctx: AppContext, req: Request): string {
  if (!req.org) throw new Error('requireOrg must run first');
  return todayIn(ctx.clock.now(), req.org.timezone);
}

/**
 * Load an obligation the caller may see. Anything outside their workspace — or, for
 * employees, not assigned to them — is a 404 so ids can't be probed.
 */
export async function loadObligation(ctx: AppContext, req: Request, id: string, need: 'view' | 'manage') {
  const o = await ctx.db.obligation.findFirst({
    where: { id, organizationId: orgIdOf(req) },
    include: obligationInclude,
  });
  const actor = actorOf(req);
  if (!o || !canViewObligation(actor, o)) throw notFound('Obligation');
  if (need === 'manage' && !canManageObligation(actor, o)) throw forbidden();
  return o;
}

/** Payments for the current cycle of each obligation (for status computation). */
async function currentCyclePayments(ctx: AppContext, orgId: string, obligations: { id: string; nextDueDate: string }[]) {
  if (obligations.length === 0) return new Map<string, { cycleDueDate: string; amountMinor: number }[]>();
  const rows = await ctx.db.paymentRecord.findMany({
    where: {
      organizationId: orgId,
      OR: obligations.map((o) => ({ obligationId: o.id, cycleDueDate: o.nextDueDate })),
    },
    select: { obligationId: true, cycleDueDate: true, amountMinor: true },
  });
  const map = new Map<string, { cycleDueDate: string; amountMinor: number }[]>();
  for (const r of rows) map.set(r.obligationId, [...(map.get(r.obligationId) ?? []), r]);
  return map;
}

export async function viewsFor(ctx: AppContext, orgId: string, rows: ObligationWithRelations[], today: string): Promise<ObligationView[]> {
  const payments = await currentCyclePayments(ctx, orgId, rows);
  return rows.map((o) => obligationView(o, payments.get(o.id) ?? [], today));
}

export interface ListFilters {
  q?: string;
  statuses?: PaymentStatus[];
  platformId?: string;
  categoryId?: string;
  departmentId?: string;
  assignedToMe?: boolean;
  page: number;
  pageSize: number;
}

/**
 * List obligations with their computed status. Status depends on "today", so filtering
 * by status happens after computing it; a workspace's obligation count is small
 * (hundreds), so this stays cheap.
 */
export async function listObligations(ctx: AppContext, req: Request, f: ListFilters) {
  const orgId = orgIdOf(req);
  const actor = actorOf(req);
  const today = orgToday(ctx, req);
  const wantsArchived = f.statuses?.includes('ARCHIVED') ?? false;
  const onlyArchived = wantsArchived && f.statuses?.length === 1;

  const where: Prisma.ObligationWhereInput = {
    organizationId: orgId,
    status: onlyArchived ? 'ARCHIVED' : wantsArchived ? undefined : { in: ['ACTIVE', 'COMPLETED'] },
    platformId: f.platformId,
    categoryId: f.categoryId,
    departmentId: f.departmentId,
    ...(actor.role === 'EMPLOYEE' || f.assignedToMe ? { assigneeUserId: actor.userId } : {}),
  };
  const rows = await ctx.db.obligation.findMany({
    where,
    include: obligationInclude,
    orderBy: [{ nextDueDate: 'asc' }, { name: 'asc' }],
    take: 5000,
  });

  let views = await viewsFor(ctx, orgId, rows, today);
  if (f.q) {
    const q = f.q.toLowerCase();
    views = views.filter((v) =>
      [v.name, v.provider, v.platform?.name ?? '', v.category.name].some((s) => s.toLowerCase().includes(q)),
    );
  }
  if (f.statuses?.length) views = views.filter((v) => f.statuses!.includes(v.paymentStatus));

  const total = views.length;
  const start = (f.page - 1) * f.pageSize;
  return { items: views.slice(start, start + f.pageSize), page: f.page, pageSize: f.pageSize, total };
}

export interface ObligationInput {
  name: string;
  provider: string;
  description?: string | null;
  icon?: string | null;
  amountMinor: number;
  currency: string;
  frequencyUnit: FrequencyUnit;
  frequencyInterval: number;
  anchorDay?: number;
  startDate: string;
  nextDueDate?: string;
  reminderOffsets?: number[];
  platformId?: string | null;
  categoryId: string;
  departmentId?: string | null;
  assigneeUserId?: string | null;
}

/** Every referenced id must belong to this workspace (categories may also be built-in). */
async function assertReferences(
  ctx: AppContext,
  orgId: string,
  input: Partial<Pick<ObligationInput, 'platformId' | 'categoryId' | 'departmentId' | 'assigneeUserId'>>,
) {
  const checks: Promise<void>[] = [];
  if (input.platformId) {
    checks.push(
      ctx.db.platform.findFirst({ where: { id: input.platformId, organizationId: orgId } }).then((r) => {
        if (!r) throw badRequest('Unknown project/platform');
      }),
    );
  }
  if (input.categoryId) {
    checks.push(
      ctx.db.category
        .findFirst({ where: { id: input.categoryId, OR: [{ organizationId: orgId }, { organizationId: null }] } })
        .then((r) => {
          if (!r) throw badRequest('Unknown category');
        }),
    );
  }
  if (input.departmentId) {
    checks.push(
      ctx.db.department.findFirst({ where: { id: input.departmentId, organizationId: orgId } }).then((r) => {
        if (!r) throw badRequest('Unknown department');
      }),
    );
  }
  if (input.assigneeUserId) {
    checks.push(
      ctx.db.membership.findFirst({ where: { userId: input.assigneeUserId, organizationId: orgId } }).then((r) => {
        if (!r) throw badRequest('The assignee is not a member of this workspace');
      }),
    );
  }
  await Promise.all(checks);
}

export async function createObligation(ctx: AppContext, req: Request, input: ObligationInput) {
  const orgId = orgIdOf(req);
  const actor: Actor = actorOf(req);
  // Department officers file into their own department by default.
  const departmentId = input.departmentId ?? (actor.role === 'DEPARTMENT' ? actor.departmentId : null);
  if (!canCreateObligationIn(actor, departmentId)) {
    throw forbidden('You can only add payments to your own department');
  }
  await assertReferences(ctx, orgId, { ...input, departmentId });

  const nextDueDate = input.nextDueDate ?? input.startDate;
  const org = await ctx.db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { defaultReminderOffsets: true } });
  const created = await ctx.db.obligation.create({
    data: {
      organizationId: orgId,
      name: input.name,
      provider: input.provider,
      description: input.description ?? null,
      icon: input.icon ?? null,
      amountMinor: input.amountMinor,
      currency: input.currency,
      frequencyUnit: input.frequencyUnit,
      frequencyInterval: input.frequencyUnit === 'ONCE' ? 1 : input.frequencyInterval,
      anchorDay: input.anchorDay ?? parseDate(nextDueDate).d,
      startDate: input.startDate,
      nextDueDate,
      reminderOffsets: input.reminderOffsets ?? (org.defaultReminderOffsets as number[]),
      platformId: input.platformId ?? null,
      categoryId: input.categoryId,
      departmentId,
      assigneeUserId: input.assigneeUserId ?? null,
      createdById: actor.userId,
    },
    include: obligationInclude,
  });
  await audit(ctx, orgId, actor.userId, 'obligation.create', 'Obligation', created.id, { name: created.name });
  return obligationView(created, [], orgToday(ctx, req));
}

export async function updateObligation(ctx: AppContext, req: Request, id: string, input: Partial<ObligationInput>) {
  const orgId = orgIdOf(req);
  const actor = actorOf(req);
  const existing = await loadObligation(ctx, req, id, 'manage');
  if (input.departmentId !== undefined && input.departmentId !== existing.departmentId && !canCreateObligationIn(actor, input.departmentId)) {
    throw forbidden('You can only move payments into your own department');
  }
  await assertReferences(ctx, orgId, input);

  const startDate = input.startDate ?? existing.startDate;
  const nextDueDate = input.nextDueDate ?? existing.nextDueDate;
  if (nextDueDate < startDate) throw badRequest('The next due date cannot be before the start date');
  const unit = input.frequencyUnit ?? existing.frequencyUnit;

  const data: Prisma.ObligationUncheckedUpdateInput = {
    ...input,
    frequencyInterval: unit === 'ONCE' ? 1 : input.frequencyInterval,
    // A new due date re-anchors the schedule unless an anchor is given explicitly.
    anchorDay: input.anchorDay ?? (input.nextDueDate ? parseDate(input.nextDueDate).d : undefined),
  };
  const updated = await ctx.db.obligation.update({ where: { id: existing.id }, data, include: obligationInclude });
  await audit(ctx, orgId, actor.userId, 'obligation.update', 'Obligation', id, { fields: Object.keys(input) });
  return (await viewsFor(ctx, orgId, [updated], orgToday(ctx, req)))[0]!;
}

export async function setArchived(ctx: AppContext, req: Request, id: string, archived: boolean) {
  const orgId = orgIdOf(req);
  const existing = await loadObligation(ctx, req, id, 'manage');
  if (!archived && existing.status !== 'ARCHIVED') throw badRequest('This payment is not archived');
  const status = archived ? 'ARCHIVED' : existing.frequencyUnit === 'ONCE' && (await isFullyPaid(ctx, existing)) ? 'COMPLETED' : 'ACTIVE';
  const updated = await ctx.db.obligation.update({ where: { id }, data: { status }, include: obligationInclude });
  await audit(ctx, orgId, actorOf(req).userId, archived ? 'obligation.archive' : 'obligation.unarchive', 'Obligation', id);
  return (await viewsFor(ctx, orgId, [updated], orgToday(ctx, req)))[0]!;
}

async function isFullyPaid(ctx: AppContext, o: { id: string; nextDueDate: string; amountMinor: number }) {
  const agg = await ctx.db.paymentRecord.aggregate({
    where: { obligationId: o.id, cycleDueDate: o.nextDueDate },
    _sum: { amountMinor: true },
  });
  return (agg._sum.amountMinor ?? 0) >= o.amountMinor;
}

export async function deleteObligation(ctx: AppContext, req: Request, id: string) {
  const existing = await loadObligation(ctx, req, id, 'manage');
  const actor = actorOf(req);
  if (actor.role !== 'ADMIN' && actor.role !== 'FINANCE') throw forbidden('Only admins and finance can delete payments');
  const payments = await ctx.db.paymentRecord.count({ where: { obligationId: id } });
  if (payments > 0) {
    throw new AppError(409, 'HAS_HISTORY', 'This payment has recorded history. Archive it instead so the history is kept.');
  }
  await ctx.db.obligation.delete({ where: { id: existing.id } });
  await audit(ctx, orgIdOf(req), actor.userId, 'obligation.delete', 'Obligation', id, { name: existing.name });
}

/** Detail view: obligation + current-cycle reminder plan + recent history + attachments. */
export async function obligationDetail(ctx: AppContext, req: Request, id: string) {
  const o = await loadObligation(ctx, req, id, 'view');
  const orgId = orgIdOf(req);
  const today = orgToday(ctx, req);
  const [view] = await viewsFor(ctx, orgId, [o], today);
  const [history, attachments, sent] = await Promise.all([
    ctx.db.paymentRecord.findMany({
      where: { obligationId: id, organizationId: orgId },
      orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
      take: 10,
      include: { recordedBy: { select: { id: true, name: true } }, attachments: { select: { id: true, fileName: true, mimeType: true, size: true } } },
    }),
    ctx.db.attachment.findMany({
      where: { organizationId: orgId, obligationId: id, paymentRecordId: null },
      select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    ctx.db.notification.findMany({
      where: { obligationId: id, cycleDueDate: o.nextDueDate, channel: 'IN_APP' },
      select: { offsetDays: true },
      distinct: ['offsetDays'],
    }),
  ]);
  const sentOffsets = new Set(sent.map((n) => n.offsetDays));
  const offsets = o.reminderOffsets as number[];
  // The full configured plan for this cycle, plus weekly follow-ups that have come due.
  const lastConfigured = reminderDates(o.nextDueDate, offsets).at(-1)?.date ?? o.nextDueDate;
  const plan = reminderSchedule(o.nextDueDate, offsets, today > lastConfigured ? today : lastConfigured).map((r) => ({
    ...r,
    sent: sentOffsets.has(r.offsetDays),
  }));
  return {
    ...view!,
    reminders: o.status === 'ACTIVE' ? plan : [],
    history: history.map((p) => ({
      id: p.id,
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
    })),
    attachments,
  };
}
