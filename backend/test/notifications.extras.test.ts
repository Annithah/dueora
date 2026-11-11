import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { localTimeIn } from '../src/domain/schedule.js';
import { zonedInstant } from '../src/notifications/backup.js';
import { workOnce } from '../src/notifications/scheduler.js';

import { addMember, client, register, type Session } from './helpers/api.js';
import { createTestContext } from './helpers/context.js';

/**
 * Five weeks in a fictional church office in São Paulo (UTC−3, reminders at 09:00 local):
 * free-trial endings, auto-renew notices, snoozes, a budget alert, weekly digests on
 * Mondays, the monthly summary on the 1st, team notices and local backup reminders.
 */
const ctx = createTestContext({}, { ACCESS_TOKEN_TTL_MINUTES: '10000000', REFRESH_TOKEN_TTL_DAYS: '3650' });
const app = createApp(ctx);
const TZ = 'America/Sao_Paulo';

let workspaceId = '';
const users = {} as Record<'admin' | 'finance' | 'viewer', Session>;
const subs = {} as Record<'trial' | 'backup' | 'music', string>;
const as = (who: keyof typeof users) => client(app, users[who], workspaceId);
const idOf = (who: keyof typeof users) => users[who].userId;
const at = async (iso: string) => {
  ctx.clock.set(iso);
  await workOnce(ctx);
};
/** 12:30 UTC = 09:30 in São Paulo. */
const day = (date: string) => at(`${date}T12:30:00Z`);
const inApp = (where: Record<string, unknown>) =>
  ctx.db.notification.findMany({ where: { workspaceId, channel: 'IN_APP', ...where }, orderBy: { createdAt: 'asc' } });
const localDay = (d: Date) => localTimeIn(d, TZ).date;
let teamBeforeReset: { userId: string; body: string }[] = [];

beforeAll(async () => {
  ctx.clock.set('2026-11-01T20:00:00Z'); // Sunday evening locally
  users.admin = await register(app, 'Lucia Ferreira', 'lucia@lakeview-church.test');
  workspaceId = (await client(app, users.admin).post('/api/v1/workspaces').send({ name: 'Lakeview Church', timezone: TZ, firstCompanyName: 'Lakeview Church' })).body.id;
  users.finance = await addMember(app, ctx, users.admin, workspaceId, 'Tomé Alves', 'tome@lakeview-church.test', 'FINANCE');
  users.viewer = await addMember(app, ctx, users.admin, workspaceId, 'Bia Costa', 'bia@lakeview-church.test', 'VIEWER');
  teamBeforeReset = (await inApp({ type: 'TEAM' })).map((n) => ({ userId: n.userId, body: n.body }));

  const company = (await as('admin').get('/api/v1/companies')).body[0].id;
  const cats = (await as('admin').get('/api/v1/categories')).body as { id: string; name: string }[];
  const cat = (name: string) => cats.find((c) => c.name === name)!.id;
  const create = async (body: Record<string, unknown>) => {
    const r = await as('admin').post('/api/v1/bills').send({ companyId: company, ...body });
    expect(r.status).toBe(201);
    return r.body.id as string;
  };
  subs.trial = await create({ name: 'Streaming plan', categoryId: cat('Technology & software'), amountCents: 999, frequencyUnit: 'MONTH', startDate: '2026-11-12', isTrial: true, trialEndsOn: '2026-11-12', reminderOffsets: [] });
  subs.backup = await create({ name: 'Cloud backup', categoryId: cat('Technology & software'), amountCents: 10_000, frequencyUnit: 'YEAR', startDate: '2026-11-20', autoRenew: true, reminderOffsets: [] });
  subs.music = await create({ name: 'Choir sheet music', categoryId: cat('Education & training'), amountCents: 3_000, frequencyUnit: 'MONTH', startDate: '2026-11-10', reminderOffsets: [3, 1, 0] });
  // A whole-workspace budget well below this month's total.
  expect((await as('admin').put('/api/v1/budgets').send({ monthlyLimitCents: 5_000, alertAtPercent: 80 })).status).toBe(200);
  // The viewer doesn't want weekly digests.
  await as('viewer').patch('/api/v1/notifications/preferences').send({ weeklySummary: false });

  await ctx.db.notification.deleteMany({});
  await ctx.db.job.deleteMany({});
  ctx.mailer.sent.length = 0;

  for (let d = new Date('2026-11-02T00:00:00Z'); d <= new Date('2026-12-08T00:00:00Z'); d = new Date(d.getTime() + 86_400_000)) {
    const date = d.toISOString().slice(0, 10);
    await day(date);
    if (date === '2026-11-07') {
      expect((await as('finance').post(`/api/v1/bills/${subs.music}/snooze`).send({ days: 1 })).body.snoozedUntil).toBe('2026-11-08');
      expect((await as('viewer').post(`/api/v1/bills/${subs.music}/snooze`).send({ days: 3 })).body.snoozedUntil).toBe('2026-11-10');
    }
    if (date === '2026-11-10') await as('finance').post(`/api/v1/bills/${subs.music}/payments`).send({ method: 'CASH', paidOn: date });
  }
}, 600_000);

