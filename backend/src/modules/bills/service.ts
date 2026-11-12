import type { Request } from 'express';

import type { AppContext } from '../../context.js';
import {
  addDays,
  calculateNextDueDate,
  parseDate,
  reminderDates,
  reminderSchedule,
  todayIn,
  type PaymentStatus,
} from '../../domain/schedule.js';
import type { AmountType, FrequencyUnit, PaymentMethod, Prisma } from '../../generated/prisma/client.js';
import { cleanCustomValues } from '../categories/customFields.js';
import { cyclesBetween, type StoredCycle } from '../../domain/cycles.js';
import { reconcileCycle } from '../payments/cycle.js';
import { AppError, badRequest, notFound } from '../../http/errors.js';
import { accessOf, actorOf, assertCan, companyScope, workspaceIdOf } from '../../http/middleware/auth.js';
import { visibleCompanyIds } from '../../domain/access.js';
import { slicePage } from '../../http/schemas.js';
import { keyLast4, normaliseKey } from '../../lib/secretBox.js';
import { notifyPriceChanged } from '../../notifications/events.js';
import { audit } from '../workspaces/service.js';

import { billInclude, billView, type BillView, type BillWithRelations } from './view.js';

/** Today in the request's workspace timezone. */
export function workspaceToday(ctx: AppContext, req: Request): string {
  if (!req.workspace) throw new Error('requireWorkspace must run first');
  return todayIn(ctx.clock.now(), req.workspace.timezone);
}

/** Load a bill in the caller's workspace. Anything outside it is a 404, so ids can't be probed. */
export async function loadBill(ctx: AppContext, req: Request, id: string) {
  const s = await ctx.db.bill.findFirst({
    where: { id, workspaceId: workspaceIdOf(req), ...companyScope(req) },
    include: billInclude,
  });
  if (!s) throw notFound('Bill');
  return s;
}

/** Payments for the current cycle of each bill (for status computation). */
async function currentCyclePayments(ctx: AppContext, workspaceId: string, subs: { id: string; nextDueDate: string }[]) {
  const map = new Map<string, { cycleDueDate: string; amountCents: number }[]>();
  if (subs.length === 0) return map;
  const rows = await ctx.db.paymentRecord.findMany({
    where: { workspaceId, OR: subs.map((s) => ({ billId: s.id, cycleDueDate: s.nextDueDate })) },
    select: { billId: true, cycleDueDate: true, amountCents: true },
  });
  for (const r of rows) map.set(r.billId, [...(map.get(r.billId) ?? []), r]);
  return map;
}

/** Stored cycles from each bill's open cycle on (their own amounts, e.g. a variable bill's actual). */
export async function openCycleRows(ctx: AppContext, workspaceId: string, subs: { id: string; nextDueDate: string }[]) {
  const map = new Map<string, Map<string, StoredCycle>>();
  if (subs.length === 0) return map;
  const rows = await ctx.db.billCycle.findMany({
    where: { workspaceId, OR: subs.map((s) => ({ billId: s.id, dueDate: { gte: s.nextDueDate } })) },
    select: { billId: true, dueDate: true, amountCents: true, isActual: true, closedAt: true },
  });
  for (const r of rows) {
    const m = map.get(r.billId) ?? new Map<string, StoredCycle>();
    m.set(r.dueDate, r);
    map.set(r.billId, m);
  }
  return map;
}

export async function viewsFor(
  ctx: AppContext,
  workspaceId: string,
  rows: BillWithRelations[],
  today: string,
): Promise<BillView[]> {
  const [payments, cycles] = await Promise.all([currentCyclePayments(ctx, workspaceId, rows), openCycleRows(ctx, workspaceId, rows)]);
  return rows.map((s) => billView(s, payments.get(s.id) ?? [], today, cycles.get(s.id)));
}

/**
 * `companyId` filter combining what the caller asked for with what they may see:
 * an id outside their access simply matches nothing.
 */
export function scopedCompanies(req: Request, requested?: string[]): { companyId?: { in: string[] } } {
  const visible = visibleCompanyIds(accessOf(req));
  if (!requested?.length) return visible ? { companyId: { in: visible } } : {};
  return { companyId: { in: visible ? requested.filter((id) => visible.includes(id)) : requested } };
}

