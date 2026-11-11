import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { workOnce } from '../src/notifications/scheduler.js';

import { client } from './helpers/api.js';
import { createTestContext, type TestContext } from './helpers/context.js';
import { buildFixture, USERS } from './helpers/fixture.js';

const TOKENS = { admin: 'ExponentPushToken[admin]', finance: 'ExponentPushToken[finance]' };
const contexts: TestContext[] = [];

/**
 * Fresh fixture workspace at 2 Nov 2026 06:00 UTC (08:00 Kigali). Admin and Finance have
 * phones; the Viewer has none (so they get email instead of push).
 */
async function setup() {
  // These tests move the clock by days; long-lived tokens keep the sessions valid.
  const ctx = createTestContext({}, { ACCESS_TOKEN_TTL_MINUTES: '1000000', REFRESH_TOKEN_TTL_DAYS: '3650' });
  contexts.push(ctx);
  ctx.clock.set('2026-11-02T06:00:00Z');
  const app = createApp(ctx);
  const fx = await buildFixture(app, ctx);
  for (const who of ['admin', 'finance'] as const) {
    const res = await client(app, fx.sessions[who]).post('/api/v1/devices').send({ expoPushToken: TOKENS[who], platform: 'android' });
    expect(res.status).toBe(204);
  }
  // Start every test from a quiet inbox: drop what fixture setup produced (invite emails,
  // the "payment recorded" notice for the fixture's partial payment).
  await ctx.db.notification.deleteMany({});
  await ctx.db.job.deleteMany({});
  // These tests are about reminders; the opt-in weekly/monthly summaries have their own suite
  // (the fixture starts on a Monday, which would otherwise add a weekly digest).
  await ctx.db.notificationPreference.updateMany({ where: { workspaceId: fx.workspaceId }, data: { weeklySummary: false, monthlySummary: false } });
  ctx.mailer.sent.length = 0;
  ctx.push.sent.length = 0;
  /** Move the clock and let the worker do everything that's due. */
  const at = async (iso: string) => {
    ctx.clock.set(iso);
    await workOnce(ctx);
  };
  const notes = (where: Record<string, unknown> = {}) =>
    ctx.db.notification.findMany({ where: { workspaceId: fx.workspaceId, ...where }, orderBy: { createdAt: 'asc' } });
  const who = (userId: string) => (Object.entries(fx.userIds).find(([, id]) => id === userId)?.[0] ?? '?') as string;
  const addMonthly = async (names: string[], startDate: string) => {
    for (const name of names) {
      const res = await fx.as('admin').post('/api/v1/bills').send({
        name,
        companyId: fx.companies.alpha,
        categoryId: fx.categories['Technology & software'],
        amountCents: 1_500,
        frequencyUnit: 'MONTH',
        startDate,
      });
      expect(res.status).toBe(201);
    }
  };
  return { ctx, app, fx, at, notes, who, addMonthly };
}

afterEach(async () => {
  while (contexts.length) await contexts.pop()!.db.$disconnect();
});