afterAll(async () => {
  await ctx.db.$disconnect();
});

describe('team notices', () => {
  it('admins hear when an invite is accepted', () => {
    expect(teamBeforeReset.map((t) => t.body)).toEqual(['🎉 Tomé Alves accepted your invite as Finance.', '🎉 Bia Costa accepted your invite as Viewer.']);
    expect(new Set(teamBeforeReset.map((t) => t.userId))).toEqual(new Set([idOf('admin')]));
  });
});

describe('free trial ending', () => {
  it('reminds everyone 3 days and 1 day before the trial ends', async () => {
    const rows = await inApp({ type: 'TRIAL_ENDING' });
    expect(rows.map((n) => `${localDay(n.createdAt)}:${n.offsetDays}`)).toEqual(
      expect.arrayContaining(['2026-11-09:3', '2026-11-11:1']),
    );
    expect(rows).toHaveLength(6); // 2 days × 3 members
    expect(rows.find((n) => n.offsetDays === 3)!.body).toBe('🎁 Your free trial of Streaming plan ends in 3 days — cancel or keep it?');
    expect(rows.find((n) => n.offsetDays === 1)!.body).toBe('🎁 Your free trial of Streaming plan ends tomorrow — cancel or keep it?');
  });
});

describe('auto-renew notice', () => {
  it('goes to admin and finance 7 days before the renewal, not to viewers', async () => {
    const rows = await inApp({ type: 'AUTO_RENEW_NOTICE' });
    expect(rows.map((n) => localDay(n.createdAt))).toEqual(['2026-11-13', '2026-11-13']);
    expect(new Set(rows.map((n) => n.userId))).toEqual(new Set([idOf('admin'), idOf('finance')]));
    expect(rows[0]!.body).toBe('🔁 Lakeview Church · Cloud backup will renew automatically on Fri, 20 Nov for $100.00.');
  });
});

describe('snooze', () => {
  it('pauses one person’s reminders and brings one back when the snooze ends', async () => {
    const days = async (who: keyof typeof users) =>
      (await inApp({ billId: subs.music, cycleDueDate: '2026-11-10', userId: idOf(who), type: { in: ['REMINDER', 'DUE_TODAY', 'OVERDUE'] } })).map((n) => localDay(n.createdAt));
    expect(await days('admin')).toEqual(['2026-11-07', '2026-11-09', '2026-11-10']);
    // Snoozed until the 8th: an extra reminder on the 8th, then the normal ones.
    expect(await days('finance')).toEqual(['2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10']);
    // Snoozed until the 10th: the 9th is skipped; the due-day reminder comes as usual.
    expect(await days('viewer')).toEqual(['2026-11-07', '2026-11-10']);
  });

  it('paying stops everything for that cycle', async () => {
    const overdue = await inApp({ billId: subs.music, type: 'OVERDUE' });
    expect(overdue).toHaveLength(0);
  });
});

