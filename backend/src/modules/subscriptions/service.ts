import type { Request } from 'express';

import type { AppContext } from '../../context.js';
import {
  calculateNextDueDate,
  parseDate,
  reminderDates,
  reminderSchedule,
  todayIn,
  type PaymentStatus,
} from '../../domain/schedule.js';
import type { FrequencyUnit, Prisma } from '../../generated/prisma/client.js';
import { AppError, badRequest, notFound } from '../../http/errors.js';
import { actorOf, workspaceIdOf } from '../../http/middleware/auth.js';
import { slicePage } from '../../http/schemas.js';
import { keyLast4, normaliseKey } from '../../lib/secretBox.js';
import { audit } from '../workspaces/service.js';

import { subscriptionInclude, subscriptionView, type SubscriptionView, type SubscriptionWithRelations } from './view.js';

/** Today in the request's workspace timezone. */
export function workspaceToday(ctx: AppContext, req: Request): string {
  if (!req.workspace) throw new Error('requireWorkspace must run first');
  return todayIn(ctx.clock.now(), req.workspace.timezone);
}

/** Load a subscription in the caller's workspace. Anything outside it is a 404, so ids can't be probed. */
export async function loadSubscription(ctx: AppContext, req: Request, id: string) {
  const s = await ctx.db.subscription.findFirst({
    where: { id, workspaceId: workspaceIdOf(req) },
    include: subscriptionInclude,
  });
  if (!s) throw notFound('Subscription');
  return s;
}

/** Payments for the current cycle of each subscription (for status computation). */
async function currentCyclePayments(ctx: AppContext, workspaceId: string, subs: { id: string; nextDueDate: string }[]) {
  const map = new Map<string, { cycleDueDate: string; amountCents: number }[]>();
  if (subs.length === 0) return map;
  const rows = await ctx.db.paymentRecord.findMany({
    where: { workspaceId, OR: subs.map((s) => ({ subscriptionId: s.id, cycleDueDate: s.nextDueDate })) },
    select: { subscriptionId: true, cycleDueDate: true, amountCents: true },
  });
  for (const r of rows) map.set(r.subscriptionId, [...(map.get(r.subscriptionId) ?? []), r]);
  return map;
}

export async function viewsFor(
  ctx: AppContext,
  workspaceId: string,
  rows: SubscriptionWithRelations[],
  today: string,
): Promise<SubscriptionView[]> {
  const payments = await currentCyclePayments(ctx, workspaceId, rows);
  return rows.map((s) => subscriptionView(s, payments.get(s.id) ?? [], today));
}

// --- Listing -------------------------------------------------------------------

export const SORTS = ['due_asc', 'due_desc', 'amount_desc', 'amount_asc', 'name_asc', 'recent'] as const;
export type SubscriptionSort = (typeof SORTS)[number];

export interface ListFilters {
  q?: string;
  statuses?: PaymentStatus[];
  companyIds?: string[];
  categoryIds?: string[];
  frequencies?: FrequencyUnit[];
  dueFrom?: string;
  dueTo?: string;
  sort: SubscriptionSort;
  page: number;
  limit: number;
}

const byName = (a: SubscriptionView, b: SubscriptionView) => a.name.localeCompare(b.name);
/** Completed one-time subscriptions have nothing due; keep them below everything that does. */
const doneLast = (a: SubscriptionView, b: SubscriptionView) => Number(a.status === 'COMPLETED') - Number(b.status === 'COMPLETED');

const COMPARATORS: Record<SubscriptionSort, (a: SubscriptionView, b: SubscriptionView) => number> = {
  due_asc: (a, b) => doneLast(a, b) || a.nextDueDate.localeCompare(b.nextDueDate) || byName(a, b),
  due_desc: (a, b) => doneLast(a, b) || b.nextDueDate.localeCompare(a.nextDueDate) || byName(a, b),
  amount_desc: (a, b) => b.amountCents - a.amountCents || byName(a, b),
  amount_asc: (a, b) => a.amountCents - b.amountCents || byName(a, b),
  name_asc: byName,
  recent: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
};