// --- Listing -------------------------------------------------------------------

export const SORTS = ['due_asc', 'due_desc', 'amount_desc', 'amount_asc', 'name_asc', 'recent'] as const;
export type BillSort = (typeof SORTS)[number];

export interface ListFilters {
  q?: string;
  statuses?: PaymentStatus[];
  companyIds?: string[];
  categoryIds?: string[];
  frequencies?: FrequencyUnit[];
  amountType?: AmountType;
  customField?: string;
  customValue?: string;
  dueFrom?: string;
  dueTo?: string;
  sort: BillSort;
  page: number;
  limit: number;
}

const byName = (a: BillView, b: BillView) => a.name.localeCompare(b.name);
/** Completed one-time bills have nothing due; keep them below everything that does. */
const doneLast = (a: BillView, b: BillView) => Number(a.status === 'COMPLETED') - Number(b.status === 'COMPLETED');

const COMPARATORS: Record<BillSort, (a: BillView, b: BillView) => number> = {
  due_asc: (a, b) => doneLast(a, b) || a.nextDueDate.localeCompare(b.nextDueDate) || byName(a, b),
  due_desc: (a, b) => doneLast(a, b) || b.nextDueDate.localeCompare(a.nextDueDate) || byName(a, b),
  amount_desc: (a, b) => b.amountCents - a.amountCents || byName(a, b),
  amount_asc: (a, b) => a.amountCents - b.amountCents || byName(a, b),
  name_asc: byName,
  recent: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
};

/**
 * List bills, 10 per page by default, sorted by next due date (soonest first,
 * so overdue ones lead). Status depends on the workspace's "today", so status filtering,
 * text search and sorting happen after the database query; a workspace holds hundreds of
 * bills at most, so this stays cheap (DECISIONS.md D9).
 */
export async function listBills(ctx: AppContext, req: Request, f: ListFilters) {
  const workspaceId = workspaceIdOf(req);
  const today = workspaceToday(ctx, req);
  const wantsArchived = f.statuses?.includes('ARCHIVED') ?? false;
  const onlyArchived = wantsArchived && f.statuses?.length === 1;

  const where: Prisma.BillWhereInput = {
    workspaceId,
    status: onlyArchived ? 'ARCHIVED' : wantsArchived ? undefined : { in: ['ACTIVE', 'COMPLETED'] },
    ...scopedCompanies(req, f.companyIds),
    ...(f.categoryIds?.length ? { categoryId: { in: f.categoryIds } } : {}),
    ...(f.frequencies?.length ? { frequencyUnit: { in: f.frequencies } } : {}),
    ...(f.amountType ? { amountType: f.amountType } : {}),
    ...(f.dueFrom || f.dueTo ? { nextDueDate: { gte: f.dueFrom, lte: f.dueTo } } : {}),
  };
  const rows = await ctx.db.bill.findMany({ where, include: billInclude, take: 5000 });
  let views = await viewsFor(ctx, workspaceId, rows, today);

  if (f.q) {
    const q = f.q.toLowerCase();
    // Exact account-reference match via its keyed hash (keys are never searched in plain text).
    const keyHash = normaliseKey(f.q).length >= 4 ? ctx.keys.hash(f.q) : null;
    const keyMatches = new Set(keyHash ? rows.filter((r) => r.accountRefHash === keyHash).map((r) => r.id) : []);
    views = views.filter(
      (v) =>
        keyMatches.has(v.id) ||
        [v.name, v.provider ?? '', v.company.name, v.category.name, v.description ?? '', ...Object.values(v.customValues).map(String)].some((s) =>
          s.toLowerCase().includes(q),
        ),
    );
  }
  if (f.customField && f.customValue) {
    const want = f.customValue.toLowerCase();
    views = views.filter((v) => {
      const value = v.customValues[f.customField!];
      if (value === undefined) return false;
      const text = String(value).toLowerCase();
      return typeof value === 'number' ? Number(f.customValue) === value : text === want || text.includes(want);
    });
  }
  if (f.statuses?.length) views = views.filter((v) => f.statuses!.includes(v.paymentStatus));

  views.sort(COMPARATORS[f.sort]);
  return slicePage(views, f.page, f.limit);
}

