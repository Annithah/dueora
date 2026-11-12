import type { Request } from 'express';

import type { AppContext } from '../../context.js';
import { addDays, computeStatus, daysBetween, DUE_SOON_DAYS, localTimeIn, type PaymentStatus } from '../../domain/schedule.js';
import { workspaceIdOf } from '../../http/middleware/auth.js';
import { scopedCompanies, viewsFor } from '../bills/service.js';
import { billInclude, type BillView } from '../bills/view.js';

import { addMonthsKey, lastMonths, monthRange, occurrencesBetween } from './projection.js';

/**
 * Dashboard, calendar and reports. Everything is US dollars in integer cents, computed
 * from the database only; an empty workspace yields zeros and empty lists.
 */

/** Everything the insight views need, loaded once per request. */
async function loadScope(ctx: AppContext, req: Request, companyId?: string) {
  const workspaceId = workspaceIdOf(req);
  // The company switcher ("All companies" = undefined), always within the caller's access.
  const companyWhere = scopedCompanies(req, companyId ? [companyId] : undefined);
  const workspace = await ctx.db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const local = localTimeIn(ctx.clock.now(), workspace.timezone);
  const rows = await ctx.db.bill.findMany({
    where: { workspaceId, status: { in: ['ACTIVE', 'COMPLETED'] }, ...companyWhere },
    include: billInclude,
  });
  const views = await viewsFor(ctx, workspaceId, rows, local.date);
  const rowById = new Map(rows.map((r) => [r.id, r]));
  return { workspaceId, workspace, companyWhere, today: local.date, localHour: local.hour, rowById, views };
}

type Scope = Awaited<ReturnType<typeof loadScope>>;

const URGENCY: Record<PaymentStatus, number> = {
  OVERDUE: 0,
  DUE_TODAY: 1,
  PARTIALLY_PAID: 2,
  DUE_SOON: 3,
  UPCOMING: 4,
  PAID: 5,
  ARCHIVED: 6,
};

function lite(v: BillView) {
  return {
    id: v.id,
    name: v.name,
    provider: v.provider,
    company: v.company,
    category: v.category,
    amountCents: v.amountCents,
    remainingCents: v.remainingCents,
    nextDueDate: v.nextDueDate,
    daysUntilDue: v.daysUntilDue,
    paymentStatus: v.paymentStatus,
    frequencyLabel: v.frequencyLabel,
  };
}

async function paymentsBetween(ctx: AppContext, s: Scope, from: string, to: string) {
  return ctx.db.paymentRecord.findMany({
    where: { workspaceId: s.workspaceId, paidOn: { gte: from, lte: to }, bill: s.companyWhere },
    select: {
      amountCents: true,
      paidOn: true,
      cycleDueDate: true,
      reference: true,
      method: true,
      bill: {
        select: {
          id: true,
          name: true,
          provider: true,
          category: { select: { id: true, name: true, color: true, icon: true } },
          company: { select: { id: true, name: true, color: true } },
        },
      },
    },
  });
}

interface Bucket {
  id: string;
  name: string;
  color: string;
  icon?: string;
  amountCents: number;
}

/** Group amounts into buckets (category/company), largest first, with percentage shares. */
function buckets(entries: { key: Omit<Bucket, 'amountCents'>; amountCents: number }[]) {
  const map = new Map<string, Bucket>();
  for (const e of entries) {
    const b = map.get(e.key.id) ?? { ...e.key, amountCents: 0 };
    b.amountCents += e.amountCents;
    map.set(e.key.id, b);
  }
  const list = [...map.values()].filter((b) => b.amountCents > 0).sort((a, b) => b.amountCents - a.amountCents);
  const total = list.reduce((sum, b) => sum + b.amountCents, 0);
  return list.map((b) => ({ ...b, share: total ? Math.round((b.amountCents / total) * 1000) / 10 : 0 }));
}

const pctChange = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null);

// --- Dashboard ---------------------------------------------------------------

