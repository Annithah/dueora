import type { Request } from 'express';

import type { AppContext } from '../../context.js';
import { addDays, computeStatus, daysBetween, DUE_SOON_DAYS, localTimeIn, type PaymentStatus } from '../../domain/schedule.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { actorOf, orgIdOf } from '../../http/middleware/auth.js';
import { viewsFor } from '../obligations/service.js';
import { obligationInclude, type ObligationView } from '../obligations/view.js';

import { addTo, Converter, totalsList, type CurrencyTotals } from './money.js';
import { addMonthsKey, lastMonths, monthRange, occurrencesBetween } from './projection.js';

/** Everything the insight views need, loaded once and scoped to what the caller may see. */
async function loadScope(ctx: AppContext, req: Request) {
  const orgId = orgIdOf(req);
  const actor = actorOf(req);
  const org = await ctx.db.organization.findUniqueOrThrow({ where: { id: orgId }, include: { exchangeRates: true } });
  const local = localTimeIn(ctx.clock.now(), org.timezone);
  const scope: Prisma.ObligationWhereInput = {
    organizationId: orgId,
    ...(actor.role === 'EMPLOYEE' ? { assigneeUserId: actor.userId } : {}),
  };
  const rows = await ctx.db.obligation.findMany({ where: { ...scope, status: { in: ['ACTIVE', 'COMPLETED'] } }, include: obligationInclude });
  const views = await viewsFor(ctx, orgId, rows, local.date);
  return {
    orgId,
    org,
    today: local.date,
    localHour: local.hour,
    rows,
    views,
    scope,
    converter: new Converter(org.defaultCurrency, org.exchangeRates),
  };
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

function lite(v: ObligationView) {
  return {
    id: v.id,
    name: v.name,
    provider: v.provider,
    icon: v.icon,
    platform: v.platform,
    category: v.category,
    amountMinor: v.amountMinor,
    remainingMinor: v.remainingMinor,
    currency: v.currency,
    nextDueDate: v.nextDueDate,
    daysUntilDue: v.daysUntilDue,
    paymentStatus: v.paymentStatus,
    frequencyLabel: v.frequencyLabel,
  };
}

async function paymentsBetween(ctx: AppContext, s: Scope, from: string, to: string) {
  return ctx.db.paymentRecord.findMany({
    where: { organizationId: s.orgId, paidOn: { gte: from, lte: to }, obligation: s.scope },
    select: {
      amountMinor: true,
      currency: true,
      paidOn: true,
      cycleDueDate: true,
      obligation: { select: { id: true, name: true, provider: true, category: { select: { id: true, name: true, color: true, icon: true } }, platform: { select: { name: true } } } },
    },
  });
}

// --- Dashboard ---------------------------------------------------------------

export async function dashboard(ctx: AppContext, req: Request) {
  const s = await loadScope(ctx, req);
  const { today, views, converter } = s;
  const month = monthRange(today);
  const weekEnd = addDays(today, DUE_SOON_DAYS - 1);
  const active = views.filter((v) => v.status === 'ACTIVE');

  const overdue: CurrencyTotals = {};
  const week: CurrencyTotals = {};
  const monthDue: CurrencyTotals = {};
  let overdueCount = 0;
  let weekCount = 0;
  let monthCount = 0;
  for (const v of active) {
    if (v.paymentStatus === 'OVERDUE') {
      addTo(overdue, v.currency, v.remainingMinor);
      overdueCount++;
      continue;
    }
    for (const occ of occurrencesBetween(s.rows.find((r) => r.id === v.id)!, today, month.to)) {
      const amount = occ.kind === 'current' ? v.remainingMinor : v.amountMinor;
      if (amount === 0) continue;
      addTo(monthDue, v.currency, amount);
      monthCount++;
      if (occ.date <= weekEnd) {
        addTo(week, v.currency, amount);
        weekCount++;
      }
    }
  }

  // Payments over the last 12 months feed "paid this month", the trend chart and the donut.
  const months = lastMonths(today.slice(0, 7), 12);
  const yearAgo = `${months[0]}-01`;
  const prevMonth = addMonthsKey(today.slice(0, 7), -1);
  const payments = await paymentsBetween(ctx, s, `${addMonthsKey(months[0]!, -12)}-01`, today);
  const paidThisMonth: CurrencyTotals = {};
  const paidLastMonth: CurrencyTotals = {};
  const byMonth = new Map<string, CurrencyTotals>(months.map((m) => [m, {}]));
  const prevYear: CurrencyTotals = {};
  const byCategory = new Map<string, { id: string; name: string; color: string; icon: string; totals: CurrencyTotals }>();
  let paidThisMonthCount = 0;
  for (const p of payments) {
    const key = p.paidOn.slice(0, 7);
    if (key === today.slice(0, 7)) {
      addTo(paidThisMonth, p.currency, p.amountMinor);
      paidThisMonthCount++;
    }
    if (key === prevMonth) addTo(paidLastMonth, p.currency, p.amountMinor);
    if (p.paidOn >= yearAgo) {
      addTo(byMonth.get(key) ?? {}, p.currency, p.amountMinor);
      const c = p.obligation.category;
      const entry = byCategory.get(c.id) ?? { ...c, totals: {} };
      addTo(entry.totals, p.currency, p.amountMinor);
      byCategory.set(c.id, entry);
    } else {
      addTo(prevYear, p.currency, p.amountMinor);
    }
  }

  const trend = months.map((m) => ({ month: m, amountMinor: converter.total(byMonth.get(m) ?? {}) }));
  const paidYear = trend.reduce((sum, t) => sum + t.amountMinor, 0);
  const prevYearTotal = converter.total(prevYear);
  const thisMonthTotal = converter.total(paidThisMonth);
  const lastMonthTotal = converter.total(paidLastMonth);
  const categories = [...byCategory.values()]
    .map((c) => ({ id: c.id, name: c.name, color: c.color, icon: c.icon, amountMinor: converter.total(c.totals) }))
    .filter((c) => c.amountMinor > 0)
    .sort((a, b) => b.amountMinor - a.amountMinor);
  const categoryTotal = categories.reduce((sum, c) => sum + c.amountMinor, 0);

  const attention = active
    .filter((v) => ['OVERDUE', 'DUE_TODAY', 'PARTIALLY_PAID', 'DUE_SOON'].includes(v.paymentStatus))
    .sort((a, b) => URGENCY[a.paymentStatus] - URGENCY[b.paymentStatus] || a.daysUntilDue - b.daysUntilDue);

  const timeline = active
    .flatMap((v) =>
      occurrencesBetween(s.rows.find((r) => r.id === v.id)!, addDays(today, 1), addDays(today, 30)).map((occ) => ({
        date: occ.date,
        obligation: lite(v),
        amountMinor: occ.kind === 'current' ? v.remainingMinor : v.amountMinor,
        status: (daysBetween(today, occ.date) <= DUE_SOON_DAYS ? 'DUE_SOON' : 'UPCOMING') as PaymentStatus,
      })),
    )
    .filter((t) => t.amountMinor > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.obligation.name.localeCompare(b.obligation.name));

  return {
    today,
    localHour: s.localHour,
    defaultCurrency: s.org.defaultCurrency,
    missingRates: [...converter.missing],
    summary: {
      overdue: converter.summary(overdue, overdueCount),
      dueThisWeek: converter.summary(week, weekCount),
      dueThisMonth: converter.summary(monthDue, monthCount),
      paidThisMonth: {
        ...converter.summary(paidThisMonth, paidThisMonthCount),
        changePercent: lastMonthTotal > 0 ? Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 1000) / 10 : null,
      },
    },
    needsAttention: attention.slice(0, 5).map(lite),
    needsAttentionCount: attention.length,
    next30Days: timeline.slice(0, 12),
    spending: {
      months: trend,
      paidLast12Months: paidYear,
      changePercent: prevYearTotal > 0 ? Math.round(((paidYear - prevYearTotal) / prevYearTotal) * 1000) / 10 : null,
    },
    byCategory: categories.map((c) => ({ ...c, share: categoryTotal ? Math.round((c.amountMinor / categoryTotal) * 1000) / 10 : 0 })),
    counts: {
      active: active.length,
      overdue: overdueCount,
      upcoming30: timeline.length,
    },
  };
}