// --- Cycles ------------------------------------------------------------------------

/** Every cycle of one bill in [from, to] with its expected, paid and remaining amounts. */
export async function billCycles(ctx: AppContext, req: Request, id: string, from?: string, to?: string) {
  const s = await loadBill(ctx, req, id);
  const today = workspaceToday(ctx, req);
  const start = from ?? addDays(today, -366);
  const end = to ?? addDays(today, 366);
  if (end < start) throw badRequest('`to` must be on or after `from`');
  const [stored, payments] = await Promise.all([
    ctx.db.billCycle.findMany({ where: { billId: id }, select: { dueDate: true, amountCents: true, isActual: true, closedAt: true } }),
    ctx.db.paymentRecord.findMany({ where: { billId: id }, select: { cycleDueDate: true, amountCents: true } }),
  ]);
  const map = new Map(stored.map((c) => [c.dueDate, c]));
  return { billId: id, from: start, to: end, today, cycles: cyclesBetween(s, map, payments, start, end, today) };
}

/**
 * Store one cycle's real amount (a VARIABLE bill's actual bill, or a one-off change to a FIXED
 * one). Only the open cycle or a later one; closed cycles keep their history.
 */
export async function setCycleAmount(ctx: AppContext, req: Request, id: string, dueDate: string, amountCents: number) {
  const s = await loadBill(ctx, req, id);
  assertCan(req, 'bills:manage', s.companyId);
  if (s.status !== 'ACTIVE') throw badRequest('This bill has no open cycle');
  if (dueDate < s.nextDueDate) throw badRequest('That cycle is already closed');
  const today = workspaceToday(ctx, req);
  const valid = cyclesBetween(s, new Map(), [], s.nextDueDate, dueDate, today).some((c) => c.dueDate === dueDate);
  if (!valid) throw badRequest('That date is not one of this bill’s due dates');
  await ctx.db.$transaction(async (tx) => {
    await tx.billCycle.upsert({
      where: { billId_dueDate: { billId: id, dueDate } },
      create: { workspaceId: s.workspaceId, billId: id, dueDate, amountCents, isActual: true },
      update: { amountCents, isActual: true },
    });
    // A lower amount can make the open cycle fully paid already.
    if (dueDate === s.nextDueDate) await reconcileCycle(tx, id, undefined, { now: ctx.clock.now() });
  });
  await audit(ctx, s.workspaceId, actorOf(req).userId, 'bill.cycle.amount', 'Bill', id, { dueDate, amountCents });
  return billDetail(ctx, req, id);
}

// --- Create / update ---------------------------------------------------------------

export interface BillInput {
  name: string;
  companyId: string;
  categoryId: string;
  provider?: string | null;
  description?: string | null;
  /** Plain key from the client; encrypted before it touches the database. null clears it. */
  accountReference?: string | null;
  amountCents: number;
  frequencyUnit: FrequencyUnit;
  frequencyInterval: number;
  anchorDay?: number;
  startDate?: string;
  nextDueDate?: string;
  reminderOffsets?: number[];
  autoRenew?: boolean;
  isTrial?: boolean;
  trialEndsOn?: string | null;
  defaultPaymentMethod?: PaymentMethod | null;
  /** FIXED (default) or VARIABLE — then amountCents is the estimate. */
  amountType?: AmountType;
  /** Values of the company's custom fields, keyed by field id. */
  customValues?: Record<string, unknown> | null;
}

/**
 * The company must be in this workspace (and not archived, unless the bill is already there);
 * the category must belong to that company. Returns both, for defaults.
 */