/**
 * List subscriptions, 10 per page by default, sorted by next due date (soonest first,
 * so overdue ones lead). Status depends on the workspace's "today", so status filtering,
 * text search and sorting happen after the database query; a workspace holds hundreds of
 * subscriptions at most, so this stays cheap (DECISIONS.md D9).
 */
export async function listSubscriptions(ctx: AppContext, req: Request, f: ListFilters) {
  const workspaceId = workspaceIdOf(req);
  const today = workspaceToday(ctx, req);
  const wantsArchived = f.statuses?.includes('ARCHIVED') ?? false;
  const onlyArchived = wantsArchived && f.statuses?.length === 1;

  const where: Prisma.SubscriptionWhereInput = {
    workspaceId,
    status: onlyArchived ? 'ARCHIVED' : wantsArchived ? undefined : { in: ['ACTIVE', 'COMPLETED'] },
    ...(f.companyIds?.length ? { companyId: { in: f.companyIds } } : {}),
    ...(f.categoryIds?.length ? { categoryId: { in: f.categoryIds } } : {}),
    ...(f.frequencies?.length ? { frequencyUnit: { in: f.frequencies } } : {}),
    ...(f.dueFrom || f.dueTo ? { nextDueDate: { gte: f.dueFrom, lte: f.dueTo } } : {}),
  };
  const rows = await ctx.db.subscription.findMany({ where, include: subscriptionInclude, take: 5000 });
  let views = await viewsFor(ctx, workspaceId, rows, today);

  if (f.q) {
    const q = f.q.toLowerCase();
    // Exact subscription-key match via its keyed hash (keys are never searched in plain text).
    const keyHash = normaliseKey(f.q).length >= 4 ? ctx.keys.hash(f.q) : null;
    const keyMatches = new Set(keyHash ? rows.filter((r) => r.subscriptionKeyHash === keyHash).map((r) => r.id) : []);
    views = views.filter(
      (v) =>
        keyMatches.has(v.id) ||
        [v.name, v.provider ?? '', v.company.name, v.category.name, v.description ?? ''].some((s) =>
          s.toLowerCase().includes(q),
        ),
    );
  }
  if (f.statuses?.length) views = views.filter((v) => f.statuses!.includes(v.paymentStatus));

  views.sort(COMPARATORS[f.sort]);
  return slicePage(views, f.page, f.limit);
}

// --- Create / update ---------------------------------------------------------------

export interface SubscriptionInput {
  name: string;
  companyId: string;
  categoryId: string;
  provider?: string | null;
  description?: string | null;
  /** Plain key from the client; encrypted before it touches the database. null clears it. */
  subscriptionKey?: string | null;
  amountCents: number;
  frequencyUnit: FrequencyUnit;
  frequencyInterval: number;
  anchorDay?: number;
  startDate?: string;
  nextDueDate?: string;
  reminderOffsets?: number[];
}

/** Every referenced id must belong to this workspace (categories may also be built-in). */
async function assertReferences(ctx: AppContext, workspaceId: string, input: Partial<SubscriptionInput>, currentCompanyId?: string) {
  if (input.companyId) {
    const company = await ctx.db.company.findFirst({ where: { id: input.companyId, workspaceId } });
    if (!company) throw badRequest('Choose a company from this workspace');
    if (company.archivedAt && company.id !== currentCompanyId) throw badRequest('This company is archived');
  }
  if (input.categoryId) {
    const category = await ctx.db.category.findFirst({
      where: { id: input.categoryId, OR: [{ workspaceId }, { workspaceId: null }] },
    });
    if (!category) throw badRequest('Choose a category from the list');
  }
}

/** Encrypted columns for a key change; undefined = leave as is, null/"" = remove the key. */
function keyColumns(ctx: AppContext, key: string | null | undefined) {
  if (key === undefined) return {};
  const plain = key?.trim();
  if (!plain) return { subscriptionKeyEncrypted: null, subscriptionKeyLast4: null, subscriptionKeyHash: null };
  return {
    subscriptionKeyEncrypted: ctx.keys.encrypt(plain),
    subscriptionKeyLast4: keyLast4(plain),
    subscriptionKeyHash: ctx.keys.hash(plain),
  };
}

