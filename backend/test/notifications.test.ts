import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { workOnce } from '../src/notifications/scheduler.js';

import { client } from './helpers/api.js';
import { createTestContext, type TestContext } from './helpers/context.js';
import { seedAndLogin, type SeededWorkspace } from './helpers/seed.js';

const TOKENS = { anitha: 'ExponentPushToken[anitha]', isaac: 'ExponentPushToken[isaac]' };
const contexts: TestContext[] = [];

/** Fresh seeded workspace at 2 Nov 2026 06:00 UTC (08:00 Kigali) with phones for Anitha and Isaac. */
async function setup() {
  // These tests move the clock by days; long-lived tokens keep the sessions valid.
  const ctx = createTestContext({}, { ACCESS_TOKEN_TTL_MINUTES: '1000000', REFRESH_TOKEN_TTL_DAYS: '3650' });
  contexts.push(ctx);
  ctx.clock.set('2026-11-02T06:00:00Z');
  const app = createApp(ctx);
  const ws = await seedAndLogin(app, ctx);
  for (const who of ['anitha', 'isaac'] as const) {
    const res = await client(app, ws.sessions[who]).post('/api/v1/devices').send({ expoPushToken: TOKENS[who], platform: 'android' });
    expect(res.status).toBe(204);
  }
  const as = (who: keyof SeededWorkspace['sessions']) => client(app, ws.sessions[who], ws.organizationId);
  /** Move the clock and let the worker do everything that's due. */
  const at = async (iso: string) => {
    ctx.clock.set(iso);
    await workOnce(ctx);
  };
  const notes = (where: Record<string, unknown> = {}) => ctx.db.notification.findMany({ where: { organizationId: ws.organizationId, ...where }, orderBy: { createdAt: 'asc' } });
  return { ctx, app, ws, as, at, notes };
}

afterEach(async () => {
  while (contexts.length) await contexts.pop()!.db.$disconnect();
});

describe('daily reminder run', () => {
  it('waits for 09:00 in Kigali, then sends exactly the reminders due today', async () => {
    const { ctx, ws, at, notes } = await setup();
    await at('2026-11-02T06:45:00Z'); // 08:45 local
    expect(await notes()).toHaveLength(0);

    await at('2026-11-02T07:00:00Z'); // 09:00 local
    const all = await notes();
    // Only "Office internet" (due 5 Nov, 3-day reminder) is due today. Recipients: Isaac
    // (assignee + finance) and Anitha (admin). Nadine is Technology, Eric isn't assigned.
    expect(new Set(all.map((n) => n.obligationId))).toEqual(new Set([ws.obligationIds.internet]));
    expect(all.map((n) => `${n.userId === ws.userIds.anitha ? 'anitha' : 'isaac'}:${n.channel}`).sort()).toEqual([
      'anitha:IN_APP',
      'anitha:PUSH',
      'isaac:IN_APP',
      'isaac:PUSH',
    ]);
    expect(all[0]).toMatchObject({ type: 'REMINDER', offsetDays: 3, cycleDueDate: '2026-11-05' });

    // Pushes went out with the brief's copy and the reminders channel.
    expect(ctx.push.sent.map((m) => m.to).sort()).toEqual([TOKENS.anitha, TOKENS.isaac]);
    expect(ctx.push.sent[0]).toMatchObject({
      title: 'Due in 3 days',
      body: '⏰ Office internet is due in 3 days — 85,000 RWF on Thu, 5 Nov.',
      channelId: 'reminders',
      data: { url: `dueora://payments/${ws.obligationIds.internet}` },
    });
    expect((await notes({ channel: 'PUSH' })).every((n) => n.status === 'SENT' && n.pushTicketId)).toBe(true);
    // A 3-day reminder isn't a "key moment" and both have phones → no email.
    expect(ctx.mailer.sent).toHaveLength(0);
  });

  it('runs once per day no matter how often the worker ticks', async () => {
    const { at, notes } = await setup();
    await at('2026-11-02T07:00:00Z');
    const count = (await notes()).length;
    for (const t of ['07:15', '07:30', '12:00', '21:45']) await at(`2026-11-02T${t}:00Z`);
    expect(await notes()).toHaveLength(count);
  });

  it('emails people without a phone, and on key moments', async () => {
    const { ctx, at } = await setup();
    await at('2026-11-02T07:00:00Z');
    ctx.mailer.sent.length = 0;
    // 3 Nov: KigaliToday hosting (due 20 Oct) hits its weekly follow-up (-14) and the
    // cleaning service its 3-day reminder.
    await at('2026-11-03T07:00:00Z');
    const nadine = ctx.mailer.sent.filter((m) => m.to === 'nadine@kigalitoday.com');
    expect(nadine.map((m) => m.subject)).toEqual(['⚠️ KigaliToday hosting is 14 days overdue — $1,523.']);
    expect(nadine[0]!.html).toContain('Open in DueOra');
    expect(nadine[0]!.html).toContain('⚠️ Overdue');
    // Eric (employee, assignee of cleaning, no phone) gets that one by email.
    expect(ctx.mailer.sent.filter((m) => m.to === 'eric@kigalitoday.com').map((m) => m.subject)).toEqual([
      '⏰ Cleaning service is due in 3 days — 25,000 RWF on Fri, 6 Nov.',
    ]);
    // Anitha has a phone and -14 isn't a key moment → push only.
    expect(ctx.mailer.sent.filter((m) => m.to === 'anitha@kigalitoday.com')).toHaveLength(0);
    expect(ctx.push.to(TOKENS.anitha).map((m) => m.channelId)).toContain('overdue');
  });
});