async function assertReferences(
  ctx: AppContext,
  workspaceId: string,
  companyId: string,
  categoryId: string,
  current?: { companyId: string; categoryId: string },
) {
  const company = await ctx.db.company.findFirst({ where: { id: companyId, workspaceId } });
  if (!company) throw badRequest('Choose a company from this workspace');
  if (company.archivedAt && company.id !== current?.companyId) throw badRequest('This company is archived');
  const category = await ctx.db.category.findFirst({ where: { id: categoryId, companyId } });
  if (!category) {
    throw badRequest(current && companyId !== current.companyId ? 'Choose a category of the new company' : 'Choose a category of this company');
  }
  if (category.archivedAt && category.id !== current?.categoryId) throw badRequest('This category is archived');
  return { company, category };
}

/** Encrypted columns for a key change; undefined = leave as is, null/"" = remove the key. */
function keyColumns(ctx: AppContext, key: string | null | undefined) {
  if (key === undefined) return {};
  const plain = key?.trim();
  if (!plain) return { accountRefEncrypted: null, accountRefLast4: null, accountRefHash: null };
  return {
    accountRefEncrypted: ctx.keys.encrypt(plain),
    accountRefLast4: keyLast4(plain),
    accountRefHash: ctx.keys.hash(plain),
  };
}

export async function createBill(ctx: AppContext, req: Request, input: BillInput) {
  const workspaceId = workspaceIdOf(req);
  const actor = actorOf(req);
  const today = workspaceToday(ctx, req);
  assertCan(req, 'bills:manage', input.companyId);
  const { company, category } = await assertReferences(ctx, workspaceId, input.companyId, input.categoryId);
  const customValues = await cleanCustomValues(ctx, input.companyId, input.categoryId, input.customValues);

  const interval = input.frequencyUnit === 'ONCE' ? 1 : input.frequencyInterval;
  const startDate = input.startDate ?? today;
  const anchorDay = input.anchorDay ?? parseDate(input.nextDueDate ?? startDate).d;
  const nextDueDate = input.nextDueDate ?? calculateNextDueDate(startDate, input.frequencyUnit, interval, anchorDay, today);
  if (nextDueDate < startDate) throw badRequest('The next due date cannot be before the start date');

  const workspace = await ctx.db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { defaultReminderOffsets: true } });
  const created = await ctx.db.bill.create({
    data: {
      workspaceId,
      companyId: input.companyId,
      categoryId: input.categoryId,
      name: input.name,
      provider: input.provider || null,
      description: input.description || null,
      ...keyColumns(ctx, input.accountReference),
      amountCents: input.amountCents,
      amountType: input.amountType ?? category.defaultAmountType ?? 'FIXED',
      customValues: customValues as Prisma.InputJsonValue,
      frequencyUnit: input.frequencyUnit,
      frequencyInterval: interval,
      anchorDay,
      startDate,
      nextDueDate,
      // Reminders: the bill's own, else its category's, else its company's, else the workspace's.
      reminderOffsets:
        input.reminderOffsets ??
        (category.defaultReminderOffsets as number[] | null) ??
        (company.reminderOffsets as number[] | null) ??
        (workspace.defaultReminderOffsets as number[]),
      autoRenew: input.autoRenew ?? false,
      isTrial: input.isTrial ?? false,
      trialEndsOn: input.isTrial ? (input.trialEndsOn ?? null) : null,
      defaultPaymentMethod: input.defaultPaymentMethod !== undefined ? input.defaultPaymentMethod : category.defaultPaymentMethod,
    },
    include: billInclude,
  });
  await audit(ctx, workspaceId, actor.userId, 'bill.create', 'Bill', created.id, { name: created.name });
  return billView(created, [], today);
}

