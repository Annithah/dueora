import type { AppContext } from '../context.js';
import { addDays, todayIn } from '../domain/schedule.js';
import { guessCategoryName, parseFrequency } from '../domain/guess.js';
import { formatUSD, plural } from '../lib/format.js';
import { occurrencesBetween } from '../modules/insights/projection.js';

import { logUsage } from './chat.js';

/**
 * Proactive DueOra AI: the daily dashboard insight card (cached per workspace and day),
 * the one-line comment in the weekly digest, and smart-form suggestions. Facts are always
 * computed here from the workspace's own data; the model only phrases them. Without AI,
 * a plain sentence built from the same facts is used, so the card never goes blank.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PHRASE = 'You are DueOra AI. Write ONE short, warm sentence (max 140 characters, at most one emoji) for a dashboard card, using only the facts given. Amounts are USD. No preamble.';

async function facts(ctx: AppContext, workspaceId: string, today: string) {
  const subs = await ctx.db.bill.findMany({ where: { workspaceId, status: 'ACTIVE' }, include: { company: { select: { name: true } } } });
  const horizon = addDays(today, 90);
  const byMonth = new Map<string, { count: number; cents: number }>();
  for (const s of subs) {
    for (const occ of occurrencesBetween(s, addDays(today, 1), horizon)) {
      // Renewals worth planning for: yearly ones and anything large.
      if (s.frequencyUnit !== 'YEAR' && s.amountCents < 50_000) continue;
      const k = occ.date.slice(0, 7);
      const e = byMonth.get(k) ?? { count: 0, cents: 0 };
      byMonth.set(k, { count: e.count + 1, cents: e.cents + s.amountCents });
    }
  }
  const peak = [...byMonth.entries()].sort((a, b) => b[1].cents - a[1].cents)[0];
  const overdue = subs.filter((s) => s.nextDueDate < today);
  const trials = subs.filter((s) => s.isTrial && s.trialEndsOn && s.trialEndsOn >= today && s.trialEndsOn <= addDays(today, 7));
  const increases = await ctx.db.priceChange.count({ where: { workspaceId, changedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } });
  return {
    activeCount: subs.length,
    overdue: overdue.length,
    trialsEndingThisWeek: trials.map((t) => t.name),
    priceChangesLast30Days: increases,
    biggestRenewalMonth: peak ? { month: MONTHS[Number(peak[0].slice(5, 7)) - 1], count: peak[1].count, total: formatUSD(peak[1].cents) } : null,
  };
}

function plainInsight(f: Awaited<ReturnType<typeof facts>>): string | null {
  if (f.activeCount === 0) return null;
  if (f.overdue > 0) return `${plural(f.overdue, 'bill')} ${f.overdue === 1 ? 'is' : 'are'} overdue — recording ${f.overdue === 1 ? 'it' : 'them'} keeps reminders quiet. ⚠️`;
  if (f.trialsEndingThisWeek.length) return `🎁 ${f.trialsEndingThisWeek[0]}'s free trial ends this week — keep it or cancel it?`;
  if (f.biggestRenewalMonth) return `${plural(f.biggestRenewalMonth.count, 'renewal')} in ${f.biggestRenewalMonth.month} totalling ${f.biggestRenewalMonth.total} — plan ahead. 📅`;
  return 'Everything is on track. Nice work! 🎉';
}

/** GET /ai/insight — one sentence for today's dashboard, cached for the day. */
export async function dailyInsight(ctx: AppContext, workspaceId: string, userId: string): Promise<{ text: string | null; source: 'ai' | 'plain' | 'cache' }> {
  const ws = await ctx.db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { timezone: true, aiEnabled: true } });
  const today = todayIn(ctx.clock.now(), ws.timezone);
  const cached = await ctx.db.aiInsight.findUnique({ where: { workspaceId_localDate: { workspaceId, localDate: today } } });
  if (cached) return { text: cached.text, source: 'cache' };
  const f = await facts(ctx, workspaceId, today);
  const plain = plainInsight(f);
  if (!plain) return { text: null, source: 'plain' };
  let text = plain;
  let source: 'ai' | 'plain' = 'plain';
  if (ws.aiEnabled && ctx.ai) {
    try {
      const r = await ctx.ai.complete(PHRASE, `Facts (JSON): ${JSON.stringify(f)}\nThe most useful single point is: ${plain}`);
      if (r.text && r.text.length <= 200) {
        text = r.text;
        source = 'ai';
      }
      await logUsage(ctx, workspaceId, userId, ctx.ai.name, 'insight', r.usage);
    } catch (err) {
      ctx.logger.warn({ err: err instanceof Error ? err.message : err }, 'Insight phrasing failed; using the plain sentence');
    }
  }
  try {
    await ctx.db.aiInsight.create({ data: { workspaceId, localDate: today, text, createdAt: ctx.clock.now() } });
  } catch {
    // Another request cached it first — fine.
  }
  return { text, source };
}

