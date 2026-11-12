/**
 * A full year of reminders (2 Nov 2026 → 1 Nov 2027) over a test-only fixture workspace
 * (helpers/fixture.ts, isolated test database), with a fake clock ticking every 15 minutes.
 *
 * Scripted life during the year:
 * - bills get paid on fixed policies (on the due date, the day before, ...) at 15:00 UTC
 * - Finance mutes Cleaning; CDN plan is never paid and is archived on 1 Jun 2027
 * - the worker is down 20–25 Feb 2027 (the API keeps running; payments still happen)
 * - two schedulers run concurrently for the first 30 days
 * - the workspace moves from Africa/Kigali to America/New_York on 1 Jul 2027
 * - four extra bills make digest days happen
 *
 * The expected reminders come from an independent oracle below (plain calendar maths,
 * not the production engine), and must match what was sent exactly.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { workOnce } from '../src/notifications/scheduler.js';

import { client } from './helpers/api.js';
import { createTestContext } from './helpers/context.js';
import { buildFixture, USERS, type Fixture, type BillKey, type UserKey } from './helpers/fixture.js';

// ---------- independent calendar helpers (no production code) ----------
const DAY = 86_400_000;
const toDay = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const fromDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const plusDays = (iso: string, n: number) => fromDay(toDay(iso) + n * DAY);
const lastDayOfMonth = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
function monthly(first: string, anchor: number, months: number, until: string): string[] {
  const out: string[] = [];
  let y = +first.slice(0, 4);
  let m0 = +first.slice(5, 7) - 1;
  for (;;) {
    const d = `${y}-${String(m0 + 1).padStart(2, '0')}-${String(Math.min(anchor, lastDayOfMonth(y, m0))).padStart(2, '0')}`;
    if (d > until) return out;
    out.push(d);
    m0 += months;
    y += Math.floor(m0 / 12);
    m0 %= 12;
  }
}
function weekly(first: string, until: string): string[] {
  const out: string[] = [];
  for (let d = first; d <= until; d = plusDays(d, 7)) out.push(d);
  return out;
}

const OFFSETS = [30, 14, 7, 3, 1, 0, -1, -3, -7];
const START = '2026-11-02';
const END = '2027-11-01';
const DOWN_FROM = '2027-02-20';
const DOWN_TO = '2027-02-25';
const TZ_SWITCH = '2027-07-01';
const ARCHIVE_CLOUDFLARE = '2027-06-01';

/** Days on which the scheduler ran (every day except the outage). */
const RUN_DAYS: string[] = [];
for (let d = START; d <= END; d = plusDays(d, 1)) if (d < DOWN_FROM || d > DOWN_TO) RUN_DAYS.push(d);

/** Reminder dates for one cycle: configured offsets, then weekly after -7. */
function cycleReminders(due: string, until: string): { offset: number; date: string }[] {
  const list = OFFSETS.map((offset) => ({ offset, date: plusDays(due, -offset) }));
  for (let offset = -14; plusDays(due, -offset) <= until; offset -= 7) list.push({ offset, date: plusDays(due, -offset) });
  return list.filter((r) => r.date <= until);
}

interface Cycle {
  due: string;
  /** Local date it gets paid (after that day's run), or null if never. */
  paidOn: string | null;
}

/**
 * The oracle: on each run day, for the cycle that is open that day, send the latest
 * reminder that fell after the previous run day and on/before today.
 */
function expectedReminders(cycles: Cycle[], stopAfter = END): { cycle: string; offset: number; day: string }[] {
  const out: { cycle: string; offset: number; day: string }[] = [];
  let previousRun = plusDays(START, -1);
  for (const day of RUN_DAYS) {
    if (day > stopAfter) break;
    const open = cycles.find((c) => c.paidOn === null || c.paidOn >= day);
    if (open && open.due <= plusDays(day, 30)) {
      const due = cycleReminders(open.due, day).filter((r) => r.date > previousRun && r.date <= day);
      const latest = due.at(-1);
      if (latest) out.push({ cycle: open.due, offset: latest.offset, day });
    }
    previousRun = day;
  }
  return out;
}

// ---------- the payment script ----------
type Policy = { kind: 'onDue' } | { kind: 'before'; days: number } | { kind: 'never' };

const ctx = createTestContext({}, { ACCESS_TOKEN_TTL_MINUTES: '10000000', REFRESH_TOKEN_TTL_DAYS: '3650' });
const app = createApp(ctx);
let fx: Fixture;
const extraIds: string[] = [];
const TOKENS = { admin: 'ExponentPushToken[sim-admin]', finance: 'ExponentPushToken[sim-finance]' };
const as = (who: UserKey) => fx.as(who);