describe('stopping reminders', () => {
  it('stops as soon as the cycle is paid', async () => {
    const { ws, as, at, notes } = await setup();
    await at('2026-11-02T07:00:00Z'); // 3-day reminder for internet
    await as('isaac').post(`/api/v1/obligations/${ws.obligationIds.internet}/payments`).send({ method: 'MOBILE_MONEY' });
    for (const day of ['03', '04', '05', '06']) await at(`2026-11-${day}T07:00:00Z`);
    // The paid cycle (due 5 Nov) gets nothing more. Its next cycle (5 Dec) starts fresh:
    // its 30-day reminder correctly falls on 5 Nov.
    const paidCycle = await notes({ obligationId: ws.obligationIds.internet, cycleDueDate: '2026-11-05', type: { in: ['REMINDER', 'DUE_TODAY', 'OVERDUE'] } });
    expect(new Set(paidCycle.map((n) => n.offsetDays))).toEqual(new Set([3]));
    const nextCycle = await notes({ obligationId: ws.obligationIds.internet, cycleDueDate: '2026-12-05', channel: 'IN_APP', userId: ws.userIds.isaac });
    expect(nextCycle.map((n) => n.offsetDays)).toEqual([30]);
  });

  it('stops for people who mute, and when archived', async () => {
    const { ws, as, at, notes } = await setup();
    await as('anitha').post(`/api/v1/obligations/${ws.obligationIds.cleaning}/mute`);
    await as('isaac').post(`/api/v1/obligations/${ws.obligationIds['kt-hosting']}/archive`);
    for (const day of ['02', '03', '04', '05', '06', '10']) await at(`2026-11-${day}T07:00:00Z`);
    expect(await notes({ obligationId: ws.obligationIds.cleaning, userId: ws.userIds.anitha, type: { not: 'PAYMENT_RECORDED' } })).toHaveLength(0);
    expect((await notes({ obligationId: ws.obligationIds.cleaning, userId: ws.userIds.isaac })).length).toBeGreaterThan(0);
    expect(await notes({ obligationId: ws.obligationIds['kt-hosting'] })).toHaveLength(0);
  });

  it('cancels a queued push if the bill is paid during quiet hours', async () => {
    const { ctx, ws, as, at, notes } = await setup();
    // Quiet 08:30–10:00 local: the 09:00 run's pushes wait until 10:00 (08:00 UTC).
    await as('anitha').patch('/api/v1/workspaces/current').send({ quietHoursStart: 510, quietHoursEnd: 600 });
    await at('2026-11-02T07:00:00Z');
    const pushes = await notes({ channel: 'PUSH' });
    expect(pushes.every((p) => p.status === 'PENDING' && p.sendAfter?.toISOString() === '2026-11-02T08:00:00.000Z')).toBe(true);
    expect(ctx.push.sent).toHaveLength(0);
    // In-app entries appear immediately.
    expect((await notes({ channel: 'IN_APP' })).length).toBe(2);

    await as('isaac').post(`/api/v1/obligations/${ws.obligationIds.internet}/payments`).send({ method: 'CASH' });
    await at('2026-11-02T08:00:00Z');
    const after = await notes({ channel: 'PUSH', type: 'REMINDER' });
    expect(after.every((p) => p.status === 'FAILED' && p.error === 'cancelled: paid')).toBe(true);
    expect(ctx.push.sent.filter((m) => m.body?.includes('internet is due'))).toHaveLength(0);
  });

  it('delivers after quiet hours end when still relevant', async () => {
    const { ctx, as, at } = await setup();
    await as('anitha').patch('/api/v1/workspaces/current').send({ quietHoursStart: 510, quietHoursEnd: 600 });
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
    const pending = await ctx.db.job.findMany({ where: { queue: 'notify.push', status: 'PENDING' } });
    expect(pending.length).toBeGreaterThan(0);
    // Two failures consumed by the first job's retries; others succeed on later ticks.
    for (const t of ['07:01', '07:02', '07:03', '07:05', '07:10']) await at(`2026-11-02T${t}:00Z`);
    expect(ctx.push.sent).toHaveLength(2);
    expect((await notes({ channel: 'PUSH' })).every((n) => n.status === 'SENT')).toBe(true);
  });

  it('deactivates unregistered devices and falls back to email', async () => {
    const { ctx, ws, at, notes } = await setup();
    ctx.push.unregistered.add(TOKENS.anitha);
    await at('2026-11-02T07:00:00Z');
    const token = await ctx.db.deviceToken.findUniqueOrThrow({ where: { expoPushToken: TOKENS.anitha } });
    expect(token.active).toBe(false);
    expect(ctx.mailer.sent.filter((m) => m.to === 'anitha@kigalitoday.com').map((m) => m.subject)).toEqual([
      '⏰ Office internet is due in 3 days — 85,000 RWF on Thu, 5 Nov.',
    ]);
    const anithaPush = await notes({ userId: ws.userIds.anitha, channel: 'PUSH' });
    expect(anithaPush[0]).toMatchObject({ status: 'FAILED' });
  });

  it('checks receipts ~15 minutes later', async () => {
    const { ctx, ws, at, notes } = await setup();
    await at('2026-11-02T07:00:00Z');
    const pushes = await notes({ channel: 'PUSH' });
    const first = pushes.find((n) => n.userId === ws.userIds.anitha);
    const second = pushes.find((n) => n.userId === ws.userIds.isaac);
    ctx.push.receiptOverrides.set(second!.pushTicketId!, {
      status: 'error',
      message: 'gone',
      details: { error: 'DeviceNotRegistered', expoPushToken: TOKENS.isaac },
    });
    await at('2026-11-02T07:10:00Z');
    expect((await notes({ channel: 'PUSH', status: 'DELIVERED' }))).toHaveLength(0); // too early
    await at('2026-11-02T07:15:00Z');
    const after = await notes({ channel: 'PUSH' });
    expect(after.find((n) => n.id === first!.id)?.status).toBe('DELIVERED');
    expect(after.find((n) => n.id === second!.id)?.status).toBe('FAILED');
    const inactive = await ctx.db.deviceToken.findMany({ where: { active: false } });
    expect(inactive.map((t) => t.expoPushToken)).toEqual([TOKENS.isaac]);
  });

  it('never sends twice even with two workers at once', async () => {
    const { ctx, at, notes } = await setup();
    ctx.clock.set('2026-11-02T07:00:00Z');
    await Promise.all([workOnce(ctx, 'w1'), workOnce(ctx, 'w2'), workOnce(ctx, 'w3')]);
    await at('2026-11-02T07:01:00Z');
    expect(ctx.push.sent).toHaveLength(2);
    const keys = (await notes()).map((n) => n.dedupeKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('catch-up after downtime', () => {
  it('sends only the most relevant missed reminder per obligation', async () => {
    const { ws, at, notes } = await setup();
    await at('2026-11-02T07:00:00Z');
    await at('2026-11-03T07:00:00Z');
    // Server down 4–7 Nov. Cleaning (due 6 Nov) missed its 1-day, due-day and 1-day-overdue
    // reminders; on 8 Nov only the latest (offset -1) goes out, phrased for today.
    await at('2026-11-08T07:00:00Z');
    const cleaning = await notes({ obligationId: ws.obligationIds.cleaning, userId: ws.userIds.isaac, channel: 'IN_APP' });
    expect(cleaning.map((n) => n.offsetDays)).toEqual([3, -1]);
    expect(cleaning[1]!.body).toBe('⚠️ Cleaning service is 2 days overdue — 25,000 RWF. Tap to record the payment.');
    // Internet (due 5 Nov) missed 1, 0 and -1; on 8 Nov its own -3 reminder is due, so that one goes.
    const internet = await notes({ obligationId: ws.obligationIds.internet, userId: ws.userIds.isaac, channel: 'IN_APP' });
    expect(internet.map((n) => n.offsetDays)).toEqual([3, -3]);
    expect(internet[1]!.body).toContain('3 days overdue');
  });
});

describe('digest', () => {
  it('groups more than 3 reminders into one push and one email', async () => {
    const { ctx, ws, as, at, notes } = await setup();
    const cats = await as('anitha').get('/api/v1/categories');
    for (const name of ['Figma', 'Notion', 'Slack', 'Zoom']) {
      await as('anitha').post('/api/v1/obligations').send({
        name,
        provider: name,
        amountMinor: 1500,
        currency: 'USD',
        frequencyUnit: 'MONTH',
        startDate: '2026-11-09',
        categoryId: cats.body[0].id,
      });
    }
    await at('2026-11-02T07:00:00Z'); // all four hit their 7-day reminder, plus internet
    const anitha = await notes({ userId: ws.userIds.anitha });
    expect(anitha.filter((n) => n.channel === 'IN_APP')).toHaveLength(5);
    const pushes = anitha.filter((n) => n.channel === 'PUSH');
    expect(pushes).toHaveLength(1);
    expect(pushes[0]).toMatchObject({ type: 'DIGEST', title: '🔔 5 payments need attention this week' });
    const email = ctx.mailer.sent.filter((m) => m.to === 'anitha@kigalitoday.com');
    expect(email).toHaveLength(1);
    expect(email[0]!.subject).toBe('🔔 5 payments need attention this week');
    expect(email[0]!.text).toContain('Figma');
    // Isaac is finance, so he receives every reminder too → also a digest.
    expect((await notes({ userId: ws.userIds.isaac, channel: 'PUSH' }))[0]!.type).toBe('DIGEST');
  });

  it('can be turned off', async () => {
    const { ws, as, at, notes } = await setup();
    await as('anitha').patch('/api/v1/notifications/preferences').send({ digestEnabled: false });
    const cats = await as('anitha').get('/api/v1/categories');
    for (const name of ['A', 'B', 'C', 'D']) {
      await as('anitha').post('/api/v1/obligations').send({ name, provider: name, amountMinor: 100, currency: 'USD', frequencyUnit: 'MONTH', startDate: '2026-11-09', categoryId: cats.body[0].id });
    }
    await at('2026-11-02T07:00:00Z');
    expect((await notes({ userId: ws.userIds.anitha, channel: 'PUSH' })).every((n) => n.type !== 'DIGEST')).toBe(true);
    expect(await notes({ userId: ws.userIds.anitha, channel: 'PUSH' })).toHaveLength(5);
  });
});

describe('payment recorded', () => {
  it('tells admins and finance, not the person who recorded it', async () => {
    const { ctx, ws, as, at, notes } = await setup();
    ctx.clock.set('2026-11-02T08:00:00Z');
    await as('isaac').post(`/api/v1/obligations/${ws.obligationIds['ktr-hosting']}/payments`).send({ method: 'CARD', paidOn: '2026-11-02' });
    await at('2026-11-02T08:01:00Z');
    const recorded = await notes({ type: 'PAYMENT_RECORDED' });
    expect(recorded.map((n) => `${n.userId === ws.userIds.anitha ? 'anitha' : 'other'}:${n.channel}`).sort()).toEqual(['anitha:IN_APP', 'anitha:PUSH']);
    expect(recorded[0]!.body).toBe('✅ Isaac recorded $132 for KT Radio hosting. Next due: 02 Oct 2028.');
    expect(ctx.push.to(TOKENS.anitha).some((m) => m.body === recorded[0]!.body)).toBe(true);
  });
});

describe('notifications API', () => {
  it('serves the Alerts inbox with unread counts', async () => {
    const { as, at } = await setup();
    await at('2026-11-02T07:00:00Z');
    await at('2026-11-03T07:00:00Z');
    const inbox = await as('anitha').get('/api/v1/notifications');
    expect(inbox.status).toBe(200);
    expect(inbox.body.unreadCount).toBe(inbox.body.total);
    expect(inbox.body.items[0].createdAt >= inbox.body.items.at(-1).createdAt).toBe(true);

    const first = inbox.body.items[0].id;
    expect((await as('anitha').post(`/api/v1/notifications/${first}/read`)).status).toBe(204);
    expect((await as('anitha').get('/api/v1/notifications')).body.unreadCount).toBe(inbox.body.total - 1);
    expect((await as('anitha').get('/api/v1/notifications').query({ unreadOnly: 'true' })).body.total).toBe(inbox.body.total - 1);

    // Someone else's notification can't be marked read.
    expect((await as('isaac').post(`/api/v1/notifications/${first}/read`)).status).toBe(404);

    await as('anitha').post('/api/v1/notifications/read-all');
    expect((await as('anitha').get('/api/v1/notifications')).body.unreadCount).toBe(0);
  });

  it('manages preferences and devices', async () => {
    const { app, as, ws } = await setup();
    const prefs = await as('eric').get('/api/v1/notifications/preferences');
    expect(prefs.body).toEqual({ pushEnabled: true, emailEnabled: true, digestEnabled: true, mutedObligationIds: [] });
    const updated = await as('eric').patch('/api/v1/notifications/preferences').send({ emailEnabled: false });
    expect(updated.body.emailEnabled).toBe(false);

    expect((await as('eric').post(`/api/v1/obligations/${ws.obligationIds['kt-hosting']}/mute`)).status).toBe(404); // not visible to him
    const bad = await client(app, ws.sessions.eric).post('/api/v1/devices').send({ expoPushToken: 'not-a-token', platform: 'ios' });
    expect(bad.status).toBe(400);
  });

  it('sends a test notification on request', async () => {
    const { ctx, as, at } = await setup();
    const res = await as('anitha').post('/api/v1/notifications/test');
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ queued: true, channel: 'PUSH', devices: 1 });
    await at('2026-11-02T06:00:30Z');
    expect(ctx.push.to(TOKENS.anitha).map((m) => m.title)).toEqual(['🔔 Test from DueOra']);

    const eric = await as('eric').post('/api/v1/notifications/test');
    expect(eric.body.channel).toBe('EMAIL');
    await at('2026-11-02T06:01:00Z');
    expect(ctx.mailer.sent.some((m) => m.to === 'eric@kigalitoday.com' && m.subject === '🔔 Test from DueOra')).toBe(true);
  });
});
