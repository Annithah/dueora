import { randomUUID } from 'node:crypto';

import type { FunctionDeclaration } from '@google/genai';
import type { Request } from 'express';

import type { AppContext } from '../context.js';
import { can } from '../domain/permissions.js';
import { addDays, advance, isLeapYear, parseDate } from '../domain/schedule.js';
import { guessCategoryName } from '../domain/guess.js';
import { actorOf, workspaceIdOf } from '../http/middleware/auth.js';
import { budgetProgress } from '../modules/budgets/service.js';
import { dashboard, report } from '../modules/insights/service.js';
import { listBills, workspaceToday, type BillSort } from '../modules/bills/service.js';
import type { BillView } from '../modules/bills/view.js';
import { addMonthsKey, monthRange, occurrencesBetween } from '../modules/insights/projection.js';

import { searchArticles } from './knowledge.js';

/**
 * DueOra AI's tools. Read tools answer from the workspace's own data through the same
 * services the app uses (so roles and workspace isolation apply). Write tools are
 * *proposals*: they return a confirmation card and change nothing — the change runs only
 * when the user taps Confirm (actions.ts). Account references are never part of any result.
 */

export type Card =
  | { type: 'bills'; title: string; items: { id: string; name: string; company: string; amountCents: number; nextDueDate: string; status: string }[] }
  | { type: 'total'; label: string; amountCents: number; detail?: string }
  | { type: 'action'; id: string; kind: ActionKind; summary: string; payload: Record<string, unknown>; status: 'pending' | 'confirmed' | 'cancelled' | 'failed'; result?: string };

export type ActionKind =
  | 'add_bill'
  | 'record_payment'
  | 'update_bill'
  | 'snooze'
  | 'mute'
  | 'archive'
  | 'create_company'
  | 'create_category'
  | 'set_budget'
  | 'remember';

export interface ToolContext {
  ctx: AppContext;
  req: Request;
  cards: Card[];
}

const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cents = (dollars: unknown): number | null => {
  const n = typeof dollars === 'number' ? dollars : Number(String(dollars ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 && n < 20_000_000 ? Math.round(n * 100) : null;
};

export const FREQUENCIES: Record<string, { unit: 'WEEK' | 'MONTH' | 'YEAR' | 'ONCE'; interval: number; label: string }> = {
  weekly: { unit: 'WEEK', interval: 1, label: 'weekly' },
  biweekly: { unit: 'WEEK', interval: 2, label: 'every 2 weeks' },
  monthly: { unit: 'MONTH', interval: 1, label: 'monthly' },
  bimonthly: { unit: 'MONTH', interval: 2, label: 'every 2 months' },
  quarterly: { unit: 'MONTH', interval: 3, label: 'quarterly' },
  semiannual: { unit: 'MONTH', interval: 6, label: 'every 6 months' },
  yearly: { unit: 'YEAR', interval: 1, label: 'yearly' },
  once: { unit: 'ONCE', interval: 1, label: 'one-time' },
};

/** What the model sees about a bill — never the key, never internal ids beyond `id`. */
function safe(v: BillView) {
  return {
    id: v.id,
    name: v.name,
    company: v.company.name,
    category: v.category.name,
    provider: v.provider,
    amountUSD: usd(v.amountCents),
    remainingUSD: usd(v.remainingCents),
    frequency: v.frequencyLabel,
    nextDueDate: v.nextDueDate,
    daysUntilDue: v.daysUntilDue,
    status: v.paymentStatus,
    autoRenew: v.autoRenew,
    trialEndsOn: v.isTrial ? v.trialEndsOn : null,
  };
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required });
const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra });
const num = (description: string) => ({ type: 'number', description });