describe('daily reminder run', () => {
  it('waits for 09:00 in Kigali, then sends exactly the reminders due today to every member', async () => {
    const { ctx, fx, at, notes, who } = await setup();
    await at('2026-11-02T06:45:00Z'); // 08:45 local
    expect(await notes()).toHaveLength(0);

    await at('2026-11-02T07:00:00Z'); // 09:00 local
    const all = await notes();
    // Only Internet (due 5 Nov, 3-day reminder) is due today. Every member (ADMIN, FINANCE,
    // VIEWER) receives it; the viewer has no phone, so they get email instead of push.
    expect(new Set(all.map((n) => n.billId))).toEqual(new Set([fx.billIds.internet]));
    expect(all.map((n) => `${who(n.userId)}:${n.channel}`).sort()).toEqual([
      'admin:IN_APP',
      'admin:PUSH',
      'finance:IN_APP',
      'finance:PUSH',
      'viewer:EMAIL',
      'viewer:IN_APP',
    ]);
    expect(all[0]).toMatchObject({ type: 'REMINDER', offsetDays: 3, cycleDueDate: '2026-11-05' });

    expect(ctx.push.sent.map((m) => m.to).sort()).toEqual([TOKENS.admin, TOKENS.finance]);
    expect(ctx.push.sent[0]).toMatchObject({
      title: 'Due in 3 days',
      body: '⏰ Alpha News · Internet is due in 3 days — $120.00 on Thu, 5 Nov.',
      channelId: 'reminders',
      data: { url: `dueora://bills/${fx.billIds.internet}` },
    });
    expect((await notes({ channel: 'PUSH' })).every((n) => n.status === 'SENT' && n.pushTicketId)).toBe(true);
    expect(ctx.mailer.sent.map((m) => `${m.to}:${m.subject}`)).toEqual([
      `${USERS.viewer.email}:⏰ Alpha News · Internet is due in 3 days — $120.00 on Thu, 5 Nov.`,
    ]);
  });

  it('runs once per day no matter how often the worker ticks', async () => {
    const { at, notes } = await setup();
    await at('2026-11-02T07:00:00Z');
    const count = (await notes()).length;
    for (const t of ['07:15', '07:30', '12:00', '21:45']) await at(`2026-11-02T${t}:00Z`);
    expect(await notes()).toHaveLength(count);
  });

  it('emails people without a phone for every reminder, and everyone on key moments', async () => {
    const { ctx, at, addMonthly } = await setup();
    await addMonthly(['Accounting'], '2026-11-09'); // 7 days away → key moment today
    await at('2026-11-02T07:00:00Z');
    expect(ctx.mailer.sent.filter((m) => m.to === USERS.admin.email).map((m) => m.subject)).toEqual([
      '⏰ Alpha News · Accounting is due in 7 days — $15.00 on Mon, 9 Nov.',
    ]);
    ctx.mailer.sent.length = 0;

    // 3 Nov: Hosting (due 20 Oct) hits its weekly follow-up (-14), Cleaning its 3-day reminder.
    await at('2026-11-03T07:00:00Z');
    const viewer = ctx.mailer.sent.filter((m) => m.to === USERS.viewer.email);
    expect(viewer.map((m) => m.subject).sort()).toEqual([
      '⏰ Alpha News · Cleaning is due in 3 days — $40.00 on Fri, 6 Nov.',
      '⚠️ Alpha News · Hosting is 14 days overdue — $1,523.00.',
    ]);
    const overdueMail = viewer.find((m) => m.subject.includes('overdue'))!;
    expect(overdueMail.html).toContain('Open in DueOra');
    expect(overdueMail.html).toContain('⚠️ Overdue');
    expect(overdueMail.html).toContain('Alpha News');
    // The admin has a phone and neither is a key moment → push only.
    expect(ctx.mailer.sent.filter((m) => m.to === USERS.admin.email)).toHaveLength(0);
    expect(ctx.push.to(TOKENS.admin).map((m) => m.channelId)).toContain('overdue');
  });
});

describe('stopping reminders', () => {
  it('stops as soon as the cycle is paid', async () => {
    const { fx, at, notes } = await setup();
    await at('2026-11-02T07:00:00Z'); // 3-day reminder for internet
    await fx.as('finance').post(`/api/v1/bills/${fx.billIds.internet}/payments`).send({ method: 'MOBILE_MONEY' });
    for (const day of ['03', '04', '05', '06']) await at(`2026-11-${day}T07:00:00Z`);
    const paidCycle = await notes({
      billId: fx.billIds.internet,
      cycleDueDate: '2026-11-05',
      type: { in: ['REMINDER', 'DUE_TODAY', 'OVERDUE'] },
    });
    expect(new Set(paidCycle.map((n) => n.offsetDays))).toEqual(new Set([3]));
    // The next cycle (5 Dec) starts fresh: its 30-day reminder correctly falls on 5 Nov.
    const nextCycle = await notes({ billId: fx.billIds.internet, cycleDueDate: '2026-12-05', channel: 'IN_APP', userId: fx.userIds.viewer });
    expect(nextCycle.map((n) => n.offsetDays)).toEqual([30]);
  });

  it('stops for people who mute, and for everyone when archived', async () => {
    const { fx, at, notes } = await setup();
    await fx.as('admin').post(`/api/v1/bills/${fx.billIds.cleaning}/mute`);
    await fx.as('finance').post(`/api/v1/bills/${fx.billIds['alpha-hosting']}/archive`);
    for (const day of ['02', '03', '04', '05', '06', '10']) await at(`2026-11-${day}T07:00:00Z`);
    expect(await notes({ billId: fx.billIds.cleaning, userId: fx.userIds.admin })).toHaveLength(0);
    expect((await notes({ billId: fx.billIds.cleaning, userId: fx.userIds.finance })).length).toBeGreaterThan(0);
    expect((await notes({ billId: fx.billIds.cleaning, userId: fx.userIds.viewer })).length).toBeGreaterThan(0);
    expect(await notes({ billId: fx.billIds['alpha-hosting'] })).toHaveLength(0);
  });

  it('cancels a queued push if the bill is paid during quiet hours', async () => {
    const { ctx, fx, at, notes } = await setup();
    // Quiet 08:30–10:00 local: the 09:00 run's pushes wait until 10:00 (08:00 UTC).
    await fx.as('admin').patch('/api/v1/workspaces/current').send({ quietHoursStart: 510, quietHoursEnd: 600 });
    await at('2026-11-02T07:00:00Z');
    const pushes = await notes({ channel: 'PUSH' });
    expect(pushes.every((p) => p.status === 'PENDING' && p.sendAfter?.toISOString() === '2026-11-02T08:00:00.000Z')).toBe(true);
    expect(ctx.push.sent).toHaveLength(0);
    expect(await notes({ channel: 'IN_APP' })).toHaveLength(3); // in-app appears immediately

    await fx.as('finance').post(`/api/v1/bills/${fx.billIds.internet}/payments`).send({ method: 'CASH' });
    await at('2026-11-02T08:00:00Z');
    const after = await notes({ channel: 'PUSH', type: 'REMINDER' });
    expect(after.every((p) => p.status === 'FAILED' && p.error === 'cancelled: paid')).toBe(true);
    expect(ctx.push.sent.filter((m) => m.body?.includes('Internet is due'))).toHaveLength(0);
    expect(ctx.mailer.sent.filter((m) => m.subject.includes('Internet is due'))).toHaveLength(0);
  });

  it('delivers after quiet hours end when still relevant', async () => {
    const { ctx, fx, at } = await setup();
    await fx.as('admin').patch('/api/v1/workspaces/current').send({ quietHoursStart: 510, quietHoursEnd: 600 });
    await at('2026-11-02T07:00:00Z');
    await at('2026-11-02T07:45:00Z');
    expect(ctx.push.sent).toHaveLength(0);
    await at('2026-11-02T08:00:00Z');
    expect(ctx.push.sent).toHaveLength(2);
  });
});