beforeAll(async () => {
  ctx.clock.set(`${START}T00:00:00Z`);
  fx = await buildFixture(app, ctx);
  for (const who of ['admin', 'finance'] as const) {
    await client(app, fx.sessions[who]).post('/api/v1/devices').send({ expoPushToken: TOKENS[who], platform: 'android' });
  }
  await as('finance').post(`/api/v1/bills/${fx.billIds.cleaning}/mute`);
  for (const name of ['Figma', 'Notion', 'Slack', 'Zoom']) {
    const res = await as('admin').post('/api/v1/bills').send({
      name,
      companyId: fx.companies.beta,
      categoryId: fx.categoriesOf.beta['Technology & software'],
      amountCents: 1500,
      frequencyUnit: 'MONTH',
      startDate: '2026-12-15',
    });
    extraIds.push(res.body.id);
  }
  // Only reminders are under test: drop fixture side effects (invite emails, the partial-payment notice).
  await ctx.db.notification.deleteMany({});
  ctx.mailer.sent.length = 0;

  const policies = new Map<string, Policy>([
    [fx.billIds.internet, { kind: 'onDue' }],
    [fx.billIds.cleaning, { kind: 'onDue' }],
    [fx.billIds.workspace, { kind: 'onDue' }],
    [fx.billIds.redesign, { kind: 'onDue' }],
    [fx.billIds['alpha-domain'], { kind: 'onDue' }],
    [fx.billIds['beta-x'], { kind: 'onDue' }],
    [fx.billIds['beta-hosting'], { kind: 'onDue' }],
    [fx.billIds.rent, { kind: 'before', days: 1 }],
    [fx.billIds.insurance, { kind: 'before', days: 5 }],
    [fx.billIds['alpha-cdn'], { kind: 'never' }],
    ...extraIds.map((id) => [id, { kind: 'onDue' }] as [string, Policy]),
  ]);

  const t0 = Date.now();
  for (let t = Date.parse(`${START}T00:00:00Z`); t < Date.parse(`${plusDays(END, 1)}T00:00:00Z`); t += 15 * 60_000) {
    const now = new Date(t);
    ctx.clock.set(now);
    const iso = now.toISOString();
    const day = iso.slice(0, 10);

    if (iso.endsWith('T00:00:00.000Z') && day === TZ_SWITCH) {
      await as('admin').patch('/api/v1/workspaces/current').send({ timezone: 'America/New_York' });
    }
    if (iso.endsWith('T15:00:00.000Z')) {
      // 15:00 UTC: after both the Kigali (07:00Z) and New York (13:00Z) runs, same local date.
      if (day === '2026-11-10') await pay('alpha-hosting');
      if (day === '2027-02-27') await pay('beta-domain');
      if (day === ARCHIVE_CLOUDFLARE) await as('admin').post(`/api/v1/bills/${fx.billIds['alpha-cdn']}/archive`);
      const open = await ctx.db.bill.findMany({ where: { workspaceId: fx.workspaceId, status: 'ACTIVE' } });
      for (const o of open) {
        const p = policies.get(o.id);
        if (!p || p.kind === 'never') continue;
        const payDay = p.kind === 'onDue' ? o.nextDueDate : plusDays(o.nextDueDate, -p.days);
        if (payDay === day) await payId(o.id);
      }
    }

    const workerDown = day >= DOWN_FROM && day <= DOWN_TO;
    if (workerDown) continue;
    if (day < plusDays(START, 30)) await Promise.all([workOnce(ctx, 'w1'), workOnce(ctx, 'w2')]);
    else await workOnce(ctx);
  }
  // eslint-disable-next-line no-console
  console.log(`simulated a year in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}, 20 * 60_000);

async function pay(key: BillKey) {
  await payId(fx.billIds[key]);
}
async function payId(id: string) {
  const res = await as('finance').post(`/api/v1/bills/${id}/payments`).send({ method: 'BANK_TRANSFER' });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
}

afterAll(async () => {
  await ctx.db.$disconnect();
});

// ---------- helpers to read what happened ----------
async function inApp(accountReference: BillKey, userKey: UserKey) {
  const rows = await ctx.db.notification.findMany({
    where: {
      billId: fx.billIds[accountReference],
      userId: fx.userIds[userKey],
      channel: 'IN_APP',
      type: { in: ['REMINDER', 'DUE_TODAY', 'OVERDUE'] },
    },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => ({ cycle: r.cycleDueDate!, offset: r.offsetDays!, day: localDay(r.createdAt) }));
}

function localDay(d: Date): string {
  // Runs happen at 07:00Z (Kigali) or 13:00Z (New York): the UTC date is the local date.
  return d.toISOString().slice(0, 10);
}

/** Every member gets every reminder, minus mutes. */
const ALL_USERS: UserKey[] = ['admin', 'finance', 'viewer'];
const RECIPIENTS: Partial<Record<BillKey, UserKey[]>> = {
  internet: ALL_USERS,
  cleaning: ['admin', 'viewer'], // Finance muted it
  rent: ALL_USERS,
  'beta-domain': ALL_USERS,
  'alpha-hosting': ALL_USERS,
  'alpha-cdn': ALL_USERS,
};

const CYCLES: Partial<Record<BillKey, Cycle[]>> = {
  internet: monthly('2026-11-05', 5, 1, plusDays(END, 31)).map((due) => ({ due, paidOn: due })),
  cleaning: weekly('2026-11-06', plusDays(END, 7)).map((due) => ({ due, paidOn: due })),
  rent: monthly('2026-11-30', 31, 1, plusDays(END, 31)).map((due) => ({ due, paidOn: plusDays(due, -1) })),
  'beta-domain': [
    { due: '2027-02-26', paidOn: '2027-02-27' },
    { due: '2028-02-26', paidOn: null },
  ],
  'alpha-hosting': [
    { due: '2026-10-20', paidOn: '2026-11-10' },
    { due: '2027-10-20', paidOn: null },
  ],
  'alpha-cdn': [{ due: '2026-01-30', paidOn: null }],
};

describe('a year of reminders', () => {
  for (const key of Object.keys(CYCLES) as BillKey[]) {
    it(`sends exactly the expected reminders for ${key} to exactly the right people`, async () => {
      const stop = key === 'alpha-cdn' ? ARCHIVE_CLOUDFLARE : END;
      const expected = expectedReminders(CYCLES[key]!, stop);
      expect(expected.length).toBeGreaterThan(0);
      for (const user of ALL_USERS) {
        const got = await inApp(key, user);
        expect(got, `${key} → ${user}`).toEqual(RECIPIENTS[key]!.includes(user) ? expected : []);
      }
    });
  }

  it('matches hand-checked dates for the Beta Radio domain (incl. the outage)', async () => {
    expect(await inApp('beta-domain', 'viewer')).toEqual([
      { cycle: '2027-02-26', offset: 30, day: '2027-01-27' },
      { cycle: '2027-02-26', offset: 14, day: '2027-02-12' },
      { cycle: '2027-02-26', offset: 7, day: '2027-02-19' },
      // 3-day (23rd) and 1-day (25th) fell in the outage; on restart only the due-day one goes.
      { cycle: '2027-02-26', offset: 0, day: '2027-02-26' },
      { cycle: '2027-02-26', offset: -1, day: '2027-02-27' },
    ]);
  });

  it('stops reminding the moment a cycle is paid, and resumes for the next cycle', async () => {
    const hosting = await inApp('alpha-hosting', 'admin');
    expect(hosting.filter((r) => r.cycle === '2026-10-20')).toEqual([
      { cycle: '2026-10-20', offset: -14, day: '2026-11-03' },
      { cycle: '2026-10-20', offset: -21, day: '2026-11-10' },
    ]);
    expect(hosting.filter((r) => r.cycle === '2027-10-20').map((r) => r.offset)).toEqual(OFFSETS);
  });

  it('stops for muted people and archived bills', async () => {
    expect(await inApp('cleaning', 'finance')).toEqual([]);
    const cloudflare = await inApp('alpha-cdn', 'admin');
    expect(cloudflare.at(-1)!.day <= ARCHIVE_CLOUDFLARE).toBe(true);
    const after = await ctx.db.notification.count({
      where: { billId: fx.billIds['alpha-cdn'], createdAt: { gt: new Date(`${ARCHIVE_CLOUDFLARE}T15:00:00Z`) } },
    });
    expect(after).toBe(0);
  });

  it('sends nothing during the outage and catches up with one message per bill', async () => {
    const during = await ctx.db.notification.count({
      where: {
        createdAt: { gte: new Date(`${DOWN_FROM}T00:00:00Z`), lt: new Date(`${plusDays(DOWN_TO, 1)}T00:00:00Z`) },
        type: { not: 'PAYMENT_RECORDED' },
      },
    });
    expect(during).toBe(0);
    const restart = await ctx.db.notification.findMany({
      where: {
        userId: fx.userIds.admin,
        channel: 'IN_APP',
        createdAt: new Date('2027-02-26T07:00:00Z'),
        type: { in: ['REMINDER', 'DUE_TODAY', 'OVERDUE'] },
      },
    });
    const perBill = new Map<string, number>();
    for (const r of restart) perBill.set(r.billId!, (perBill.get(r.billId!) ?? 0) + 1);
    expect([...perBill.values()].every((n) => n === 1)).toBe(true);
  });

  it('sends at 09:00 local time — Kigali, then New York after the move', async () => {
    const rows = await ctx.db.notification.findMany({
      where: { workspaceId: fx.workspaceId, type: { in: ['REMINDER', 'DUE_TODAY', 'OVERDUE', 'DIGEST'] }, channel: 'IN_APP' },
      select: { createdAt: true },
    });
    expect(rows.length).toBeGreaterThan(100);
    for (const { createdAt } of rows) {
      const hhmm = createdAt.toISOString().slice(11, 16);
      expect(hhmm, createdAt.toISOString()).toBe(createdAt.toISOString().slice(0, 10) < TZ_SWITCH ? '07:00' : '13:00');
    }
  });

  it('never sends a duplicate, even with two schedulers racing', async () => {
    const rows = await ctx.db.notification.findMany({
      where: { workspaceId: fx.workspaceId },
      select: { dedupeKey: true, userId: true, billId: true, cycleDueDate: true, offsetDays: true, channel: true, type: true },
    });
    expect(new Set(rows.map((r) => r.dedupeKey)).size).toBe(rows.length);
    const reminders = rows.filter((r) => ['REMINDER', 'DUE_TODAY', 'OVERDUE'].includes(r.type));
    const logical = reminders.map((r) => [r.userId, r.billId, r.cycleDueDate, r.offsetDays, r.channel].join('|'));
    expect(new Set(logical).size).toBe(logical.length);
    // Each push reached the phone exactly once.
    const tickets = ctx.push.sent.map((m) => `${m.to}|${(m.data as { notificationId: string }).notificationId}`);
    expect(new Set(tickets).size).toBe(tickets.length);
  });

  it('switches to a digest when someone has more than 3 reminders in a run', async () => {
    const digests = await ctx.db.notification.findMany({ where: { userId: fx.userIds.admin, type: 'DIGEST', channel: 'PUSH' } });
    expect(digests.length).toBeGreaterThan(0);
    for (const d of digests) {
      const sameRun = await ctx.db.notification.findMany({
        where: { userId: fx.userIds.admin, createdAt: d.createdAt, type: { in: ['REMINDER', 'DUE_TODAY', 'OVERDUE'] } },
      });
      const label = d.createdAt.toISOString().slice(0, 13);
      expect(sameRun.filter((n) => n.channel === 'IN_APP').length, label).toBeGreaterThan(3);
      expect(sameRun.filter((n) => n.channel === 'PUSH'), label).toHaveLength(0);
    }
    // The admin's first digest: 15 Nov 2026 — the four new bills and Google Workspace
    // (all due 15 Dec) hit their 30-day reminder together.
    expect(digests[0]!.createdAt.toISOString()).toBe('2026-11-15T07:00:00.000Z');
  });

  it('emails the viewer (no phone) every reminder — or one digest on busy days — and leaves nothing undelivered', async () => {
    const rows = await ctx.db.notification.findMany({
      where: { userId: fx.userIds.viewer, channel: 'IN_APP', type: { in: ['REMINDER', 'DUE_TODAY', 'OVERDUE'] } },
      select: { createdAt: true },
    });
    const perRun = new Map<number, number>();
    for (const r of rows) perRun.set(r.createdAt.getTime(), (perRun.get(r.createdAt.getTime()) ?? 0) + 1);
    const quietRuns = [...perRun.values()].filter((n) => n <= 3);
    const busyRuns = [...perRun.values()].filter((n) => n > 3);
    const mails = ctx.mailer.sent.filter((m) => m.to === USERS.viewer.email);
    expect(mails.filter((m) => m.tag === 'reminder')).toHaveLength(quietRuns.reduce((a, b) => a + b, 0));
    expect(mails.filter((m) => m.tag === 'digest')).toHaveLength(busyRuns.length);
    expect(busyRuns.length).toBeGreaterThan(0);
    const stuck = await ctx.db.notification.count({ where: { status: 'PENDING', createdAt: { lt: new Date(`${END}T00:00:00Z`) } } });
    expect(stuck).toBe(0);
  });
});
