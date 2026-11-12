import type { AppContext } from '../context.js';
import { weeklyAiLine } from '../ai/insights.js';
import { visibleCompanyIds, type Access } from '../domain/access.js';
import { cyclesBetween, type StoredCycle } from '../domain/cycles.js';
import { addDays, daysBetween } from '../domain/schedule.js';
import { formatUSD } from '../lib/format.js';
import { addMonthsKey, monthRange } from '../modules/insights/projection.js';

import { monthlySummaryCopy, billLabel, nextMonthPreviewCopy, weeklyDigestCopy, type Copy } from './messages.js';
import { companyAllows, createNotification, dedupeKey, prefsFor, billUrl } from './store.js';

/**
 * WEEKLY_DIGEST (Mondays at the reminder hour): the week ahead — count, total, list — what is
 * still owed per company, and one line from DueOra AI when it's on. MONTHLY_SUMMARY (the 1st):
 * last month's report is ready, this month's obligations per company and the biggest price
 * changes. NEXT_MONTH_PREVIEW (the 25th): what next month will cost, per company. Opt-in per user
 * (weeklySummary / monthlySummary; the preview follows monthlySummary), and per company
 * ("summaries"). Each goes in-app, by push (digest channel) and by email.
 */

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** The latest date in (since, today] matching `pred` — so catch-up after downtime still sends one. */
function latestIn(since: string, today: string, pred: (d: string) => boolean): string | null {
  for (let d = today; d > since; d = addDays(d, -1)) if (pred(d)) return d;
  return null;
}

interface Org {
  id: string;
  timezone: string;
}

/** Prisma `companyId` filter for one audience ({} = every company). */
type CompanyWhere = { companyId?: { in: string[] } };

/**
 * Members grouped by what they see in their summaries — their company access minus the companies
 * whose summaries they turned off — so each group's summary only covers its companies.
 */
export function audiences(
  access: Map<string, Access>,
  members: string[],
  hidden: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
  allCompanyIds: readonly string[] = [],
): { where: CompanyWhere; userIds: string[] }[] {
  const groups = new Map<string, { where: CompanyWhere; userIds: string[] }>();
  for (const userId of members) {
    const a = access.get(userId);
    if (!a) continue;
    let ids = visibleCompanyIds(a);
    const off = hidden.get(userId);
    if (off?.size) ids = (ids ?? [...allCompanyIds]).filter((id) => !off.has(id));
    const key = ids ? [...ids].sort().join(',') : '*';
    const g = groups.get(key) ?? { where: ids ? { companyId: { in: ids } } : {}, userIds: [] };
    g.userIds.push(userId);
    groups.set(key, g);
  }
  return [...groups.values()];
}

export interface SummaryItem {
  billId: string;
  cycleDueDate: string;
  label: string;
  company: string;
  provider: string | null;
  amountCents: number;
  dueDate: string;
  daysUntilDue: number;
  partiallyPaid: boolean;
  isEstimate: boolean;
  url: string;
}

/** Unpaid cycles due in [from, to] (the cycle engine: missed cycles and variable amounts included). */
async function unpaidCycles(ctx: AppContext, workspaceId: string, from: string, to: string, today: string, where: CompanyWhere = {}): Promise<SummaryItem[]> {
  const bills = await ctx.db.bill.findMany({ where: { workspaceId, status: 'ACTIVE', ...where }, include: { company: { select: { name: true } } } });
  if (bills.length === 0) return [];
  const ids = bills.map((b) => b.id);
  const oldest = bills.reduce((m, b) => (b.nextDueDate < m ? b.nextDueDate : m), from);
  const [stored, payments] = await Promise.all([
    ctx.db.billCycle.findMany({ where: { billId: { in: ids }, dueDate: { gte: oldest, lte: to } }, select: { billId: true, dueDate: true, amountCents: true, isActual: true, closedAt: true } }),
    ctx.db.paymentRecord.findMany({ where: { billId: { in: ids }, cycleDueDate: { gte: oldest, lte: to } }, select: { billId: true, cycleDueDate: true, amountCents: true } }),
  ]);
  const items: SummaryItem[] = [];
  for (const b of bills) {
    const own = new Map<string, StoredCycle>(stored.filter((c) => c.billId === b.id).map((c) => [c.dueDate, c]));
    for (const c of cyclesBetween(b, own, payments.filter((p) => p.billId === b.id), from, to, today)) {
      if (c.kind === 'closed' || c.remainingCents <= 0) continue;
      items.push({
        billId: b.id,
        cycleDueDate: c.dueDate,
        label: billLabel(b.name, b.company.name),
        company: b.company.name,
        provider: b.provider,
        amountCents: c.remainingCents,
        dueDate: c.dueDate,
        daysUntilDue: daysBetween(today, c.dueDate),
        partiallyPaid: c.paidCents > 0,
        isEstimate: c.isEstimate,
        url: billUrl(ctx, b.id),
      });
    }
  }
  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.label.localeCompare(b.label));
}