describe('budget alert', () => {
  it('fires once per manager when the month passes the limit, and not for viewers', async () => {
    // November is far over; December is 79.98% (music $30 + streaming $9.99 of $50) — just under 80%.
    const rows = await inApp({ type: 'BUDGET_ALERT' });
    expect(new Set(rows.map((n) => n.userId))).toEqual(new Set([idOf('admin'), idOf('finance')]));
    expect(rows).toHaveLength(2);
    expect(rows[0]!.body).toMatch(/^📊 You've used \d+% of your monthly budget this month\.$/);
  });
});

describe('weekly digest', () => {
  it('arrives every Monday for people who opted in', async () => {
    const rows = await inApp({ type: 'WEEKLY_DIGEST' });
    const mondays = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07'];
    for (const who of ['admin', 'finance'] as const) {
      expect(rows.filter((n) => n.userId === idOf(who)).map((n) => localDay(n.createdAt))).toEqual(mondays);
    }
    expect(rows.filter((n) => n.userId === idOf('viewer'))).toHaveLength(0);
    const first = rows[0]!;
    // Week of 2 Nov: Choir (10 Nov) is outside 2–8 Nov; nothing else falls in it.
    expect(first.body).toBe('Nothing due this week — enjoy the calm. 🌿');
    const second = rows.find((n) => localDay(n.createdAt) === '2026-11-09')!;
    expect(second.body).toBe('2 bills due this week — $39.99 in total.');
    // Also by email.
    expect(ctx.mailer.sent.filter((m) => m.tag === 'weekly-digest' && m.to === 'tome@lakeview-church.test')).toHaveLength(6);
  });
});

describe('monthly summary', () => {
  it('arrives on the 1st with last month’s spending and what’s coming', async () => {
    const rows = await inApp({ type: 'MONTHLY_SUMMARY' });
    expect(rows).toHaveLength(3);
    expect(rows.every((n) => localDay(n.createdAt) === '2026-12-01')).toBe(true);
    expect(rows[0]!.title).toBe('📈 November in review');
    expect(rows[0]!.body).toBe('You paid $30.00 in November. This month: 2 bills, $39.99.');
  });
});

describe('local backup reminders', () => {
  it('lists the due-day and overdue events of the next 14 days with server keys', async () => {
    ctx.clock.set('2026-12-08T13:00:00Z');
    const res = await as('viewer').get('/api/v1/notifications/backup');
    expect(res.status).toBe(200);
    const music = res.body.filter((e: { billId: string }) => e.billId === subs.music);
    // Choir is due 10 Dec with offsets [3, 1, 0]: only the due day is critical.
    expect(music).toEqual([
      expect.objectContaining({
        type: 'DUE_TODAY',
        cycleDueDate: '2026-12-10',
        fireAt: '2026-12-10T12:00:00.000Z', // 09:00 in São Paulo
        key: `${workspaceId}:${subs.music}:DUE_TODAY:2026-12-10:0:${idOf('viewer')}`,
        body: '📅 Today: Lakeview Church · Choir sheet music — $30.00.',
      }),
    ]);
    // Muting removes it.
    await as('viewer').post(`/api/v1/bills/${subs.music}/mute`);
    const after = await as('viewer').get('/api/v1/notifications/backup');
    expect(after.body.some((e: { billId: string }) => e.billId === subs.music)).toBe(false);
  });

  it('converts local wall time to UTC across DST', () => {
    expect(zonedInstant('2026-07-01', 9 * 60, 'Europe/London').toISOString()).toBe('2026-07-01T08:00:00.000Z');
    expect(zonedInstant('2026-12-01', 9 * 60, 'Europe/London').toISOString()).toBe('2026-12-01T09:00:00.000Z');
    expect(zonedInstant('2026-12-01', 9 * 60, 'Pacific/Auckland').toISOString()).toBe('2026-11-30T20:00:00.000Z');
  });
});

describe('test notification', () => {
  it('sends push, email and in-app at once', async () => {
    ctx.mailer.sent.length = 0;
    const res = await as('admin').post('/api/v1/notifications/test');
    expect(res.status).toBe(202);
    expect(res.body.channels).toEqual(['EMAIL', 'IN_APP']); // no phone registered in this suite
    await at('2026-12-08T13:01:00Z');
    expect(ctx.mailer.sent.some((m) => m.to === 'lucia@lakeview-church.test' && m.subject === '🔔 Test from DueOra')).toBe(true);
    expect((await inApp({ type: 'SYSTEM', userId: idOf('admin') })).length).toBe(1);
  });
});
