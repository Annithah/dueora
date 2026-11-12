import type { Request } from 'express';

import type { AppContext } from '../../context.js';
import { cyclesBetween, type Cycle, type StoredCycle } from '../../domain/cycles.js';
import { addDays, daysBetween, localTimeIn, reminderSchedule } from '../../domain/schedule.js';
import { workspaceIdOf } from '../../http/middleware/auth.js';
import { scopedCompanies } from '../bills/service.js';
import { describeValues, fieldView } from '../categories/customFields.js';
import { billInclude, type BillWithRelations } from '../bills/view.js';

import { addMonthsKey, monthRange } from './projection.js';

/**
 * Tracking views (Finalize brief, Part 5), computed on the server from the cycle engine so every
 * screen agrees: a recurring bill that fell behind owes each missed cycle, a variable bill shows its
 * estimate until the actual is set, and past cycles keep the amount stored for them.
 */

export const VIEWS = ['upcoming', 'this-month', 'next-month', 'outstanding', 'overdue', 'paid', 'obligations'] as const;
export type ViewName = (typeof VIEWS)[number];

export interface CycleItem extends Cycle {
  bill: {
    id: string;
    name: string;
    provider: string | null;
    amountType: 'FIXED' | 'VARIABLE';
    frequencyLabel?: string;
    company: { id: string; name: string; color: string };
    category: { id: string; name: string; icon: string; color: string };
  };
  /** Next reminder on or after today for this cycle (open cycles only). */
  nextReminder: string | null;
}

export interface CycleScope {
  workspaceId: string;
  today: string;
  localHour: number;
  timezone: string;
  workspaceName: string;
  bills: BillWithRelations[];
  companyWhere: { companyId?: { in: string[] } };
}

/** The caller's bills (the company switcher narrows it), and "today" in the workspace. */
export async function cycleScope(ctx: AppContext, req: Request, companyId?: string): Promise<CycleScope> {
  const workspaceId = workspaceIdOf(req);
  const companyWhere = scopedCompanies(req, companyId ? [companyId] : undefined);
  const workspace = await ctx.db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const local = localTimeIn(ctx.clock.now(), workspace.timezone);
  const bills = await ctx.db.bill.findMany({ where: { workspaceId, status: { not: 'ARCHIVED' }, ...companyWhere }, include: billInclude });
  return { workspaceId, today: local.date, localHour: local.hour, timezone: workspace.timezone, workspaceName: workspace.name, bills, companyWhere };
}

/**
 * Every cycle due in [from, to] across the scope. Stored cycles and payments are loaded for the
 * range plus each bill's open cycle (which may be older than `from`).
 */
export async function cyclesIn(ctx: AppContext, s: CycleScope, from: string, to: string): Promise<CycleItem[]> {
  if (s.bills.length === 0) return [];
  const ids = s.bills.map((b) => b.id);
  const oldestOpen = s.bills.reduce((min, b) => (b.status === 'ACTIVE' && b.nextDueDate < min ? b.nextDueDate : min), from);
  const [stored, payments] = await Promise.all([
    ctx.db.billCycle.findMany({
      where: { billId: { in: ids }, dueDate: { gte: oldestOpen, lte: to } },
      select: { billId: true, dueDate: true, amountCents: true, isActual: true, closedAt: true },
    }),
    ctx.db.paymentRecord.findMany({
      where: { billId: { in: ids }, cycleDueDate: { gte: oldestOpen, lte: to } },
      select: { billId: true, cycleDueDate: true, amountCents: true },
    }),
  ]);
  const storedBy = new Map<string, Map<string, StoredCycle>>();
  for (const c of stored) {
    const m = storedBy.get(c.billId) ?? new Map<string, StoredCycle>();
    m.set(c.dueDate, c);
    storedBy.set(c.billId, m);
  }
  const paysBy = new Map<string, { cycleDueDate: string; amountCents: number }[]>();
  for (const p of payments) paysBy.set(p.billId, [...(paysBy.get(p.billId) ?? []), p]);

  const out: CycleItem[] = [];
  for (const b of s.bills) {
    for (const c of cyclesBetween(b, storedBy.get(b.id) ?? new Map(), paysBy.get(b.id) ?? [], from, to, s.today)) {
      const open = c.kind !== 'closed' && c.state !== 'PAID';
      out.push({
        ...c,
        bill: { id: b.id, name: b.name, provider: b.provider, amountType: b.amountType, company: b.company, category: b.category },
        nextReminder: open ? (reminderSchedule(c.dueDate, b.reminderOffsets as number[], addDays(s.today, 400)).find((r) => r.date >= s.today)?.date ?? null) : null,
      });
    }
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.bill.name.localeCompare(b.bill.name));
}