const READ_TOOLS: FunctionDeclaration[] = [
  {
    name: 'list_bills',
    description: 'List bills in this workspace, soonest due first. Use for "what is due", "what is overdue", "show everything for <company>", search by name.',
    parametersJsonSchema: obj({
      query: str('Text to search in name, provider, company or category'),
      status: str('Filter by status', { enum: ['OVERDUE', 'DUE_TODAY', 'DUE_SOON', 'UPCOMING', 'PARTIALLY_PAID', 'PAID', 'ARCHIVED'] }),
      company: str('Only this company (name)'),
      category: str('Only this category (name)'),
      dueWithinDays: num('Only bills due within this many days from today (0 = today)'),
      sort: str('Sort order', { enum: ['due_asc', 'amount_desc', 'name_asc', 'recent'] }),
    }),
  },
  {
    name: 'get_overview',
    description: 'Dashboard numbers: overdue, due this week, due this month, paid this month, and what needs attention.',
    parametersJsonSchema: obj({}),
  },
  {
    name: 'get_spending',
    description: 'Paid, outstanding and overdue totals for a month or a year, with breakdowns by category, by company and by month.',
    parametersJsonSchema: obj({ period: str('month or year', { enum: ['month', 'year'] }), year: num('e.g. 2026'), month: num('1-12, for period=month') }, ['period', 'year']),
  },
  {
    name: 'compare_months',
    description: 'Compare what was paid and committed in two months, e.g. this month vs last month.',
    parametersJsonSchema: obj({ monthA: str('YYYY-MM'), monthB: str('YYYY-MM') }, ['monthA', 'monthB']),
  },
  {
    name: 'get_forecast',
    description: 'What will be due over the next 3 or 12 months, by month, category or company. Also answers "which month is the most expensive" and "how much per year on X".',
    parametersJsonSchema: obj({ months: num('3 or 12'), groupBy: str('month, category or company', { enum: ['month', 'category', 'company'] }) }, ['months']),
  },
  {
    name: 'get_insights',
    description: 'Possible duplicate bills, recent price increases, free trials ending soon and upcoming renewals worth planning for.',
    parametersJsonSchema: obj({}),
  },
  { name: 'get_budgets', description: 'Monthly budgets and how much of each is used this month.', parametersJsonSchema: obj({}) },
  { name: 'list_companies_and_categories', description: 'The companies and categories in this workspace.', parametersJsonSchema: obj({}) },
  {
    name: 'search_help',
    description: 'Search DueOra help articles for "how do I…" questions about using the app.',
    parametersJsonSchema: obj({ question: str('The question') }, ['question']),
  },
];

const billRef = str('The bill: its id, or its name (optionally "Company · Name")');
const WRITE_TOOLS: FunctionDeclaration[] = [
  {
    name: 'propose_add_bill',
    description: 'Propose adding a bill. Shows a confirmation card; nothing is saved until the user confirms.',
    parametersJsonSchema: obj(
      {
        name: str('What it is, e.g. "Internet"'),
        amountUSD: num('Amount in US dollars per cycle'),
        frequency: str('How often', { enum: Object.keys(FREQUENCIES) }),
        companyName: str('Which company pays it (omit if the workspace has only one)'),
        categoryName: str('Category name (omit to let DueOra pick)'),
        provider: str('Who is paid'),
        nextDueDate: str('Next due date YYYY-MM-DD (omit for today)'),
        dueDayOfMonth: num('For "due on the 5th": the day of the month'),
        autoRenew: { type: 'boolean' },
        trialEndsOn: str('If it is a free trial, when it ends (YYYY-MM-DD)'),
      },
      ['name', 'amountUSD', 'frequency'],
    ),
  },
  {
    name: 'propose_record_payment',
    description: 'Propose recording a payment for the current cycle of a bill (full by default).',
    parametersJsonSchema: obj(
      {
        bill: billRef,
        amountUSD: num('Amount paid in USD (omit for the full remaining amount)'),
        paidOn: str('YYYY-MM-DD (omit for today)'),
        method: str('Payment method', { enum: ['MOBILE_MONEY', 'BANK_TRANSFER', 'CARD', 'CASH', 'OTHER'] }),
      },
      ['bill'],
    ),
  },
  {
    name: 'propose_update_bill',
    description: 'Propose changing a bill: amount, frequency or reminders.',
    parametersJsonSchema: obj(
      {
        bill: billRef,
        amountUSD: num('New amount in USD'),
        frequency: str('New frequency', { enum: Object.keys(FREQUENCIES) }),
        reminderDaysBefore: { type: 'array', items: { type: 'number' }, description: 'Reminder offsets in days (negative = after the due date)' },
      },
      ['bill'],
    ),
  },
  {
    name: 'propose_snooze',
    description: "Propose snoozing a bill's reminders for the user (1, 3 or 7 days).",
    parametersJsonSchema: obj({ bill: billRef, days: num('1, 3 or 7') }, ['bill', 'days']),
  },
  {
    name: 'propose_mute',
    description: "Propose muting (or unmuting) a bill's reminders for the user.",
    parametersJsonSchema: obj({ bill: billRef, muted: { type: 'boolean' } }, ['bill', 'muted']),
  },
  { name: 'propose_archive', description: 'Propose archiving a bill (stops reminders for everyone, keeps history).', parametersJsonSchema: obj({ bill: billRef }, ['bill']) },
  { name: 'propose_create_company', description: 'Propose creating a company in this workspace.', parametersJsonSchema: obj({ name: str('Company name') }, ['name']) },
  { name: 'propose_create_category', description: 'Propose creating a custom category.', parametersJsonSchema: obj({ name: str('Category name') }, ['name']) },
  {
    name: 'propose_set_budget',
    description: 'Propose a monthly budget for the whole workspace (omit categoryName) or one category.',
    parametersJsonSchema: obj({ categoryName: str('Category, or omit for the whole workspace'), monthlyLimitUSD: num('Monthly limit in USD'), alertAtPercent: num('Alert level, default 80') }, ['monthlyLimitUSD']),
  },
  {
    name: 'propose_remember',
    description: 'Propose remembering a fact about this workspace (e.g. a nickname for a company, or "we always pay by bank transfer").',
    parametersJsonSchema: obj({ fact: str('The fact, as one sentence') }, ['fact']),
  },
];