describe('delivery reliability', () => {
  it('retries transient push failures with backoff', async () => {
    const { ctx, at, notes } = await setup();
    ctx.push.failNext = 2;
    await at('2026-11-02T07:00:00Z');
    expect(ctx.push.sent).toHaveLength(0);
    expect((await ctx.db.job.findMany({ where: { queue: 'notify.push', status: 'PENDING' } })).length).toBeGreaterThan(0);
    for (const t of ['07:01', '07:02', '07:03', '07:05', '07:10']) await at(`2026-11-02T${t}:00Z`);
    expect(ctx.push.sent).toHaveLength(2);
    expect((await notes({ channel: 'PUSH' })).every((n) => n.status === 'SENT')).toBe(true);
  });

  it('deactivates unregistered devices and falls back to email', async () => {
    const { ctx, fx, at, notes } = await setup();
    ctx.push.unregistered.add(TOKENS.admin);
    await at('2026-11-02T07:00:00Z');
    expect((await ctx.db.deviceToken.findUniqueOrThrow({ where: { expoPushToken: TOKENS.admin } })).active).toBe(false);
    expect(ctx.mailer.sent.filter((m) => m.to === USERS.admin.email).map((m) => m.subject)).toEqual([
      '⏰ Alpha News · Internet is due in 3 days — $120.00 on Thu, 5 Nov.',
    ]);
    expect((await notes({ userId: fx.userIds.admin, channel: 'PUSH' }))[0]).toMatchObject({ status: 'FAILED' });
  });

  it('checks receipts ~15 minutes later', async () => {
    const { ctx, fx, at, notes } = await setup();
    await at('2026-11-02T07:00:00Z');
    const pushes = await notes({ channel: 'PUSH' });
    const first = pushes.find((n) => n.userId === fx.userIds.admin)!;
    const second = pushes.find((n) => n.userId === fx.userIds.finance)!;
    ctx.push.receiptOverrides.set(second.pushTicketId!, {
      status: 'error',
      message: 'gone',
      details: { error: 'DeviceNotRegistered', expoPushToken: TOKENS.finance },
    });
    await at('2026-11-02T07:10:00Z');
    expect(await notes({ channel: 'PUSH', status: 'DELIVERED' })).toHaveLength(0); // too early
    await at('2026-11-02T07:15:00Z');
    const after = await notes({ channel: 'PUSH' });
    expect(after.find((n) => n.id === first.id)?.status).toBe('DELIVERED');
    expect(after.find((n) => n.id === second.id)?.status).toBe('FAILED');
    const inactive = await ctx.db.deviceToken.findMany({ where: { active: false } });
    expect(inactive.map((t) => t.expoPushToken)).toEqual([TOKENS.finance]);
  });

  it('never sends twice even with three workers at once', async () => {
    const { ctx, at, notes } = await setup();
    ctx.clock.set('2026-11-02T07:00:00Z');
    await Promise.all([workOnce(ctx, 'w1'), workOnce(ctx, 'w2'), workOnce(ctx, 'w3')]);
    await at('2026-11-02T07:01:00Z');
    expect(ctx.push.sent).toHaveLength(2);
    expect(ctx.mailer.sent).toHaveLength(1);
    const keys = (await notes()).map((n) => n.dedupeKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('uses the deterministic dedupe key workspace:bill:type:cycle:offset:user:channel', async () => {
    const { fx, at, notes } = await setup();
    await at('2026-11-02T07:00:00Z');
    const n = (await notes({ userId: fx.userIds.admin, channel: 'IN_APP' }))[0]!;
    expect(n.dedupeKey).toBe([fx.workspaceId, fx.billIds.internet, 'REMINDER', '2026-11-05', 3, fx.userIds.admin, 'IN_APP'].join(':'));
  });
});

describe('catch-up after downtime', () => {
  it('sends only the most relevant missed reminder per bill', async () => {
    const { fx, at, notes } = await setup();
    await at('2026-11-02T07:00:00Z');
    await at('2026-11-03T07:00:00Z');
    // Down 4–7 Nov. Cleaning (due 6 Nov) missed its 1-day, due-day and 1-day-overdue
    // reminders; on 8 Nov only the latest (offset -1) goes out, phrased for today.
    await at('2026-11-08T07:00:00Z');
    const cleaning = await notes({ billId: fx.billIds.cleaning, userId: fx.userIds.finance, channel: 'IN_APP' });
    expect(cleaning.map((n) => n.offsetDays)).toEqual([3, -1]);
    expect(cleaning[1]!.body).toBe('⚠️ Alpha News · Cleaning is 2 days overdue — $40.00. Tap to record the payment.');
    // Internet (due 5 Nov) missed 1, 0 and -1; on 8 Nov its own -3 reminder is due.
    const internet = await notes({ billId: fx.billIds.internet, userId: fx.userIds.finance, channel: 'IN_APP' });
    expect(internet.map((n) => n.offsetDays)).toEqual([3, -3]);
    expect(internet[1]!.body).toContain('3 days overdue');
  });
});

describe('digest', () => {
  it('groups more than 3 reminders into one push and one email', async () => {
    const { ctx, fx, at, notes, addMonthly } = await setup();
    await addMonthly(['Figma', 'Notion', 'Slack', 'Zoom'], '2026-11-09');
    await at('2026-11-02T07:00:00Z'); // all four hit their 7-day reminder, plus Internet
    const admin = await notes({ userId: fx.userIds.admin });
    expect(admin.filter((n) => n.channel === 'IN_APP')).toHaveLength(5);
    const pushes = admin.filter((n) => n.channel === 'PUSH');
    expect(pushes).toHaveLength(1);
    expect(pushes[0]).toMatchObject({ type: 'DIGEST', title: '🔔 5 bills need attention this week' });
    const email = ctx.mailer.sent.filter((m) => m.to === USERS.admin.email);
    expect(email).toHaveLength(1);
    expect(email[0]!.subject).toBe('🔔 5 bills need attention this week');
    expect(email[0]!.text).toContain('Alpha News · Figma — $15.00');
    expect((await notes({ userId: fx.userIds.finance, channel: 'PUSH' }))[0]!.type).toBe('DIGEST');
    // The viewer (no phone) gets the single digest email, not five reminder emails.
    expect(ctx.mailer.sent.filter((m) => m.to === USERS.viewer.email).map((m) => m.tag)).toEqual(['digest']);
  });

  it('can be turned off', async () => {
    const { fx, at, notes, addMonthly } = await setup();
    await fx.as('admin').patch('/api/v1/notifications/preferences').send({ digestEnabled: false });
    await addMonthly(['A', 'B', 'C', 'D'], '2026-11-09');
    await at('2026-11-02T07:00:00Z');
    const pushes = await notes({ userId: fx.userIds.admin, channel: 'PUSH' });
    expect(pushes.every((n) => n.type !== 'DIGEST')).toBe(true);
    expect(pushes).toHaveLength(5);
  });
});

describe('payment recorded', () => {
  it('tells the other admins and finance members, without naming who recorded it', async () => {
    const { ctx, fx, at, notes, who } = await setup();
    ctx.clock.set('2026-11-02T08:00:00Z');
    await fx.as('finance').post(`/api/v1/bills/${fx.billIds['beta-hosting']}/payments`).send({ method: 'CARD', paidOn: '2026-11-02' });
    await at('2026-11-02T08:01:00Z');
    const recorded = await notes({ type: 'PAYMENT_RECORDED' });
    expect(recorded.map((n) => `${who(n.userId)}:${n.channel}`).sort()).toEqual(['admin:IN_APP', 'admin:PUSH']);
    expect(recorded[0]!.body).toBe('✅ $132.00 recorded for Beta Radio · Hosting. Next due: 02 Oct 2028.');
    expect(recorded[0]!.body).not.toContain(USERS.finance.name.split(' ')[0]);
    expect(ctx.push.to(TOKENS.admin).some((m) => m.body === recorded[0]!.body)).toBe(true);
  });
});

describe('notifications API', () => {
  it('serves the Alerts inbox with unread counts', async () => {
    const { fx, at } = await setup();
    await at('2026-11-02T07:00:00Z');
    await at('2026-11-03T07:00:00Z');
    const inbox = await fx.as('admin').get('/api/v1/notifications');
    expect(inbox.status).toBe(200);
    expect(inbox.body.unreadCount).toBe(inbox.body.total);
    expect(inbox.body.items[0].createdAt >= inbox.body.items.at(-1).createdAt).toBe(true);

    const first = inbox.body.items[0].id;
    expect((await fx.as('admin').post(`/api/v1/notifications/${first}/read`)).status).toBe(204);
    expect((await fx.as('admin').get('/api/v1/notifications')).body.unreadCount).toBe(inbox.body.total - 1);
    expect((await fx.as('admin').get('/api/v1/notifications').query({ unreadOnly: 'true' })).body.total).toBe(inbox.body.total - 1);
    expect((await fx.as('finance').post(`/api/v1/notifications/${first}/read`)).status).toBe(404); // someone else's
    await fx.as('admin').post('/api/v1/notifications/read-all');
    expect((await fx.as('admin').get('/api/v1/notifications')).body.unreadCount).toBe(0);
  });

  it('manages preferences, mutes and devices', async () => {
    const { app, fx } = await setup();
    const prefs = await fx.as('viewer').get('/api/v1/notifications/preferences');
    // (setup() turned the weekly and monthly summaries off for these tests.)
    expect(prefs.body).toEqual({
      pushEnabled: true,
      emailEnabled: true,
      inAppEnabled: true,
      digestEnabled: true,
      weeklySummary: false,
      monthlySummary: false,
      budgetAlerts: true,
      teamActivity: true,
      mutedBillIds: [],
    });
    expect((await fx.as('viewer').patch('/api/v1/notifications/preferences').send({ nonsense: true })).status).toBe(400);
    expect((await fx.as('viewer').patch('/api/v1/notifications/preferences').send({ emailEnabled: false })).body.emailEnabled).toBe(false);

    // Viewers receive reminders, so they may mute them.
    const id = fx.billIds['alpha-hosting'];
    expect((await fx.as('viewer').post(`/api/v1/bills/${id}/mute`)).status).toBe(200);
    expect((await fx.as('viewer').get(`/api/v1/bills/${id}`)).body.muted).toBe(true);
    expect((await fx.as('viewer').post(`/api/v1/bills/${id}/unmute`)).status).toBe(200);
    expect((await fx.as('viewer').get(`/api/v1/bills/${id}`)).body.muted).toBe(false);

    const bad = await client(app, fx.sessions.viewer).post('/api/v1/devices').send({ expoPushToken: 'not-a-token', platform: 'ios' });
    expect(bad.status).toBe(400);
  });

  it('sends a test notification on request', async () => {
    const { ctx, fx, at } = await setup();
    const res = await fx.as('admin').post('/api/v1/notifications/test');
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ queued: true, channel: 'PUSH', devices: 1 });
    await at('2026-11-02T06:00:30Z');
    expect(ctx.push.to(TOKENS.admin).map((m) => m.title)).toEqual(['🔔 Test from DueOra']);

    const viewer = await fx.as('viewer').post('/api/v1/notifications/test');
    expect(viewer.body.channel).toBe('EMAIL');
    await at('2026-11-02T06:01:00Z');
    expect(ctx.mailer.sent.some((m) => m.to === USERS.viewer.email && m.subject === '🔔 Test from DueOra')).toBe(true);
  });
});