export interface Totals {
  count: number;
  expectedCents: number;
  paidCents: number;
  remainingCents: number;
  /** How much of `expectedCents` is still an estimate (variable bills). */
  estimatedCents: number;
}

export function totalsOf(items: readonly Cycle[]): Totals {
  return items.reduce<Totals>(
    (t, c) => ({
      count: t.count + 1,
      expectedCents: t.expectedCents + c.expectedCents,
      paidCents: t.paidCents + Math.min(c.paidCents, c.expectedCents),
      remainingCents: t.remainingCents + c.remainingCents,
      estimatedCents: t.estimatedCents + (c.isEstimate ? c.expectedCents : 0),
    }),
    { count: 0, expectedCents: 0, paidCents: 0, remainingCents: 0, estimatedCents: 0 },
  );
}

/** The same totals per company, largest first — the "All companies" breakdown. */
export function byCompany(items: readonly CycleItem[]) {
  const groups = new Map<string, { company: CycleItem['bill']['company']; items: CycleItem[] }>();
  for (const i of items) {
    const g = groups.get(i.bill.company.id) ?? { company: i.bill.company, items: [] };
    g.items.push(i);
    groups.set(i.bill.company.id, g);
  }
  return [...groups.values()]
    .map((g) => ({ company: g.company, ...totalsOf(g.items) }))
    .sort((a, b) => b.expectedCents - a.expectedCents || a.company.name.localeCompare(b.company.name));
}

/** Outstanding money by how late it is (days past due). */
export function ageing(items: readonly CycleItem[]) {
  const buckets = [
    { label: '0–30', min: 0, max: 30 },
    { label: '31–60', min: 31, max: 60 },
    { label: '61–90', min: 61, max: 90 },
    { label: '90+', min: 91, max: Infinity },
  ];
  return buckets.map((b) => {
    const inBucket = items.filter((i) => i.remainingCents > 0 && i.daysOverdue >= b.min && i.daysOverdue <= b.max && i.state === 'OVERDUE');
    return { bucket: b.label, count: inBucket.length, amountCents: inBucket.reduce((s, i) => s + i.remainingCents, 0) };
  });
}

/** The longest an open cycle can be behind and still be listed (10 years). */
const OUTSTANDING_HORIZON = 3660;

export async function trackingView(ctx: AppContext, req: Request, view: ViewName, opts: { companyId?: string; days?: number; month?: string }) {
  const s = await cycleScope(ctx, req, opts.companyId);
  const { today } = s;
  const thisMonth = monthRange(today);
  let from: string;
  let to: string;
  let pick: (c: CycleItem) => boolean;
  switch (view) {
    case 'upcoming':
    case 'obligations': {
      const days = opts.days ?? 30;
      from = today;
      to = addDays(today, days - 1);
      pick = (c) => c.remainingCents > 0;
      break;
    }
    case 'this-month':
      ({ from, to } = thisMonth);
      pick = () => true;
      break;
    case 'next-month':
      ({ from, to } = monthRange(`${addMonthsKey(today.slice(0, 7), 1)}-01`));
      pick = () => true;
      break;
    case 'outstanding':
      from = addDays(today, -OUTSTANDING_HORIZON);
      to = today;
      pick = (c) => c.kind !== 'closed' && c.remainingCents > 0;
      break;
    case 'overdue':
      from = addDays(today, -OUTSTANDING_HORIZON);
      to = addDays(today, -1);
      pick = (c) => c.state === 'OVERDUE';
      break;
    case 'paid': {
      const month = opts.month ?? today.slice(0, 7);
      ({ from, to } = monthRange(`${month}-01`));
      pick = (c) => c.state === 'PAID' || c.paidCents > 0;
      break;
    }
  }
  const items = (await cyclesIn(ctx, s, from, to)).filter(pick);
  return {
    view,
    from,
    to,
    today,
    totals: totalsOf(items),
    byCompany: byCompany(items),
    ...(view === 'outstanding' || view === 'overdue' ? { ageing: ageing(items) } : {}),
    items,
  };
}