/** Tools offered to this user: everyone reads; only roles that may change things get write tools (snooze/mute are personal). */
export function toolsFor(role: Parameters<typeof can>[0]): FunctionDeclaration[] {
  const personal = WRITE_TOOLS.filter((t) => t.name === 'propose_snooze' || t.name === 'propose_mute');
  return can(role, 'bills:manage') ? [...READ_TOOLS, ...WRITE_TOOLS] : [...READ_TOOLS, ...personal];
}

export const WRITE_TOOL_NAMES = new Set(WRITE_TOOLS.map((t) => t.name!));

// --- Helpers ----------------------------------------------------------------------------

async function allViews(t: ToolContext, includeArchived = false) {
  const page = await listBills(t.ctx, t.req, {
    sort: 'due_asc',
    page: 1,
    limit: 5000,
    statuses: includeArchived ? ['UPCOMING', 'DUE_SOON', 'DUE_TODAY', 'OVERDUE', 'PARTIALLY_PAID', 'PAID', 'ARCHIVED'] : undefined,
  });
  return page.items;
}

/** Resolve "the hosting" / "Alpha · Hosting" / an id to one bill, or explain why not. */
async function resolveBill(t: ToolContext, ref: unknown): Promise<BillView | string> {
  const q = String(ref ?? '').trim().toLowerCase();
  if (!q) return 'Which bill? Ask the user.';
  const views = await allViews(t, true);
  const byId = views.find((v) => v.id === ref);
  if (byId) return byId;
  const label = (v: BillView) => `${v.company.name} · ${v.name}`.toLowerCase();
  const exact = views.filter((v) => v.name.toLowerCase() === q || label(v) === q);
  const partial = exact.length ? exact : views.filter((v) => label(v).includes(q) || (v.provider ?? '').toLowerCase().includes(q) || q.includes(v.name.toLowerCase()));
  if (partial.length === 1) return partial[0]!;
  if (partial.length === 0) return `No bill matches "${String(ref)}". Ask the user which one they mean (you can call list_bills).`;
  return `Several bills match: ${partial.slice(0, 6).map((v) => `${v.company.name} · ${v.name} (id ${v.id})`).join('; ')}. Ask the user which one.`;
}