function perCompany(items: readonly SummaryItem[]) {
  const by = new Map<string, number>();
  for (const i of items) by.set(i.company, (by.get(i.company) ?? 0) + i.amountCents);
  return [...by.entries()].map(([company, amountCents]) => ({ company, amountCents })).sort((a, b) => b.amountCents - a.amountCents);
}

type SummaryType = 'WEEKLY_DIGEST' | 'MONTHLY_SUMMARY' | 'NEXT_MONTH_PREVIEW';

async function send(
  ctx: AppContext,
  org: Org,
  members: string[],
  opts: { type: SummaryType; period: string; copy: Copy; data: Record<string, unknown>; sendAfter: Date | null },
): Promise<number> {
  let created = 0;
  for (const userId of members) {
    const prefs = await prefsFor(ctx, userId, org.id);
    if (opts.type === 'WEEKLY_DIGEST' ? !prefs.weeklySummary : !prefs.monthlySummary) continue;
    const base = { workspaceId: org.id, userId, type: opts.type, title: opts.copy.title, body: opts.copy.body, data: opts.data };
    const key = (channel: string) => dedupeKey([org.id, null, opts.type, opts.period, null, userId, channel]);
    if (prefs.inAppEnabled && (await createNotification(ctx, { ...base, channel: 'IN_APP', dedupeKey: key('IN_APP') }))) created++;
    const hasDevice = (await ctx.db.deviceToken.count({ where: { userId, active: true } })) > 0;
    if (prefs.pushEnabled && hasDevice && (await createNotification(ctx, { ...base, channel: 'PUSH', dedupeKey: key('PUSH') }, { sendAfter: opts.sendAfter }))) created++;
    if (prefs.emailEnabled && (await createNotification(ctx, { ...base, channel: 'EMAIL', dedupeKey: key('EMAIL') }, { sendAfter: opts.sendAfter }))) created++;
  }
  return created;
}

export async function runSummaries(
  ctx: AppContext,
  org: Org,
  run: { since: string; today: string; sendAfter: Date | null; members: string[]; access: Map<string, Access> },
): Promise<number> {
  // Companies each member turned summaries off for.
  const companies = (await ctx.db.company.findMany({ where: { workspaceId: org.id }, select: { id: true } })).map((c) => c.id);
  const hidden = new Map<string, Set<string>>();
  for (const userId of run.members) {
    const prefs = await prefsFor(ctx, userId, org.id);
    const off = companies.filter((id) => !companyAllows(prefs, id, 'summaries'));
    if (off.length) hidden.set(userId, new Set(off));
  }
  let created = 0;
  for (const group of audiences(run.access, run.members, hidden, companies)) {
    created += await summariesFor(ctx, org, run, group.where, group.userIds);
  }
  return created;
}