// --- Calendar ----------------------------------------------------------------

export interface CalendarEvent {
  date: string;
  obligationId: string;
  name: string;
  provider: string;
  icon: string;
  platform: string | null;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  kind: 'paid' | 'current' | 'future';
}

export async function calendar(ctx: AppContext, req: Request, from: string, to: string): Promise<{ from: string; to: string; today: string; events: CalendarEvent[] }> {
  const s = await loadScope(ctx, req);
  const events: CalendarEvent[] = [];

  // Projected and open cycles.
  for (const v of s.views) {
    const row = s.rows.find((r) => r.id === v.id)!;
    for (const occ of occurrencesBetween(row, from, to)) {
      const status: PaymentStatus =
        occ.kind === 'current'
          ? v.paymentStatus
          : computeStatus({ status: 'ACTIVE', nextDueDate: occ.date, amountMinor: v.amountMinor }, [], s.today);
      events.push({
        date: occ.date,
        obligationId: v.id,
        name: v.name,
        provider: v.provider,
        icon: v.icon,
        platform: v.platform?.name ?? null,
        amountMinor: occ.kind === 'current' ? v.remainingMinor || v.amountMinor : v.amountMinor,
        currency: v.currency,
        status,
        kind: occ.kind,
      });
    }
  }

  // Closed cycles, from payment history (one event per cycle, on its due date).
  const paid = await ctx.db.paymentRecord.groupBy({
    by: ['obligationId', 'cycleDueDate', 'currency'],
    where: { organizationId: s.orgId, cycleDueDate: { gte: from, lte: to }, obligation: s.scope },
    _sum: { amountMinor: true },
  });
  const allObligations = await ctx.db.obligation.findMany({
    where: { id: { in: [...new Set(paid.map((p) => p.obligationId))] } },
    include: obligationInclude,
  });
  for (const p of paid) {
    const o = allObligations.find((x) => x.id === p.obligationId);
    if (!o) continue;
    const isOpen = o.status === 'ACTIVE' && o.nextDueDate === p.cycleDueDate;
    if (isOpen) continue; // shown above as the current (partly paid) cycle
    events.push({
      date: p.cycleDueDate,
      obligationId: o.id,
      name: o.name,
      provider: o.provider,
      icon: o.icon ?? o.category.icon,
      platform: o.platform?.name ?? null,
      amountMinor: p._sum.amountMinor ?? 0,
      currency: p.currency,
      status: 'PAID',
      kind: 'paid',
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || URGENCY[a.status] - URGENCY[b.status] || a.name.localeCompare(b.name));
  return { from, to, today: s.today, events };
}

// --- Reports -----------------------------------------------------------------

export type ReportPeriod = 'month' | 'year';

export async function report(ctx: AppContext, req: Request, period: ReportPeriod, year: number, month?: number) {
  const s = await loadScope(ctx, req);
  const { converter, today } = s;
  const from = period === 'year' ? `${year}-01-01` : `${year}-${String(month).padStart(2, '0')}-01`;
  const to = period === 'year' ? `${year}-12-31` : monthRange(from).to;

  const payments = await paymentsBetween(ctx, s, from, to);
  const paid: CurrencyTotals = {};
  const paidByCategory = new Map<string, { id: string; name: string; color: string; icon: string; totals: CurrencyTotals }>();
  const paidByMonth = new Map<string, CurrencyTotals>();
  for (const p of payments) {
    addTo(paid, p.currency, p.amountMinor);
    const c = p.obligation.category;
    const entry = paidByCategory.get(c.id) ?? { ...c, totals: {} };
    addTo(entry.totals, p.currency, p.amountMinor);
    paidByCategory.set(c.id, entry);
    const mk = p.paidOn.slice(0, 7);
    addTo(paidByMonth.get(mk) ?? paidByMonth.set(mk, {}).get(mk)!, p.currency, p.amountMinor);
  }

  // Still to pay within the period: open cycles (remaining) and projected cycles.
  const outstanding: CurrencyTotals = {};
  const outstandingItems: { date: string; obligation: ReturnType<typeof lite>; amountMinor: number; overdue: boolean }[] = [];
  const committedByMonth = new Map<string, CurrencyTotals>();
  for (const v of s.views.filter((x) => x.status === 'ACTIVE')) {
    const row = s.rows.find((r) => r.id === v.id)!;
    for (const occ of occurrencesBetween(row, from, to)) {
      const amount = occ.kind === 'current' ? v.remainingMinor : v.amountMinor;
      if (amount === 0) continue;
      addTo(outstanding, v.currency, amount);
      outstandingItems.push({ date: occ.date, obligation: lite(v), amountMinor: amount, overdue: occ.date < today });
      const mk = occ.date.slice(0, 7);
      addTo(committedByMonth.get(mk) ?? committedByMonth.set(mk, {}).get(mk)!, v.currency, amount);
    }
  }

  const overdueItems = s.views.filter((v) => v.paymentStatus === 'OVERDUE').map(lite);
  const overdueTotals: CurrencyTotals = {};
  for (const o of overdueItems) addTo(overdueTotals, o.currency, o.remainingMinor);

  const committed: CurrencyTotals = { ...paid };
  for (const [cur, amt] of Object.entries(outstanding)) addTo(committed, cur, amt);

  // 12-month forecast from the current month.
  const forecastMonths = Array.from({ length: 12 }, (_, i) => addMonthsKey(today.slice(0, 7), i));
  const forecastTotals = new Map<string, CurrencyTotals>(forecastMonths.map((m) => [m, {}]));
  const horizon = monthRange(`${forecastMonths.at(-1)}-01`).to;
  for (const v of s.views.filter((x) => x.status === 'ACTIVE')) {
    for (const occ of occurrencesBetween(s.rows.find((r) => r.id === v.id)!, `${forecastMonths[0]}-01`, horizon)) {
      const amount = occ.kind === 'current' ? v.remainingMinor : v.amountMinor;
      addTo(forecastTotals.get(occ.date.slice(0, 7))!, v.currency, amount);
    }
  }

  const categories = [...paidByCategory.values()]
    .map((c) => ({ id: c.id, name: c.name, color: c.color, icon: c.icon, totals: totalsList(c.totals), amountMinor: converter.total(c.totals) }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
  const categoryTotal = categories.reduce((sum, c) => sum + c.amountMinor, 0);
  const monthKeys = period === 'year' ? Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`) : [from.slice(0, 7)];

  return {
    period,
    year,
    month: period === 'month' ? month : undefined,
    from,
    to,
    today,
    defaultCurrency: s.org.defaultCurrency,
    organization: { name: s.org.name, logoUrl: s.org.logoUrl },
    totals: {
      committed: converter.summary(committed, payments.length + outstandingItems.length),
      paid: converter.summary(paid, payments.length),
      outstanding: converter.summary(outstanding, outstandingItems.length),
      overdue: converter.summary(overdueTotals, overdueItems.length),
    },
    byCategory: categories.map((c) => ({ ...c, share: categoryTotal ? Math.round((c.amountMinor / categoryTotal) * 1000) / 10 : 0 })),
    months: monthKeys.map((m) => ({
      month: m,
      paidMinor: converter.total(paidByMonth.get(m) ?? {}),
      outstandingMinor: converter.total(committedByMonth.get(m) ?? {}),
    })),
    forecast: forecastMonths.map((m) => ({ month: m, amountMinor: converter.total(forecastTotals.get(m) ?? {}) })),
    overdue: overdueItems,
    outstanding: outstandingItems.sort((a, b) => a.date.localeCompare(b.date)),
    payments: payments
      .map((p) => ({
        paidOn: p.paidOn,
        cycleDueDate: p.cycleDueDate,
        name: p.obligation.name,
        provider: p.obligation.provider,
        platform: p.obligation.platform?.name ?? null,
        category: p.obligation.category.name,
        amountMinor: p.amountMinor,
        currency: p.currency,
      }))
      .sort((a, b) => a.paidOn.localeCompare(b.paidOn)),
    missingRates: [...converter.missing],
  };
}

export type Report = Awaited<ReturnType<typeof report>>;
