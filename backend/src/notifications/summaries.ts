import type { AppContext } from '../context.js';
import { addDays, daysBetween, paidForCycle } from '../domain/schedule.js';
import { formatUSD } from '../lib/format.js';
import { weeklyAiLine } from '../ai/insights.js';
import { addMonthsKey, monthRange, occurrencesBetween } from '../modules/insights/projection.js';

import { monthlySummaryCopy, billLabel, weeklyDigestCopy, type Copy } from './messages.js';
import { createNotification, dedupeKey, prefsFor, billUrl } from './store.js';

/**
 * WEEKLY_DIGEST (Mondays at the reminder hour): the week ahead — count, total, list — plus
 * one line from DueOra AI when it's on. MONTHLY_SUMMARY (the 1st): last month's spending,
 * what's coming this month and the biggest price changes. Opt-in per user
 * (weeklySummary / monthlySummary). Each goes in-app, by push (digest channel) and by email.
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

async function upcoming(ctx: AppContext, workspaceId: string, from: string, to: string) {
  const subs = await ctx.db.bill.findMany({ where: { workspaceId, status: 'ACTIVE' }, include: { company: { select: { name: true } } } });
  const open = subs.length
    ? await ctx.db.paymentRecord.findMany({
        where: { workspaceId, OR: subs.map((s) => ({ billId: s.id, cycleDueDate: s.nextDueDate })) },
        select: { billId: true, cycleDueDate: true, amountCents: true },
      })
    : [];
  const items: { billId: string; cycleDueDate: string; label: string; company: string; provider: string | null; amountCents: number; dueDate: string; daysUntilDue: number; partiallyPaid: boolean; url: string }[] = [];
  for (const s of subs) {
    const paid = paidForCycle(open.filter((p) => p.billId === s.id), s.nextDueDate);
    for (const occ of occurrencesBetween(s, from, to)) {
      const amount = occ.kind === 'current' ? s.amountCents - paid : s.amountCents;
      if (amount <= 0) continue;
      items.push({
        billId: s.id,
        cycleDueDate: occ.date,
        label: billLabel(s.name, s.company.name),
        company: s.company.name,
        provider: s.provider,
        amountCents: amount,
        dueDate: occ.date,
        daysUntilDue: daysBetween(from, occ.date),
        partiallyPaid: occ.kind === 'current' && paid > 0,
        url: billUrl(ctx, s.id),
      });
    }
  }
  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.label.localeCompare(b.label));
}

async function send(
  ctx: AppContext,
  org: Org,
  members: string[],
  opts: { type: 'WEEKLY_DIGEST' | 'MONTHLY_SUMMARY'; period: string; copy: Copy; data: Record<string, unknown>; sendAfter: Date | null },
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
  run: { since: string; today: string; sendAfter: Date | null; members: string[] },
): Promise<number> {
  let created = 0;
  const { since, today } = run;

  const monday = latestIn(since, today, (d) => weekday(d) === 1);
  if (monday) {
    const items = await upcoming(ctx, org.id, today, addDays(today, 6));
    const total = items.reduce((s, i) => s + i.amountCents, 0);
    let aiLine: string | null = null;
    try {
      aiLine = await weeklyAiLine(ctx, org.id, items.map((i) => ({ label: i.label, amountCents: i.amountCents, dueDate: i.dueDate })));
    } catch (err) {
      ctx.logger.warn({ err, workspaceId: org.id }, 'Weekly AI line failed; sending the digest without it');
    }
    created += await send(ctx, org, run.members, {
      type: 'WEEKLY_DIGEST',
      period: monday,
      copy: weeklyDigestCopy({ count: items.length, totalCents: total, aiLine }),
      data: { url: `${ctx.env.APP_URL}calendar`, items, totalCents: total },
      sendAfter: run.sendAfter,
    });
  }

  const first = latestIn(since, today, (d) => d.endsWith('-01'));
  if (first) {
    const lastMonth = addMonthsKey(first.slice(0, 7), -1);
    const prev = monthRange(`${lastMonth}-01`);
    const [paid, changes] = await Promise.all([
      ctx.db.paymentRecord.aggregate({ where: { workspaceId: org.id, paidOn: { gte: prev.from, lte: prev.to } }, _sum: { amountCents: true } }),
      ctx.db.priceChange.findMany({
        where: { workspaceId: org.id, changedAt: { gte: new Date(`${prev.from}T00:00:00Z`), lt: new Date(`${first}T00:00:00Z`) } },
        include: { bill: { select: { name: true, company: { select: { name: true } } } } },
      }),
    ]);
    const coming = await upcoming(ctx, org.id, today, monthRange(today).to);
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
    const copy = monthlySummaryCopy({ monthLabel, paidCents: paid._sum.amountCents ?? 0, comingCents, comingCount: coming.length });
    const changeLine = biggest.length
      ? ` Biggest changes: ${biggest.map((b) => `${b.label} ${formatUSD(b.from)} → ${formatUSD(b.to)}`).join('; ')}.`
      : '';
    created += await send(ctx, org, run.members, {
      type: 'MONTHLY_SUMMARY',
      period: first.slice(0, 7),
      copy: { title: copy.title, body: `${copy.body}${changeLine}` },
      data: { url: `${ctx.env.APP_URL}reports`, items: coming.slice(0, 20), paidCents: paid._sum.amountCents ?? 0, comingCents, changes: biggest },
      sendAfter: run.sendAfter,
    });
  }
  return created;
}