async function summariesFor(
  ctx: AppContext,
  org: Org,
  run: { since: string; today: string; sendAfter: Date | null },
  where: CompanyWhere,
  members: string[],
): Promise<number> {
  let created = 0;
  const { since, today } = run;

  const monday = latestIn(since, today, (d) => weekday(d) === 1);
  if (monday) {
    const items = (await unpaidCycles(ctx, org.id, addDays(today, -3660), addDays(today, 6), today, where)).filter((i) => i.dueDate >= today);
    const owed = await unpaidCycles(ctx, org.id, addDays(today, -3660), addDays(today, -1), today, where);
    const total = items.reduce((s, i) => s + i.amountCents, 0);
    let aiLine: string | null = null;
    try {
      aiLine = await weeklyAiLine(ctx, org.id, items.map((i) => ({ label: i.label, amountCents: i.amountCents, dueDate: i.dueDate })));
    } catch (err) {
      ctx.logger.warn({ err, workspaceId: org.id }, 'Weekly AI line failed; sending the digest without it');
    }
    const outstanding = perCompany(owed);
    created += await send(ctx, org, members, {
      type: 'WEEKLY_DIGEST',
      period: monday,
      copy: weeklyDigestCopy({ count: items.length, totalCents: total, aiLine, outstanding }),
      data: { url: `${ctx.env.APP_URL}calendar`, items, totalCents: total, outstanding },
      sendAfter: run.sendAfter,
    });
  }

  const first = latestIn(since, today, (d) => d.endsWith('-01'));
  if (first) {
    const lastMonth = addMonthsKey(first.slice(0, 7), -1);
    const prev = monthRange(`${lastMonth}-01`);
    const [paid, changes] = await Promise.all([
      ctx.db.paymentRecord.aggregate({ where: { workspaceId: org.id, paidOn: { gte: prev.from, lte: prev.to }, bill: where }, _sum: { amountCents: true } }),
      ctx.db.priceChange.findMany({
        where: { workspaceId: org.id, changedAt: { gte: new Date(`${prev.from}T00:00:00Z`), lt: new Date(`${first}T00:00:00Z`) }, bill: where },
        include: { bill: { select: { name: true, company: { select: { name: true } } } } },
      }),
    ]);
    const month = monthRange(today);
    const coming = await unpaidCycles(ctx, org.id, month.from, month.to, today, where);
    const comingCents = coming.reduce((s, i) => s + i.amountCents, 0);
    const biggest = changes
      .map((c) => ({
        label: billLabel(c.bill.name, c.bill.company.name),
        from: c.oldAmountCents,
        to: c.newAmountCents,
        delta: c.newAmountCents - c.oldAmountCents,
      }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3);
    const monthLabel = MONTH_NAMES[Number(lastMonth.slice(5, 7)) - 1]!;
    const split = perCompany(coming);
    const copy = monthlySummaryCopy({ monthLabel, paidCents: paid._sum.amountCents ?? 0, comingCents, comingCount: coming.length, perCompany: split });
    const changeLine = biggest.length
      ? ` Biggest changes: ${biggest.map((b) => `${b.label} ${formatUSD(b.from)} → ${formatUSD(b.to)}`).join('; ')}.`
      : '';
    created += await send(ctx, org, members, {
      type: 'MONTHLY_SUMMARY',
      period: first.slice(0, 7),
      copy: { title: copy.title, body: `${copy.body}${changeLine}` },
      data: {
        url: `${ctx.env.APP_URL}reports?period=month&month=${lastMonth}`,
        items: coming.slice(0, 20),
        paidCents: paid._sum.amountCents ?? 0,
        comingCents,
        perCompany: split,
        changes: biggest,
      },
      sendAfter: run.sendAfter,
    });
  }

  const preview = latestIn(since, today, (d) => d.endsWith('-25'));
  if (preview) {
    const nextKey = addMonthsKey(preview.slice(0, 7), 1);
    const next = monthRange(`${nextKey}-01`);
    const items = await unpaidCycles(ctx, org.id, next.from, next.to, today, where);
    const total = items.reduce((s, i) => s + i.amountCents, 0);
    const split = perCompany(items);
    const monthLabel = MONTH_NAMES[Number(nextKey.slice(5, 7)) - 1]!;
    created += await send(ctx, org, members, {
      type: 'NEXT_MONTH_PREVIEW',
      period: nextKey,
      copy: nextMonthPreviewCopy({ monthLabel, count: items.length, totalCents: total, perCompany: split }),
      data: { url: `${ctx.env.APP_URL}bills?view=next-month`, items: items.slice(0, 20), totalCents: total, perCompany: split },
      sendAfter: run.sendAfter,
    });
  }
  return created;
}