// --- Reports (Finalize brief, Part 6) ---------------------------------------------

const METHODS = ['MOBILE_MONEY', 'BANK_TRANSFER', 'CARD', 'CASH', 'OTHER'] as const;
const pct = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null);

/**
 * Everything a period report needs beyond the totals: the payment report (on time vs late, still
 * unpaid, estimated vs actual, by method, vs the period before, per company), ageing, upcoming
 * 30/60/90 and the category report (sub-categories rolled up into their parent).
 */
export async function periodAnalysis(ctx: AppContext, req: Request, from: string, to: string, companyId?: string) {
  const s = await cycleScope(ctx, req, companyId);
  const { today } = s;
  const days = daysBetween(from, to) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = from.endsWith('-01') && to === monthRange(from).to ? `${addMonthsKey(from.slice(0, 7), -1)}-01` : addDays(from, -days);
  const horizon = addDays(today, 89);
  const [items, prevItems, all, payments, prevPayments, fields, company] = await Promise.all([
    cyclesIn(ctx, s, from, to),
    cyclesIn(ctx, s, prevFrom, prevTo),
    cyclesIn(ctx, s, addDays(today, -3660), horizon > to ? horizon : to),
    ctx.db.paymentRecord.findMany({
      where: { workspaceId: s.workspaceId, cycleDueDate: { gte: from, lte: to }, bill: s.companyWhere },
      select: { billId: true, cycleDueDate: true, paidOn: true, amountCents: true, method: true },
    }),
    ctx.db.paymentRecord.aggregate({ where: { workspaceId: s.workspaceId, paidOn: { gte: prevFrom, lte: prevTo }, bill: s.companyWhere }, _sum: { amountCents: true } }),
    ctx.db.customField.findMany({ where: { workspaceId: s.workspaceId, ...(companyId ? { companyId } : {}) }, orderBy: { sortOrder: 'asc' } }),
    companyId ? ctx.db.company.findFirst({ where: { id: companyId, workspaceId: s.workspaceId }, select: { id: true, name: true } }) : null,
  ]);

  // On time = the cycle's last payment was on or before its due date.
  const lastPaid = new Map<string, string>();
  for (const p of payments) {
    const k = `${p.billId}|${p.cycleDueDate}`;
    if (!lastPaid.has(k) || p.paidOn > lastPaid.get(k)!) lastPaid.set(k, p.paidOn);
  }
  const timing = (list: CycleItem[]) => {
    const paid = list.filter((c) => c.state === 'PAID');
    const onTime = paid.filter((c) => (lastPaid.get(`${c.bill.id}|${c.dueDate}`) ?? c.dueDate) <= c.dueDate).length;
    const unpaid = list.filter((c) => c.remainingCents > 0 && c.dueDate <= today);
    return { paid: paid.length, onTime, late: paid.length - onTime, unpaid: unpaid.length, unpaidCents: unpaid.reduce((t, c) => t + c.remainingCents, 0) };
  };

  // Variable bills: the estimate (the bill's amount) against the cycle's real amount.
  const billById = new Map(s.bills.map((b) => [b.id, b]));
  const variable = items
    .filter((c) => c.bill.amountType === 'VARIABLE')
    .map((c) => ({
      billId: c.bill.id,
      name: c.bill.name,
      company: c.bill.company.name,
      dueDate: c.dueDate,
      estimateCents: billById.get(c.bill.id)?.amountCents ?? c.expectedCents,
      actualCents: c.isEstimate ? null : c.expectedCents,
    }));

  const byMethod = METHODS.map((m) => {
    const list = payments.filter((p) => p.method === m);
    return { method: m, count: list.length, amountCents: list.reduce((t, p) => t + p.amountCents, 0) };
  }).filter((m) => m.count > 0);

  const paidInPeriod = payments.reduce((t, p) => t + p.amountCents, 0);
  const prevPaid = prevPayments._sum.amountCents ?? 0;

  const perCompany = byCompany(items).map((c) => ({ ...c, ...timing(items.filter((i) => i.bill.company.id === c.company.id)) }));

  // Category report: sub-categories roll up into their parent.
  type Cat = { id: string; name: string; color: string; icon: string; expectedCents: number; paidCents: number; remainingCents: number; count: number; subcategories: Omit<Cat, 'subcategories'>[] };
  const tree = new Map<string, Cat>();
  for (const c of items) {
    const b = billById.get(c.bill.id)!;
    const parent = b.category.parent ?? null;
    const top = parent ? { id: parent.id, name: parent.name, color: b.category.color, icon: b.category.icon } : b.category;
    const node = tree.get(top.id) ?? { id: top.id, name: top.name, color: top.color, icon: top.icon, expectedCents: 0, paidCents: 0, remainingCents: 0, count: 0, subcategories: [] };
    node.expectedCents += c.expectedCents;
    node.paidCents += Math.min(c.paidCents, c.expectedCents);
    node.remainingCents += c.remainingCents;
    node.count++;
    if (parent) {
      let sub = node.subcategories.find((x) => x.id === b.category.id);
      if (!sub) {
        sub = { id: b.category.id, name: b.category.name, color: b.category.color, icon: b.category.icon, expectedCents: 0, paidCents: 0, remainingCents: 0, count: 0 };
        node.subcategories.push(sub);
      }
      sub.expectedCents += c.expectedCents;
      sub.paidCents += Math.min(c.paidCents, c.expectedCents);
      sub.remainingCents += c.remainingCents;
      sub.count++;
    }
    tree.set(top.id, node);
  }

  const openAll = all.filter((c) => c.kind !== 'closed' && c.remainingCents > 0);
  const upcomingWithin = (n: number) => totalsOf(openAll.filter((c) => c.dueDate >= today && c.dueDate <= addDays(today, n - 1)));

  // Custom field values per bill, by field name (for exports).
  const fieldViews = fields.map(fieldView);
  const customFor = (billId: string) => {
    const b = billById.get(billId);
    if (!b) return {};
    return Object.fromEntries(describeValues(fieldViews.filter((f) => f.companyId === b.companyId), b.categoryId, b.customValues).map((v) => [v.name, v.value]));
  };

  return {
    company,
    generatedOn: today,
    due: totalsOf(items),
    timing: timing(items),
    paidInPeriodCents: paidInPeriod,
    previous: { from: prevFrom, to: prevTo, due: totalsOf(prevItems), paidCents: prevPaid, changePercent: pct(paidInPeriod, prevPaid) },
    byMethod,
    variable,
    perCompany,
    ageing: ageing(openAll.filter((c) => c.state === 'OVERDUE')),
    upcoming: { days30: upcomingWithin(30), days60: upcomingWithin(60), days90: upcomingWithin(90) },
    categories: [...tree.values()].sort((a, b) => b.expectedCents - a.expectedCents),
    cycles: items.map((c) => ({ ...c, custom: customFor(c.bill.id) })),
    customFieldNames: [...new Set(fieldViews.map((f) => f.name))],
  };
}

export type PeriodAnalysis = Awaited<ReturnType<typeof periodAnalysis>>;
