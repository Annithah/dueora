/**
 * Account references are sensitive (license keys, account numbers). This suite proves:
 * - they are encrypted at rest: the plain value appears in no database column
 * - they never reach logs, notifications (in-app, push, email) or the audit log
 * - VIEWER only ever gets the masked value
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { createLogger } from '../src/lib/logger.js';
import { workOnce } from '../src/notifications/scheduler.js';

import { client } from './helpers/api.js';
import { createTestContext } from './helpers/context.js';
import { buildFixture, type Fixture } from './helpers/fixture.js';

const KEY = 'ACCT-7781-SECRET-4F7A';
const logLines: string[] = [];
const ctx = createTestContext({ logger: createLogger('trace', false, { write: (line: string) => void logLines.push(line) }) });
const app = createApp(ctx);
let fx: Fixture;
let id: string;

beforeAll(async () => {
  ctx.clock.set('2026-11-02T07:00:00Z'); // 09:00 Kigali: reminders run on the first worker tick
  fx = await buildFixture(app, ctx, { bills: false });
  await client(app, fx.sessions.admin).post('/api/v1/devices').send({ expoPushToken: 'ExponentPushToken[keys-admin]', platform: 'android' });
  const created = await fx.as('admin').post('/api/v1/bills').send({
    name: 'Accounting suite',
    companyId: fx.companies.alpha,
    categoryId: fx.categories['Technology & software'],
    amountCents: 4_900,
    frequencyUnit: 'MONTH',
    startDate: '2026-11-02',
    nextDueDate: '2026-11-09', // 7 days → a key-moment reminder (push + email + in-app)
    accountReference: KEY,
  });
  expect(created.status).toBe(201);
  id = created.body.id;

  // Exercise every path that touches the bill.
  await fx.as('admin').get(`/api/v1/bills/${id}`);
  await fx.as('admin').get(`/api/v1/bills/${id}/reference`);
  await fx.as('viewer').get(`/api/v1/bills/${id}/reference`);
  await fx.as('finance').patch(`/api/v1/bills/${id}`).send({ accountReference: KEY, name: 'Accounting suite' });
  await fx.as('admin').post('/api/v1/bills').send({ accountReference: KEY }); // invalid → validation error path
  await workOnce(ctx, 'keys-worker');
  await fx.as('finance').post(`/api/v1/bills/${id}/payments`).send({ method: 'CARD', amountCents: 1_000 });
  await workOnce(ctx, 'keys-worker');
  await fx.as('admin').get('/api/v1/reports/export').query({ format: 'xlsx' });
});

afterAll(async () => {
  await ctx.db.$disconnect();
});

describe('account references', () => {
  it('are encrypted at rest — the plain value is in no column of any table', async () => {
    const tables = (await ctx.db.$queryRawUnsafe<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'",
    )).map((t) => t.name);
    expect(tables).toContain('Bill');
    for (const table of tables) {
      const rows = await ctx.db.$queryRawUnsafe<unknown[]>(`SELECT * FROM "${table}"`);
      expect(JSON.stringify(rows), table).not.toContain(KEY);
      expect(JSON.stringify(rows), table).not.toContain('7781-SECRET');
    }
    const row = await ctx.db.bill.findUniqueOrThrow({ where: { id } });
    expect(ctx.keys.decrypt(row.accountRefEncrypted!)).toBe(KEY);
  });

  it('never appear in logs', () => {
    expect(logLines.length).toBeGreaterThan(10);
    const all = logLines.join('\n');
    expect(all).not.toContain(KEY);
    expect(all).not.toContain('7781-SECRET');
  });

  it('never appear in notifications, push messages or emails', async () => {
    const notes = await ctx.db.notification.findMany({ where: { billId: id } });
    expect(notes.map((n) => n.channel).sort()).toEqual(expect.arrayContaining(['EMAIL', 'IN_APP', 'PUSH']));
    expect(JSON.stringify(notes)).not.toContain(KEY);
    expect(ctx.push.sent.length).toBeGreaterThan(0);
    expect(JSON.stringify(ctx.push.sent)).not.toContain(KEY);
    const reminderMails = ctx.mailer.sent.filter((m) => m.tag === 'reminder');
    expect(reminderMails.length).toBeGreaterThan(0);
    expect(JSON.stringify(ctx.mailer.sent)).not.toContain(KEY);
  });

  it('are masked for VIEWER everywhere, and the reveal endpoint refuses them', async () => {
    const detail = await fx.as('viewer').get(`/api/v1/bills/${id}`);
    expect(detail.body.accountReference.masked).toBe('••••••4F7A');
    expect(JSON.stringify(detail.body)).not.toContain(KEY);
    expect((await fx.as('viewer').get(`/api/v1/bills/${id}/reference`)).status).toBe(403);
    const dash = await fx.as('viewer').get('/api/v1/dashboard');
    expect(JSON.stringify(dash.body)).not.toContain(KEY);
  });

  it('never appear in the audit log, even though reveals are recorded', async () => {
    const logs = await ctx.db.auditLog.findMany({ where: { workspaceId: fx.workspaceId } });
    expect(logs.some((l) => l.action === 'bill.reference.reveal')).toBe(true);
    expect(JSON.stringify(logs)).not.toContain(KEY);
  });
});