function propose(t: ToolContext, kind: ActionKind, summary: string, payload: Record<string, unknown>) {
  const id = randomUUID();
  t.cards.push({ type: 'action', id, kind, summary, payload, status: 'pending' });
  return { proposed: true, actionId: id, summary, note: 'A confirmation card is shown. Nothing changes until the user taps Confirm. Tell them briefly what will happen.' };
}

/** "due on the 5th" → the next date with that day of the month on or after today. */
function nextDayOfMonth(today: string, day: number): string {
  const { y, m } = parseDate(today);
  const dim = (yy: number, mm: number) => (mm === 2 ? (isLeapYear(yy) ? 29 : 28) : [4, 6, 9, 11].includes(mm) ? 30 : 31);
  const pick = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(day, dim(yy, mm))).padStart(2, '0')}`;
  const thisMonth = pick(y, m);
  return thisMonth >= today ? thisMonth : m === 12 ? pick(y + 1, 1) : pick(y, m + 1);
}

// --- Executors ----------------------------------------------------------------------------

type Executor = (t: ToolContext, args: Record<string, unknown>) => Promise<unknown>;

const EXECUTORS: Record<string, Executor> = {
  async list_bills(t, a) {
    const today = workspaceToday(t.ctx, t.req);
    const statuses = typeof a.status === 'string' ? [a.status as never] : undefined;
    const page = await listBills(t.ctx, t.req, {
      q: typeof a.query === 'string' && a.query.trim() ? a.query.trim() : undefined,
      statuses,
      sort: (['due_asc', 'amount_desc', 'name_asc', 'recent'].includes(String(a.sort)) ? a.sort : 'due_asc') as BillSort,
      dueTo: typeof a.dueWithinDays === 'number' ? addDays(today, Math.max(0, Math.round(a.dueWithinDays))) : undefined,
      page: 1,
      limit: 5000,
    });
    let items = page.items;
    const c = typeof a.company === 'string' ? a.company.toLowerCase() : '';
    const k = typeof a.category === 'string' ? a.category.toLowerCase() : '';
    if (c) items = items.filter((v) => v.company.name.toLowerCase().includes(c));
    if (k) items = items.filter((v) => v.category.name.toLowerCase().includes(k));
    if (typeof a.dueWithinDays === 'number') items = items.filter((v) => v.status === 'ACTIVE' && v.paymentStatus !== 'PAID');
    const shown = items.slice(0, 25);
    if (shown.length) {
      t.cards.push({
        type: 'bills',
        title: `${items.length} bill${items.length === 1 ? '' : 's'}`,
        items: shown.slice(0, 8).map((v) => ({ id: v.id, name: v.name, company: v.company.name, amountCents: v.remainingCents || v.amountCents, nextDueDate: v.nextDueDate, status: v.paymentStatus })),
      });
    }
    return { count: items.length, totalRemainingUSD: usd(items.reduce((s, v) => s + v.remainingCents, 0)), bills: shown.map(safe) };
  },

  async get_overview(t) {
    const d = await dashboard(t.ctx, t.req);
    return {
      today: d.today,
      overdue: { amountUSD: usd(d.summary.overdue.amountCents), count: d.summary.overdue.count },
      dueThisWeek: { amountUSD: usd(d.summary.dueThisWeek.amountCents), count: d.summary.dueThisWeek.count },
      dueThisMonth: { amountUSD: usd(d.summary.dueThisMonth.amountCents), count: d.summary.dueThisMonth.count },
      paidThisMonth: { amountUSD: usd(d.summary.paidThisMonth.amountCents), count: d.summary.paidThisMonth.count },
      needsAttention: d.needsAttention.map((s) => ({ id: s.id, name: s.name, company: s.company.name, remainingUSD: usd(s.remainingCents), nextDueDate: s.nextDueDate, status: s.paymentStatus })),
      activeBills: d.counts.active,
    };
  },

  async get_spending(t, a) {
    const year = Number(a.year) || Number(workspaceToday(t.ctx, t.req).slice(0, 4));
    const period = a.period === 'month' ? 'month' : 'year';
    const month = period === 'month' ? Math.min(12, Math.max(1, Number(a.month) || Number(workspaceToday(t.ctx, t.req).slice(5, 7)))) : undefined;
    const r = await report(t.ctx, t.req, period, year, month);
    t.cards.push({ type: 'total', label: `Paid ${period === 'month' ? `${year}-${String(month).padStart(2, '0')}` : year}`, amountCents: r.totals.paid.amountCents, detail: `${usd(r.totals.outstanding.amountCents)} still to pay` });
    return {
      from: r.from,
      to: r.to,
      paidUSD: usd(r.totals.paid.amountCents),
      outstandingUSD: usd(r.totals.outstanding.amountCents),
      overdueUSD: usd(r.totals.overdue.amountCents),
      committedUSD: usd(r.totals.committed.amountCents),
      byCategory: r.byCategory.map((b) => ({ name: b.name, paidUSD: usd(b.amountCents) })),
      byCompany: r.byCompany.map((b) => ({ name: b.name, paidUSD: usd(b.amountCents) })),
      byMonth: r.months.map((m) => ({ month: m.month, paidUSD: usd(m.paidCents), outstandingUSD: usd(m.outstandingCents) })),
    };
  },

  async compare_months(t, a) {
    const out: Record<string, unknown> = {};
    for (const key of [a.monthA, a.monthB]) {
      const [y, m] = String(key).split('-').map(Number);
      if (!y || !m || m < 1 || m > 12) return { error: 'Months must be YYYY-MM' };
      const r = await report(t.ctx, t.req, 'month', y, m);
      out[String(key)] = { paidUSD: usd(r.totals.paid.amountCents), committedUSD: usd(r.totals.committed.amountCents), paidCents: r.totals.paid.amountCents, committedCents: r.totals.committed.amountCents };
    }
    return out;
  },

  async get_forecast(t, a) {
    const months = Number(a.months) === 3 ? 3 : 12;
    const groupBy = a.groupBy === 'category' || a.groupBy === 'company' ? a.groupBy : 'month';
    const today = workspaceToday(t.ctx, t.req);
    const keys = Array.from({ length: months }, (_, i) => addMonthsKey(today.slice(0, 7), i));
    const to = monthRange(`${keys.at(-1)}-01`).to;
    const rows = await t.ctx.db.bill.findMany({ where: { workspaceId: workspaceIdOf(t.req), status: 'ACTIVE' }, include: { company: true, category: true } });
    const totals = new Map<string, number>();
    let total = 0;
    for (const s of rows) {
      for (const occ of occurrencesBetween(s, today, to)) {
        const key = groupBy === 'month' ? occ.date.slice(0, 7) : groupBy === 'category' ? s.category.name : s.company.name;
        totals.set(key, (totals.get(key) ?? 0) + s.amountCents);
        total += s.amountCents;
      }
    }
    const list = [...totals.entries()].map(([name, c]) => ({ name, dueCents: c, dueUSD: usd(c) }));
    list.sort((x, y) => (groupBy === 'month' ? x.name.localeCompare(y.name) : y.dueCents - x.dueCents));
    t.cards.push({ type: 'total', label: `Next ${months} months`, amountCents: total });
    const top = [...list].sort((x, y) => y.dueCents - x.dueCents)[0];
    return { from: today, to, totalUSD: usd(total), groupBy, rows: list, mostExpensive: top ? { name: top.name, dueUSD: top.dueUSD } : null };
  },

  async get_insights(t) {
    const today = workspaceToday(t.ctx, t.req);
    const views = (await allViews(t)).filter((v) => v.status === 'ACTIVE');
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const groups = new Map<string, BillView[]>();
    for (const v of views) {
      const key = `${norm(v.name)}|${norm(v.provider ?? '')}`;
      groups.set(key, [...(groups.get(key) ?? []), v]);
    }
    const duplicates = [...groups.values()].filter((g) => g.length > 1).map((g) => g.map((v) => `${v.company.name} · ${v.name} (${usd(v.amountCents)} ${v.frequencyLabel.toLowerCase()})`));
    const changes = await t.ctx.db.priceChange.findMany({
      where: { workspaceId: workspaceIdOf(t.req), changedAt: { gte: new Date(Date.now() - 90 * 86_400_000) } },
      include: { bill: { select: { name: true, company: { select: { name: true } } } } },
      orderBy: { changedAt: 'desc' },
    });
    const increases = changes
      .filter((c) => c.newAmountCents > c.oldAmountCents)
      .map((c) => ({ bill: `${c.bill.company.name} · ${c.bill.name}`, fromUSD: usd(c.oldAmountCents), toUSD: usd(c.newAmountCents), changedOn: c.changedAt.toISOString().slice(0, 10) }));
    const trials = views
      .filter((v) => v.isTrial && v.trialEndsOn && v.trialEndsOn >= today && v.trialEndsOn <= addDays(today, 14))
      .map((v) => ({ bill: `${v.company.name} · ${v.name}`, endsOn: v.trialEndsOn, thenUSD: usd(v.amountCents) }));
    const yearly = views
      .filter((v) => v.frequencyUnit === 'YEAR' && v.daysUntilDue >= 0 && v.daysUntilDue <= 90)
      .map((v) => ({ bill: `${v.company.name} · ${v.name}`, dueOn: v.nextDueDate, amountUSD: usd(v.amountCents) }));
    return { possibleDuplicates: duplicates, priceIncreases: increases, trialsEndingSoon: trials, bigRenewalsNext90Days: yearly };
  },

  async get_budgets(t) {
    const list = await budgetProgress(t.ctx, workspaceIdOf(t.req), workspaceToday(t.ctx, t.req));
    return list.map((b) => ({ scope: b.category?.name ?? 'Whole workspace', limitUSD: usd(b.monthlyLimitCents), spentUSD: usd(b.spentCents), paidUSD: usd(b.paidCents), stillDueUSD: usd(b.dueCents), percent: b.percent, state: b.state }));
  },

  async list_companies_and_categories(t) {
    const workspaceId = workspaceIdOf(t.req);
    const [companies, categories] = await Promise.all([
      t.ctx.db.company.findMany({ where: { workspaceId, archivedAt: null }, orderBy: { name: 'asc' } }),
      t.ctx.db.category.findMany({ where: { OR: [{ workspaceId }, { workspaceId: null }] }, orderBy: { name: 'asc' } }),
    ]);
    return { companies: companies.map((c) => c.name), categories: categories.map((c) => c.name) };
  },

  async search_help(_t, a) {
    return searchArticles(String(a.question ?? ''), 3).map((x) => ({ question: x.title, answer: x.body }));
  },

  // --- Proposals (no writes) ---

  async propose_add_bill(t, a) {
    const workspaceId = workspaceIdOf(t.req);
    const today = workspaceToday(t.ctx, t.req);
    const name = String(a.name ?? '').trim().slice(0, 120);
    const amount = cents(a.amountUSD);
    const freq = FREQUENCIES[String(a.frequency)];
    if (!name) return { needMoreInfo: 'Ask what the bill is called.' };
    if (!amount) return { needMoreInfo: 'Ask for the amount in US dollars.' };
    if (!freq) return { needMoreInfo: 'Ask how often it renews (weekly, monthly, quarterly, yearly, one-time…).' };
    const companies = await t.ctx.db.company.findMany({ where: { workspaceId, archivedAt: null }, orderBy: { createdAt: 'asc' } });
    const wanted = typeof a.companyName === 'string' ? a.companyName.trim() : '';
    let company = wanted ? companies.find((c) => c.name.toLowerCase() === wanted.toLowerCase()) ?? companies.find((c) => c.name.toLowerCase().includes(wanted.toLowerCase())) : undefined;
    if (!wanted && companies.length === 1) company = companies[0];
    if (!wanted && !company) return { needMoreInfo: `Ask which company it is for: ${companies.map((c) => c.name).join(', ')}.` };
    const categories = await t.ctx.db.category.findMany({ where: { OR: [{ workspaceId }, { workspaceId: null }] } });
    const catName = typeof a.categoryName === 'string' && a.categoryName.trim() ? a.categoryName.trim() : guessCategoryName(`${name} ${String(a.provider ?? '')}`) ?? 'Other';
    const category = categories.find((c) => c.name.toLowerCase() === catName.toLowerCase()) ?? categories.find((c) => c.name === 'Other')!;
    const nextDueDate = typeof a.dueDayOfMonth === 'number' ? nextDayOfMonth(today, Math.min(31, Math.max(1, Math.round(a.dueDayOfMonth)))) : /^\d{4}-\d{2}-\d{2}$/.test(String(a.nextDueDate ?? '')) ? String(a.nextDueDate) : today;
    const trialEndsOn = /^\d{4}-\d{2}-\d{2}$/.test(String(a.trialEndsOn ?? '')) ? String(a.trialEndsOn) : null;
    const companyName = company?.name ?? wanted;
    const summary = `Add ${companyName} · ${name} — ${usd(amount)} ${freq.label}, next due ${nextDueDate} (${category.name})${company ? '' : ` — creates the company "${wanted}"`}${trialEndsOn ? `, free trial until ${trialEndsOn}` : ''}${a.autoRenew ? ', renews automatically' : ''}.`;
    return propose(t, 'add_bill', summary, {
      name,
      amountCents: amount,
      frequencyUnit: freq.unit,
      frequencyInterval: freq.interval,
      companyId: company?.id ?? null,
      newCompanyName: company ? null : wanted.slice(0, 60),
      categoryId: category.id,
      provider: typeof a.provider === 'string' ? a.provider.slice(0, 120) : null,
      nextDueDate,
      startDate: nextDueDate < today ? nextDueDate : today,
      autoRenew: a.autoRenew === true,
      isTrial: !!trialEndsOn,
      trialEndsOn,
    });
  },

  async propose_record_payment(t, a) {
    const s = await resolveBill(t, a.bill);
    if (typeof s === 'string') return { needMoreInfo: s };
    if (s.status !== 'ACTIVE') return { error: `${s.name} is ${s.status.toLowerCase()} — no payment is due.` };
    const amount = a.amountUSD === undefined ? s.remainingCents || s.amountCents : cents(a.amountUSD);
    if (!amount) return { needMoreInfo: 'Ask for the amount paid in US dollars.' };
    const today = workspaceToday(t.ctx, t.req);
    const paidOn = /^\d{4}-\d{2}-\d{2}$/.test(String(a.paidOn ?? '')) && String(a.paidOn) <= today ? String(a.paidOn) : today;
    const method = ['MOBILE_MONEY', 'BANK_TRANSFER', 'CARD', 'CASH', 'OTHER'].includes(String(a.method)) ? String(a.method) : (s.defaultPaymentMethod ?? null);
    const methodText = method ? ` by ${method.toLowerCase().replace(/_/g, ' ')}` : '';
    return propose(t, 'record_payment', `Record ${usd(amount)} paid${methodText} on ${paidOn} for ${s.company.name} · ${s.name} (due ${s.nextDueDate}).`, {
      billId: s.id,
      amountCents: amount,
      paidOn,
      method,
    });
  },

  async propose_update_bill(t, a) {
    const s = await resolveBill(t, a.bill);
    if (typeof s === 'string') return { needMoreInfo: s };
    const changes: Record<string, unknown> = {};
    const parts: string[] = [];
    if (a.amountUSD !== undefined) {
      const c = cents(a.amountUSD);
      if (!c) return { needMoreInfo: 'Ask for the new amount in US dollars.' };
      changes.amountCents = c;
      parts.push(`amount ${usd(s.amountCents)} → ${usd(c)}`);
    }
    if (a.frequency !== undefined) {
      const f = FREQUENCIES[String(a.frequency)];
      if (!f) return { needMoreInfo: 'Ask how often it should renew.' };
      changes.frequencyUnit = f.unit;
      changes.frequencyInterval = f.interval;
      parts.push(`frequency → ${f.label}`);
    }
    if (Array.isArray(a.reminderDaysBefore)) {
      const offsets = [...new Set(a.reminderDaysBefore.map(Number).filter((n) => Number.isInteger(n) && n >= -365 && n <= 365))].sort((x, y) => y - x);
      changes.reminderOffsets = offsets;
      parts.push(`reminders → ${offsets.map((o) => (o === 0 ? 'on the day' : o > 0 ? `${o}d before` : `${-o}d after`)).join(', ') || 'none'}`);
    }
    if (!parts.length) return { needMoreInfo: 'Ask what should change (amount, frequency or reminders).' };
    return propose(t, 'update_bill', `Update ${s.company.name} · ${s.name}: ${parts.join('; ')}.`, { billId: s.id, changes });
  },

  async propose_snooze(t, a) {
    const s = await resolveBill(t, a.bill);
    if (typeof s === 'string') return { needMoreInfo: s };
    const days = [1, 3, 7].includes(Number(a.days)) ? Number(a.days) : 1;
    const until = addDays(workspaceToday(t.ctx, t.req), days);
    return propose(t, 'snooze', `Snooze reminders for ${s.company.name} · ${s.name} until ${until} (just for you).`, { billId: s.id, days });
  },

  async propose_mute(t, a) {
    const s = await resolveBill(t, a.bill);
    if (typeof s === 'string') return { needMoreInfo: s };
    const muted = a.muted !== false;
    return propose(t, 'mute', `${muted ? 'Mute' : 'Unmute'} reminders for ${s.company.name} · ${s.name} (just for you).`, { billId: s.id, muted });
  },

  async propose_archive(t, a) {
    const s = await resolveBill(t, a.bill);
    if (typeof s === 'string') return { needMoreInfo: s };
    return propose(t, 'archive', `Archive ${s.company.name} · ${s.name}: reminders stop for everyone, history is kept.`, { billId: s.id });
  },

  async propose_create_company(t, a) {
    const name = String(a.name ?? '').trim().slice(0, 60);
    if (!name) return { needMoreInfo: 'Ask for the company name.' };
    return propose(t, 'create_company', `Create the company "${name}".`, { name });
  },

  async propose_create_category(t, a) {
    const name = String(a.name ?? '').trim().slice(0, 60);
    if (!name) return { needMoreInfo: 'Ask for the category name.' };
    return propose(t, 'create_category', `Create the category "${name}".`, { name });
  },

  async propose_set_budget(t, a) {
    const limit = cents(a.monthlyLimitUSD);
    if (!limit) return { needMoreInfo: 'Ask for the monthly limit in US dollars.' };
    const workspaceId = workspaceIdOf(t.req);
    let categoryId: string | null = null;
    let label = 'the whole workspace';
    if (typeof a.categoryName === 'string' && a.categoryName.trim()) {
      const c = await t.ctx.db.category.findFirst({ where: { name: { equals: a.categoryName.trim() }, OR: [{ workspaceId }, { workspaceId: null }] } });
      if (!c) return { needMoreInfo: `There is no category called "${a.categoryName}". Ask which category (or call list_companies_and_categories).` };
      categoryId = c.id;
      label = c.name;
    }
    const alertAtPercent = Math.min(100, Math.max(10, Math.round(Number(a.alertAtPercent) || 80)));
    return propose(t, 'set_budget', `Set a monthly budget of ${usd(limit)} for ${label}, alerting at ${alertAtPercent}%.`, { categoryId, monthlyLimitCents: limit, alertAtPercent });
  },

  async propose_remember(t, a) {
    const fact = String(a.fact ?? '').trim().slice(0, 300);
    if (!fact) return { needMoreInfo: 'Ask what to remember.' };
    return propose(t, 'remember', `Remember for this workspace: "${fact}"`, { fact });
  },
};

export async function runTool(t: ToolContext, name: string, args: Record<string, unknown>): Promise<unknown> {
  const exec = EXECUTORS[name];
  if (!exec) return { error: `Unknown tool ${name}` };
  if (WRITE_TOOL_NAMES.has(name)) {
    const personal = name === 'propose_snooze' || name === 'propose_mute';
    if (!personal && !can(actorOf(t.req).role, 'bills:manage')) {
      return { error: 'This user is a Viewer and cannot make changes. Explain kindly that an admin or finance member can.' };
    }
  }
  try {
    return await exec(t, args);
  } catch (err) {
    t.ctx.logger.warn({ err, tool: name }, 'AI tool failed');
    return { error: err instanceof Error ? err.message : 'That did not work' };
  }
}

// Exported for the next-due helper's tests.
export const _internal = { nextDayOfMonth, advance };