export async function dashboard(ctx: AppContext, req: Request, companyId?: string) {
  const s = await loadScope(ctx, req, companyId);
  const { today, views } = s;
  const month = monthRange(today);
  const weekEnd = addDays(today, DUE_SOON_DAYS - 1);
  const active = views.filter((v) => v.status === 'ACTIVE');

  const summary = {
    overdue: { amountCents: 0, count: 0 },
    dueThisWeek: { amountCents: 0, count: 0 },
    dueThisMonth: { amountCents: 0, count: 0 },
  };
  for (const v of active) {
    if (v.paymentStatus === 'OVERDUE') {
      summary.overdue.amountCents += v.remainingCents;
      summary.overdue.count++;
      continue;
    }
    for (const occ of occurrencesBetween(s.rowById.get(v.id)!, today, month.to)) {
      const amount = occ.kind === 'current' ? v.remainingCents : v.amountCents;
      if (amount === 0) continue;
      summary.dueThisMonth.amountCents += amount;
      summary.dueThisMonth.count++;
      if (occ.date <= weekEnd) {
        summary.dueThisWeek.amountCents += amount;
        summary.dueThisWeek.count++;
      }
    }
  }

  // Payments over the last 24 months feed "paid this month", the trend, and the breakdowns.
  const thisMonth = today.slice(0, 7);
  const months = lastMonths(thisMonth, 12);
  const yearAgo = `${months[0]}-01`;
  const payments = await paymentsBetween(ctx, s, `${addMonthsKey(months[0]!, -12)}-01`, today);
  const byMonth = new Map<string, number>(months.map((m) => [m, 0]));
  let paidThisMonth = 0;
  let paidThisMonthCount = 0;
  let paidLastMonth = 0;
  let prevYear = 0;
  const lastYear = payments.filter((p) => p.paidOn >= yearAgo);
  for (const p of payments) {
    const key = p.paidOn.slice(0, 7);
    if (key === thisMonth) {
      paidThisMonth += p.amountCents;
      paidThisMonthCount++;
    }
    if (key === addMonthsKey(thisMonth, -1)) paidLastMonth += p.amountCents;
    if (p.paidOn >= yearAgo) byMonth.set(key, (byMonth.get(key) ?? 0) + p.amountCents);
    else prevYear += p.amountCents;
  }
  const trend = months.map((m) => ({ month: m, amountCents: byMonth.get(m) ?? 0 }));
  const paidYear = trend.reduce((sum, t) => sum + t.amountCents, 0);

  const attention = active
    .filter((v) => ['OVERDUE', 'DUE_TODAY', 'PARTIALLY_PAID', 'DUE_SOON'].includes(v.paymentStatus))
    .sort((a, b) => URGENCY[a.paymentStatus] - URGENCY[b.paymentStatus] || a.daysUntilDue - b.daysUntilDue);

  const timeline = active
    .flatMap((v) =>
      occurrencesBetween(s.rowById.get(v.id)!, today, addDays(today, 30)).map((occ) => ({
        date: occ.date,
        bill: lite(v),
        amountCents: occ.kind === 'current' ? v.remainingCents : v.amountCents,
        status: (occ.kind === 'current'
          ? v.paymentStatus
          : daysBetween(today, occ.date) <= DUE_SOON_DAYS
            ? 'DUE_SOON'
            : 'UPCOMING') as PaymentStatus,
      })),
    )
    .filter((t) => t.amountCents > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.bill.name.localeCompare(b.bill.name));

  return {
    today,
    localHour: s.localHour,
    summary: {
      ...summary,
      paidThisMonth: { amountCents: paidThisMonth, count: paidThisMonthCount, changePercent: pctChange(paidThisMonth, paidLastMonth) },
    },
    needsAttention: attention.slice(0, 5).map(lite),
    needsAttentionCount: attention.length,
    next30Days: timeline.slice(0, 20),
    spending: { months: trend, paidLast12Months: paidYear, changePercent: pctChange(paidYear, prevYear) },
    byCategory: buckets(lastYear.map((p) => ({ key: p.bill.category, amountCents: p.amountCents }))),
    byCompany: buckets(lastYear.map((p) => ({ key: p.bill.company, amountCents: p.amountCents }))),
    counts: { active: active.length, total: views.length, overdue: summary.overdue.count, upcoming30: timeline.length },
  };
}

// --- Calendar ----------------------------------------------------------------

export interface CalendarEvent {
  date: string;
  billId: string;
  name: string;
  company: string;
  categoryIcon: string;
  categoryColor: string;
  amountCents: number;
  status: PaymentStatus;
  kind: 'paid' | 'current' | 'future';
}