export async function updateBill(ctx: AppContext, req: Request, id: string, input: Partial<BillInput>) {
  const workspaceId = workspaceIdOf(req);
  const today = workspaceToday(ctx, req);
  const existing = await loadBill(ctx, req, id);
  assertCan(req, 'bills:manage', existing.companyId);
  if (input.companyId && input.companyId !== existing.companyId) assertCan(req, 'bills:manage', input.companyId);
  const companyId = input.companyId ?? existing.companyId;
  const categoryId = input.categoryId ?? existing.categoryId;
  if (input.companyId || input.categoryId) await assertReferences(ctx, workspaceId, companyId, categoryId, existing);
  // Custom values are re-checked when they change or when the company/category does.
  const customValues =
    input.customValues !== undefined || companyId !== existing.companyId || categoryId !== existing.categoryId
      ? await cleanCustomValues(ctx, companyId, categoryId, input.customValues !== undefined ? input.customValues : (existing.customValues as Record<string, unknown> | null))
      : undefined;

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
  if (!nextDueDate && scheduleChanged && (await ctx.db.paymentRecord.count({ where: { billId: id } })) === 0) {
    anchorDay ??= parseDate(startDate).d;
    nextDueDate = calculateNextDueDate(startDate, unit, interval, anchorDay, today);
  }
  if ((nextDueDate ?? existing.nextDueDate) < startDate) throw badRequest('The next due date cannot be before the start date');
  const isTrial = input.isTrial ?? existing.isTrial;
  if (isTrial && !(input.trialEndsOn !== undefined ? input.trialEndsOn : existing.trialEndsOn)) {
    throw badRequest('When does the free trial end?');
  }

  const { accountReference, customValues: _cv, ...rest } = input;
  const data: Prisma.BillUncheckedUpdateInput = {
    ...rest,
    ...(customValues !== undefined ? { customValues: customValues as Prisma.InputJsonValue } : {}),
    ...(rest.provider !== undefined ? { provider: rest.provider || null } : {}),
    ...(rest.description !== undefined ? { description: rest.description || null } : {}),
    ...keyColumns(ctx, accountReference),
    frequencyInterval: interval,
    anchorDay,
    nextDueDate,
    ...(input.isTrial === false ? { trialEndsOn: null } : {}),
  };
  const priceChanged = input.amountCents !== undefined && input.amountCents !== existing.amountCents;
  const updated = await ctx.db.$transaction(async (tx) => {
    const row = await tx.bill.update({ where: { id: existing.id }, data, include: billInclude });
    const change = priceChanged
      ? await tx.priceChange.create({
          data: { workspaceId, billId: id, oldAmountCents: existing.amountCents, newAmountCents: input.amountCents!, changedAt: ctx.clock.now() },
        })
      : null;
    return { row, change };
  });
  if (updated.change) {
    await notifyPriceChanged(ctx, {
      workspaceId,
      billId: id,
      actorUserId: actorOf(req).userId,
      oldAmountCents: existing.amountCents,
      newAmountCents: updated.change.newAmountCents,
      changeId: updated.change.id,
    });
  }
  // Field names only — never values (the key in particular must never reach the audit log).
  await audit(ctx, workspaceId, actorOf(req).userId, 'bill.update', 'Bill', id, { fields: Object.keys(input) });
  return (await viewsFor(ctx, workspaceId, [updated.row], today))[0]!;
}

/** Plain account reference for ADMIN/FINANCE (route-guarded). Each reveal is audited. */
export async function revealReference(ctx: AppContext, req: Request, id: string) {
  const s = await loadBill(ctx, req, id);
  assertCan(req, 'accountRefs:reveal', s.companyId);
  if (!s.accountRefEncrypted) throw notFound('Account reference');
  await audit(ctx, workspaceIdOf(req), actorOf(req).userId, 'bill.reference.reveal', 'Bill', id);
  return { value: ctx.keys.decrypt(s.accountRefEncrypted) };
}

export async function setArchived(ctx: AppContext, req: Request, id: string, archived: boolean) {
  const workspaceId = workspaceIdOf(req);
  const existing = await loadBill(ctx, req, id);
  assertCan(req, 'bills:manage', existing.companyId);
  if (!archived && existing.status !== 'ARCHIVED') throw badRequest('This bill is not archived');
  const status = archived
    ? 'ARCHIVED'
    : existing.frequencyUnit === 'ONCE' && (await isFullyPaid(ctx, existing))
      ? 'COMPLETED'
      : 'ACTIVE';
  const updated = await ctx.db.bill.update({ where: { id }, data: { status }, include: billInclude });
  await audit(ctx, workspaceId, actorOf(req).userId, archived ? 'bill.archive' : 'bill.unarchive', 'Bill', id);
  return (await viewsFor(ctx, workspaceId, [updated], workspaceToday(ctx, req)))[0]!;
}