export async function createSubscription(ctx: AppContext, req: Request, input: SubscriptionInput) {
  const workspaceId = workspaceIdOf(req);
  const actor = actorOf(req);
  const today = workspaceToday(ctx, req);
  await assertReferences(ctx, workspaceId, input);

  const interval = input.frequencyUnit === 'ONCE' ? 1 : input.frequencyInterval;
  const startDate = input.startDate ?? today;
  const anchorDay = input.anchorDay ?? parseDate(input.nextDueDate ?? startDate).d;
  const nextDueDate = input.nextDueDate ?? calculateNextDueDate(startDate, input.frequencyUnit, interval, anchorDay, today);
  if (nextDueDate < startDate) throw badRequest('The next due date cannot be before the start date');

  const workspace = await ctx.db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { defaultReminderOffsets: true } });
  const created = await ctx.db.subscription.create({
    data: {
      workspaceId,
      companyId: input.companyId,
      categoryId: input.categoryId,
      name: input.name,
      provider: input.provider || null,
      description: input.description || null,
      ...keyColumns(ctx, input.subscriptionKey),
      amountCents: input.amountCents,
      frequencyUnit: input.frequencyUnit,
      frequencyInterval: interval,
      anchorDay,
      startDate,
      nextDueDate,
      reminderOffsets: input.reminderOffsets ?? (workspace.defaultReminderOffsets as number[]),
    },
    include: subscriptionInclude,
  });
  await audit(ctx, workspaceId, actor.userId, 'subscription.create', 'Subscription', created.id, { name: created.name });
  return subscriptionView(created, [], today);
}

export async function updateSubscription(ctx: AppContext, req: Request, id: string, input: Partial<SubscriptionInput>) {
  const workspaceId = workspaceIdOf(req);
  const today = workspaceToday(ctx, req);
  const existing = await loadSubscription(ctx, req, id);
  await assertReferences(ctx, workspaceId, input, existing.companyId);

  const unit = input.frequencyUnit ?? existing.frequencyUnit;
  const interval = unit === 'ONCE' ? 1 : (input.frequencyInterval ?? existing.frequencyInterval);
  const startDate = input.startDate ?? existing.startDate;
  let nextDueDate = input.nextDueDate;
  let anchorDay = input.anchorDay ?? (input.nextDueDate ? parseDate(input.nextDueDate).d : undefined);

  // A changed schedule re-derives the due date automatically, as long as no payment has
  // been recorded yet (after that, the recorded cycles define where the schedule stands).
  const scheduleChanged =
    (input.startDate !== undefined && input.startDate !== existing.startDate) ||
    unit !== existing.frequencyUnit ||
    interval !== existing.frequencyInterval;
  if (!nextDueDate && scheduleChanged && (await ctx.db.paymentRecord.count({ where: { subscriptionId: id } })) === 0) {
    anchorDay ??= parseDate(startDate).d;
    nextDueDate = calculateNextDueDate(startDate, unit, interval, anchorDay, today);
  }
  if ((nextDueDate ?? existing.nextDueDate) < startDate) throw badRequest('The next due date cannot be before the start date');

  const { subscriptionKey, ...rest } = input;
  const data: Prisma.SubscriptionUncheckedUpdateInput = {
    ...rest,
    ...(rest.provider !== undefined ? { provider: rest.provider || null } : {}),
    ...(rest.description !== undefined ? { description: rest.description || null } : {}),
    ...keyColumns(ctx, subscriptionKey),
    frequencyInterval: interval,
    anchorDay,
    nextDueDate,
  };
  const updated = await ctx.db.subscription.update({ where: { id: existing.id }, data, include: subscriptionInclude });
  // Field names only — never values (the key in particular must never reach the audit log).
  await audit(ctx, workspaceId, actorOf(req).userId, 'subscription.update', 'Subscription', id, { fields: Object.keys(input) });
  return (await viewsFor(ctx, workspaceId, [updated], today))[0]!;
}

/** Plain subscription key for ADMIN/FINANCE (route-guarded). Each reveal is audited. */
export async function revealKey(ctx: AppContext, req: Request, id: string) {
  const s = await loadSubscription(ctx, req, id);
  if (!s.subscriptionKeyEncrypted) throw notFound('Subscription key');
  await audit(ctx, workspaceIdOf(req), actorOf(req).userId, 'subscription.key.reveal', 'Subscription', id);
  return { value: ctx.keys.decrypt(s.subscriptionKeyEncrypted) };
}