export async function calendar(ctx: AppContext, req: Request, from: string, to: string, companyId?: string) {
  const s = await loadScope(ctx, req, companyId);
  const events: CalendarEvent[] = [];

  // Open and projected cycles.
  for (const v of s.views) {
    for (const occ of occurrencesBetween(s.rowById.get(v.id)!, from, to)) {
      const status: PaymentStatus =
        occ.kind === 'current'
          ? v.paymentStatus
          : computeStatus({ status: 'ACTIVE', nextDueDate: occ.date, amountCents: v.amountCents }, [], s.today);
      events.push({
        date: occ.date,
        billId: v.id,
        name: v.name,
        company: v.company.name,
        categoryIcon: v.category.icon,
        categoryColor: v.category.color,
        amountCents: occ.kind === 'current' ? v.remainingCents || v.amountCents : v.amountCents,
        status,
        kind: occ.kind,
      });
    }
  }

  // Closed cycles from payment history (one event per cycle, on its due date).
  const paid = await ctx.db.paymentRecord.groupBy({
    by: ['billId', 'cycleDueDate'],
    where: { workspaceId: s.workspaceId, cycleDueDate: { gte: from, lte: to }, bill: s.companyWhere },
    _sum: { amountCents: true },
  });
  const paidSubs = await ctx.db.bill.findMany({
    where: { workspaceId: s.workspaceId, id: { in: [...new Set(paid.map((p) => p.billId))] }, ...s.companyWhere },
    include: billInclude,
  });
  const subById = new Map(paidSubs.map((x) => [x.id, x]));
  for (const p of paid) {
    const sub = subById.get(p.billId);
    if (!sub) continue;
    if (sub.status === 'ACTIVE' && sub.nextDueDate === p.cycleDueDate) continue; // the open cycle, shown above
    events.push({
      date: p.cycleDueDate,
      billId: sub.id,
      name: sub.name,
      company: sub.company.name,
      categoryIcon: sub.category.icon,
      categoryColor: sub.category.color,
      amountCents: p._sum?.amountCents ?? 0,
      status: 'PAID',
      kind: 'paid',
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || URGENCY[a.status] - URGENCY[b.status] || a.name.localeCompare(b.name));
  return { from, to, today: s.today, events };
}

// --- Reports -----------------------------------------------------------------

export type ReportPeriod = 'month' | 'year';

export async function report(ctx: AppContext, req: Request, period: ReportPeriod, year: number, month?: number, companyId?: string) {
  const s = await loadScope(ctx, req, companyId);
  const { today } = s;
  const from = period === 'year' ? `${year}-01-01` : `${year}-${String(month).padStart(2, '0')}-01`;
  const to = period === 'year' ? `${year}-12-31` : monthRange(from).to;
  const active = s.views.filter((v) => v.status === 'ACTIVE');

  const payments = await paymentsBetween(ctx, s, from, to);
  const paidByMonth = new Map<string, number>();
  let paid = 0;
  for (const p of payments) {
    paid += p.amountCents;
    const mk = p.paidOn.slice(0, 7);
    paidByMonth.set(mk, (paidByMonth.get(mk) ?? 0) + p.amountCents);
  }

  // Still to pay within the period: open cycles (remaining) and projected cycles.
  let outstanding = 0;
  const outstandingItems: { date: string; bill: ReturnType<typeof lite>; amountCents: number; overdue: boolean }[] = [];
  const outstandingByMonth = new Map<string, number>();
  for (const v of active) {
    for (const occ of occurrencesBetween(s.rowById.get(v.id)!, from, to)) {
      const amount = occ.kind === 'current' ? v.remainingCents : v.amountCents;
      if (amount === 0) continue;
      outstanding += amount;
      outstandingItems.push({ date: occ.date, bill: lite(v), amountCents: amount, overdue: occ.date < today });
      const mk = occ.date.slice(0, 7);
      outstandingByMonth.set(mk, (outstandingByMonth.get(mk) ?? 0) + amount);
    }
  }

  const overdueItems = active.filter((v) => v.paymentStatus === 'OVERDUE').map(lite);
  const overdue = overdueItems.reduce((sum, o) => sum + o.remainingCents, 0);

  // 12-month forecast from the current month.
  const forecastMonths = Array.from({ length: 12 }, (_, i) => addMonthsKey(today.slice(0, 7), i));
  const forecast = new Map<string, number>(forecastMonths.map((m) => [m, 0]));
  const horizon = monthRange(`${forecastMonths.at(-1)}-01`).to;
  for (const v of active) {
    for (const occ of occurrencesBetween(s.rowById.get(v.id)!, `${forecastMonths[0]}-01`, horizon)) {
      const mk = occ.date.slice(0, 7);
      forecast.set(mk, (forecast.get(mk) ?? 0) + (occ.kind === 'current' ? v.remainingCents : v.amountCents));
    }
  }

  const monthKeys =
    period === 'year' ? Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`) : [from.slice(0, 7)];

  return {
    period,
    year,
    month: period === 'month' ? month : undefined,
    from,
    to,
    today,
    workspace: { name: s.workspace.name },
    totals: {
      committed: { amountCents: paid + outstanding, count: payments.length + outstandingItems.length },
      paid: { amountCents: paid, count: payments.length },
      outstanding: { amountCents: outstanding, count: outstandingItems.length },
      overdue: { amountCents: overdue, count: overdueItems.length },
    },
    byCategory: buckets(payments.map((p) => ({ key: p.bill.category, amountCents: p.amountCents }))),
    byCompany: buckets(payments.map((p) => ({ key: p.bill.company, amountCents: p.amountCents }))),
    months: monthKeys.map((m) => ({ month: m, paidCents: paidByMonth.get(m) ?? 0, outstandingCents: outstandingByMonth.get(m) ?? 0 })),
    forecast: forecastMonths.map((m) => ({ month: m, amountCents: forecast.get(m) ?? 0 })),
    overdue: overdueItems,
    outstanding: outstandingItems.sort((a, b) => a.date.localeCompare(b.date)),
    payments: payments
      .map((p) => ({
        paidOn: p.paidOn,
        cycleDueDate: p.cycleDueDate,
        name: p.bill.name,
        provider: p.bill.provider,
        company: p.bill.company.name,
        category: p.bill.category.name,
        method: p.method,
        reference: p.reference,
        amountCents: p.amountCents,
      }))
      .sort((a, b) => a.paidOn.localeCompare(b.paidOn)),
  };
}

export type Report = Awaited<ReturnType<typeof report>>;