async function isFullyPaid(ctx: AppContext, s: { id: string; nextDueDate: string; amountCents: number }) {
  const agg = await ctx.db.paymentRecord.aggregate({
    where: { billId: s.id, cycleDueDate: s.nextDueDate },
    _sum: { amountCents: true },
  });
  return (agg._sum.amountCents ?? 0) >= s.amountCents;
}

export async function deleteBill(ctx: AppContext, req: Request, id: string) {
  const existing = await loadBill(ctx, req, id);
  assertCan(req, 'bills:manage', existing.companyId);
  const payments = await ctx.db.paymentRecord.count({ where: { billId: id } });
  if (payments > 0) {
    throw new AppError(409, 'HAS_HISTORY', 'This bill has recorded payments. Archive it instead so the history is kept.');
  }
  await ctx.db.bill.delete({ where: { id: existing.id } });
  await audit(ctx, workspaceIdOf(req), actorOf(req).userId, 'bill.delete', 'Bill', id, { name: existing.name });
}

/** Detail view: bill + current-cycle reminder plan + latest payments. */
export async function billDetail(ctx: AppContext, req: Request, id: string) {
  const s = await loadBill(ctx, req, id);
  const workspaceId = workspaceIdOf(req);
  const today = workspaceToday(ctx, req);
  const [view] = await viewsFor(ctx, workspaceId, [s], today);
  const [history, historyTotal, sent, prefs, priceHistory, snooze] = await Promise.all([
    ctx.db.paymentRecord.findMany({
      where: { billId: id, workspaceId },
      orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    }),
    ctx.db.paymentRecord.count({ where: { billId: id, workspaceId } }),
    ctx.db.notification.findMany({
      where: { billId: id, cycleDueDate: s.nextDueDate, channel: 'IN_APP' },
      select: { offsetDays: true },
      distinct: ['offsetDays'],
    }),
    ctx.db.notificationPreference.findUnique({
      where: { userId_workspaceId: { userId: actorOf(req).userId, workspaceId } },
      select: { mutedBillIds: true },
    }),
    ctx.db.priceChange.findMany({ where: { billId: id, workspaceId }, orderBy: { changedAt: 'desc' }, take: 20 }),
    ctx.db.reminderSnooze.findUnique({
      where: { userId_billId_cycleDueDate: { userId: actorOf(req).userId, billId: id, cycleDueDate: s.nextDueDate } },
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
    muted: ((prefs?.mutedBillIds as string[] | undefined) ?? []).includes(id),
    snoozedUntil: snooze && snooze.snoozedUntil > today ? snooze.snoozedUntil : null,
    priceHistory: priceHistory.map((p) => ({
      id: p.id,
      oldAmountCents: p.oldAmountCents,
      newAmountCents: p.newAmountCents,
      changedAt: p.changedAt,
    })),
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

// --- Snooze ----------------------------------------------------------------------

/** Pause this user's reminders for the current cycle until a date (tomorrow, in 3 days, next week…). */
export async function snooze(ctx: AppContext, req: Request, id: string, input: { days?: number; until?: string }) {
  const s = await loadBill(ctx, req, id);
  const today = workspaceToday(ctx, req);
  const until = input.until ?? addDays(today, input.days!);
  if (until <= today) throw badRequest('Choose a date after today');
  const userId = actorOf(req).userId;
  await ctx.db.reminderSnooze.upsert({
    where: { userId_billId_cycleDueDate: { userId, billId: id, cycleDueDate: s.nextDueDate } },
    create: { userId, billId: id, cycleDueDate: s.nextDueDate, snoozedUntil: until },
    update: { snoozedUntil: until },
  });
  return { billId: id, cycleDueDate: s.nextDueDate, snoozedUntil: until };
}

export async function unsnooze(ctx: AppContext, req: Request, id: string) {
  const s = await loadBill(ctx, req, id);
  await ctx.db.reminderSnooze.deleteMany({ where: { userId: actorOf(req).userId, billId: id, cycleDueDate: s.nextDueDate } });
}