/** One line from DueOra AI for the weekly digest; null when AI is off or fails. */
export async function weeklyAiLine(ctx: AppContext, workspaceId: string, items: { label: string; amountCents: number; dueDate: string }[]): Promise<string | null> {
  if (!ctx.ai || items.length === 0) return null;
  const ws = await ctx.db.workspace.findUnique({ where: { id: workspaceId }, select: { aiEnabled: true } });
  if (!ws?.aiEnabled) return null;
  const biggest = [...items].sort((a, b) => b.amountCents - a.amountCents)[0]!;
  const r = await ctx.ai.complete(
    'You are DueOra AI. Write ONE short, friendly tip (max 100 characters) about the week ahead, from the facts only. Amounts are USD. No emoji spam.',
    `This week: ${items.length} payments, biggest is ${biggest.label} ${formatUSD(biggest.amountCents)} on ${biggest.dueDate}.`,
  );
  return r.text && r.text.length <= 140 ? r.text : null;
}

/** Smart form: a category for what the user is typing. AI when on, keywords otherwise. */
export async function suggestCategory(ctx: AppContext, workspaceId: string, userId: string, name: string, provider?: string) {
  const categories = await ctx.db.category.findMany({ where: { OR: [{ workspaceId }, { workspaceId: null }] }, select: { id: true, name: true } });
  const byName = (n: string | null | undefined) => (n ? categories.find((c) => c.name.toLowerCase() === n.trim().toLowerCase()) : undefined);
  const keyword = byName(guessCategoryName(`${name} ${provider ?? ''}`));
  const ws = await ctx.db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { aiEnabled: true } });
  if (ws.aiEnabled && ctx.ai && name.trim().length >= 3) {
    try {
      const r = await ctx.ai.complete(
        `Pick the single best category for a bill. Answer with exactly one of these names and nothing else: ${categories.map((c) => c.name).join(' | ')}`,
        `Bill: "${name.slice(0, 120)}"${provider ? `, provider "${provider.slice(0, 120)}"` : ''}`,
      );
      await logUsage(ctx, workspaceId, userId, ctx.ai.name, 'suggest', r.usage);
      const hit = byName(r.text.replace(/["'.]/g, ''));
      if (hit) return { categoryId: hit.id, categoryName: hit.name, source: 'ai' as const };
    } catch {
      // Fall back to keywords.
    }
  }
  return keyword ? { categoryId: keyword.id, categoryName: keyword.name, source: 'keywords' as const } : null;
}

/** Import help: guess frequency and category for rows the parser couldn't read. */
export async function suggestImportFixes(
  ctx: AppContext,
  workspaceId: string,
  userId: string,
  rows: { line: number; name: string; provider?: string; frequency?: string; category?: string }[],
) {
  const out: { line: number; frequency?: string; category?: string }[] = [];
  for (const r of rows.slice(0, 50)) {
    const fix: { line: number; frequency?: string; category?: string } = { line: r.line };
    if (r.frequency && !parseFrequency(r.frequency)) {
      const t = r.frequency.toLowerCase();
      fix.frequency = /year|annu|an\b/.test(t) ? 'Yearly' : /quart|trim/.test(t) ? 'Quarterly' : /week|sem/.test(t) ? 'Weekly' : /month|mois|mens/.test(t) ? 'Monthly' : undefined;
    }
    if (!r.category) {
      const s = await suggestCategory(ctx, workspaceId, userId, r.name, r.provider);
      if (s) fix.category = s.categoryName;
    }
    if (fix.frequency || fix.category) out.push(fix);
  }
  return out;
}