export async function setArchived(ctx: AppContext, req: Request, id: string, archived: boolean) {
  const workspaceId = workspaceIdOf(req);
  const existing = await loadSubscription(ctx, req, id);
  if (!archived && existing.status !== 'ARCHIVED') throw badRequest('This subscription is not archived');
  const status = archived
    ? 'ARCHIVED'
    : existing.frequencyUnit === 'ONCE' && (await isFullyPaid(ctx, existing))
      ? 'COMPLETED'
      : 'ACTIVE';
  const updated = await ctx.db.subscription.update({ where: { id }, data: { status }, include: subscriptionInclude });
  await audit(ctx, workspaceId, actorOf(req).userId, archived ? 'subscription.archive' : 'subscription.unarchive', 'Subscription', id);
  return (await viewsFor(ctx, workspaceId, [updated], workspaceToday(ctx, req)))[0]!;
}

async function isFullyPaid(ctx: AppContext, s: { id: string; nextDueDate: string; amountCents: number }) {
  const agg = await ctx.db.paymentRecord.aggregate({
    where: { subscriptionId: s.id, cycleDueDate: s.nextDueDate },
    _sum: { amountCents: true },
  });
  return (agg._sum.amountCents ?? 0) >= s.amountCents;
}

export async function deleteSubscription(ctx: AppContext, req: Request, id: string) {
  const existing = await loadSubscription(ctx, req, id);
  const payments = await ctx.db.paymentRecord.count({ where: { subscriptionId: id } });
  if (payments > 0) {
    throw new AppError(409, 'HAS_HISTORY', 'This subscription has recorded payments. Archive it instead so the history is kept.');
  }
  await ctx.db.subscription.delete({ where: { id: existing.id } });
  await audit(ctx, workspaceIdOf(req), actorOf(req).userId, 'subscription.delete', 'Subscription', id, { name: existing.name });
}

/** Detail view: subscription + current-cycle reminder plan + latest payments. */
export async function subscriptionDetail(ctx: AppContext, req: Request, id: string) {
  const s = await loadSubscription(ctx, req, id);
  const workspaceId = workspaceIdOf(req);
  const today = workspaceToday(ctx, req);
  const [view] = await viewsFor(ctx, workspaceId, [s], today);
  const [history, historyTotal, sent, prefs] = await Promise.all([
    ctx.db.paymentRecord.findMany({
      where: { subscriptionId: id, workspaceId },
      orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    }),
    ctx.db.paymentRecord.count({ where: { subscriptionId: id, workspaceId } }),
    ctx.db.notification.findMany({
      where: { subscriptionId: id, cycleDueDate: s.nextDueDate, channel: 'IN_APP' },
      select: { offsetDays: true },
      distinct: ['offsetDays'],
    }),
    ctx.db.notificationPreference.findUnique({
      where: { userId_workspaceId: { userId: actorOf(req).userId, workspaceId } },
      select: { mutedSubscriptionIds: true },
    }),
  ]);
  const sentOffsets = new Set(sent.map((n) => n.offsetDays));
  const offsets = s.reminderOffsets as number[];
  // The full configured plan for this cycle, plus weekly follow-ups that have come due.
  const lastConfigured = reminderDates(s.nextDueDate, offsets).at(-1)?.date ?? s.nextDueDate;
  const plan = reminderSchedule(s.nextDueDate, offsets, today > lastConfigured ? today : lastConfigured).map((r) => ({
    ...r,
    sent: sentOffsets.has(r.offsetDays),
  }));
  return {
    ...view!,
    muted: ((prefs?.mutedSubscriptionIds as string[] | undefined) ?? []).includes(id),
    reminders: s.status === 'ACTIVE' ? plan : [],
    history: history.map((p) => ({
      id: p.id,
      cycleDueDate: p.cycleDueDate,
      amountCents: p.amountCents,
      paidOn: p.paidOn,
      method: p.method,
      reference: p.reference,
      notes: p.notes,
      createdAt: p.createdAt,
    })),
    historyTotal,
  };
}
