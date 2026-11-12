/**
 * Company access (Finalize brief, Part 2). A member limited to some companies never sees,
 * changes, is told about or exports anything from the others — through lists, details,
 * dashboard, calendar, reports, search, budgets, import, AI tools or notifications.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { workOnce } from '../src/notifications/scheduler.js';

import { client, lastInviteToken, register, type Session } from './helpers/api.js';
import { createTestContext } from './helpers/context.js';
import { buildFixture, type Fixture } from './helpers/fixture.js';

const ctx = createTestContext({}, { ACCESS_TOKEN_TTL_MINUTES: '1000000', REFRESH_TOKEN_TTL_DAYS: '3650' });
const app = createApp(ctx);
let fx: Fixture;
/** FINANCE in Beta only. */
let betaFin: Session;
/** VIEWER in Alpha, FINANCE in Beta. */
let mixed: Session;
const as = (s: Session) => client(app, s, fx.workspaceId);

async function invite(email: string, body: Record<string, unknown>): Promise<Session> {
  const inv = await fx.as('admin').post('/api/v1/workspaces/current/invites').send({ email, ...body });
  expect(inv.status).toBe(201);
  const s = await register(app, email.split('@')[0]!, email);
  expect((await client(app, s).post('/api/v1/workspaces/accept-invite').send({ token: lastInviteToken(ctx, email) })).status).toBe(200);
  return s;
}

beforeAll(async () => {
  ctx.clock.set('2026-11-02T07:00:00Z');
  fx = await buildFixture(app, ctx);
  betaFin = await invite('bea@fixture.test', { role: 'FINANCE', allCompanies: false, companies: [{ companyId: fx.companies.beta, role: 'FINANCE' }] });
  mixed = await invite('max@fixture.test', {
    role: 'VIEWER',
    allCompanies: false,
    companies: [
      { companyId: fx.companies.alpha, role: 'VIEWER' },
      { companyId: fx.companies.beta, role: 'FINANCE' },
    ],
  });
});

afterAll(async () => {
  await ctx.db.$disconnect();
});

describe('invites and members carry company access', () => {
  it('rejects a restricted invite without companies, or with a company from elsewhere', async () => {
    const empty = await fx.as('admin').post('/api/v1/workspaces/current/invites').send({ email: 'x@fixture.test', role: 'VIEWER', allCompanies: false, companies: [] });
    expect(empty.status).toBe(400);
    const foreign = await fx
      .as('admin')
      .post('/api/v1/workspaces/current/invites')
      .send({ email: 'y@fixture.test', role: 'VIEWER', allCompanies: false, companies: [{ companyId: 'c'.repeat(25), role: 'VIEWER' }] });
    expect(foreign.status).toBe(404);
  });

  it('lists each member with their companies; the membership role is the strongest company role', async () => {
    const members = (await fx.as('admin').get('/api/v1/workspaces/current/members')).body as { email: string; role: string; allCompanies: boolean; companies: unknown[] }[];
    const bea = members.find((m) => m.email === 'bea@fixture.test')!;
    expect(bea).toMatchObject({ role: 'FINANCE', allCompanies: false, companies: [{ companyId: fx.companies.beta, role: 'FINANCE' }] });
    const max = members.find((m) => m.email === 'max@fixture.test')!;
    expect(max.role).toBe('FINANCE');
    expect(max.companies).toHaveLength(2);
    expect(members.find((m) => m.email === 'ada@fixture.test')).toMatchObject({ role: 'ADMIN', allCompanies: true, companies: [] });
  });

  it('tells the member what they can see', async () => {
    const me = await as(betaFin).get('/api/v1/workspaces/current');
    expect(me.body.myAccess).toEqual({ allCompanies: false, companies: [{ companyId: fx.companies.beta, role: 'FINANCE' }] });
  });
});

describe('a member limited to Beta', () => {
  it('sees only Beta in companies, bills, dashboard, calendar, reports and history', async () => {
    const companies = await as(betaFin).get('/api/v1/companies');
    expect(companies.body.map((c: { id: string }) => c.id)).toEqual([fx.companies.beta]);
    expect(companies.body[0].myRole).toBe('FINANCE');

    const bills = await as(betaFin).get('/api/v1/bills').query({ limit: 50 });
    const names = (bills.body.items ?? bills.body).map((b: { company: { id: string } }) => b.company.id);
    expect(names.length).toBe(3);
    expect(new Set(names)).toEqual(new Set([fx.companies.beta]));

    // Asking for Alpha explicitly matches nothing rather than leaking it.
    const asked = await as(betaFin).get('/api/v1/bills').query({ companyId: fx.companies.alpha });
    expect((asked.body.items ?? asked.body).length).toBe(0);

    const dash = await as(betaFin).get('/api/v1/dashboard');
    expect(JSON.stringify(dash.body)).not.toContain('Alpha News');
    const cal = await as(betaFin).get('/api/v1/calendar').query({ from: '2026-10-01', to: '2027-03-31' });
    expect(JSON.stringify(cal.body)).not.toContain(fx.billIds.internet);
    const rep = await as(betaFin).get('/api/v1/reports').query({ period: 'year', year: 2026 });
    expect(JSON.stringify(rep.body)).not.toContain('Alpha News');
    const hist = await as(betaFin).get('/api/v1/payments');
    expect(JSON.stringify(hist.body)).not.toContain(fx.billIds.workspace);
  });

  it('gets 404 for Alpha records and cannot change them', async () => {
    expect((await as(betaFin).get(`/api/v1/bills/${fx.billIds.internet}`)).status).toBe(404);
    expect((await as(betaFin).patch(`/api/v1/bills/${fx.billIds.internet}`).send({ name: 'Hacked' })).status).toBe(404);
    expect((await as(betaFin).post(`/api/v1/bills/${fx.billIds.internet}/payments`).send({ method: 'CASH' })).status).toBe(404);
    expect((await as(betaFin).get(`/api/v1/companies/${fx.companies.alpha}`)).status).toBe(404);
    const create = await as(betaFin)
      .post('/api/v1/bills')
      .send({ name: 'Sneaky', companyId: fx.companies.alpha, categoryId: fx.categories['Marketing'], amountCents: 100, frequencyUnit: 'MONTH' });
    expect(create.status).toBe(404);
    expect((await ctx.db.bill.findUniqueOrThrow({ where: { id: fx.billIds.internet } })).name).toBe('Internet');
  });

  it('manages Beta bills and payments', async () => {
    const create = await as(betaFin)
      .post('/api/v1/bills')
      .send({ name: 'Studio power', companyId: fx.companies.beta, categoryId: fx.categoriesOf.beta['Marketing'], amountCents: 5_000, frequencyUnit: 'MONTH' });
    expect(create.status).toBe(201);
    expect((await as(betaFin).post(`/api/v1/bills/${fx.billIds['beta-x']}/payments`).send({ method: 'CASH' })).status).toBe(201);
  });

  it('cannot see workspace-wide budgets or the full export', async () => {
    await fx.as('admin').put('/api/v1/budgets').send({ categoryId: null, monthlyLimitCents: 100_000 });
    expect((await as(betaFin).get('/api/v1/budgets')).body).toEqual([]);
    expect((await as(betaFin).put('/api/v1/budgets').send({ categoryId: null, monthlyLimitCents: 1 })).status).toBe(403);
    expect((await as(betaFin).get('/api/v1/workspaces/current/export')).status).toBe(403);
  });

  it('cannot create companies, and import refuses rows for other companies', async () => {
    expect((await as(betaFin).post('/api/v1/companies').send({ name: 'Mine' })).status).toBe(403);
    const rows = [
      ['Company', 'Name', 'Amount', 'Frequency', 'Next due date'],
      ['Alpha News', 'Paper', '10', 'Monthly', '2026-12-01'],
      ['Beta Radio', 'Antenna', '20', 'Monthly', '2026-12-01'],
      ['Gamma', 'New co', '30', 'Monthly', '2026-12-01'],
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const preview = await as(betaFin)
      .post('/api/v1/import/preview')
      .send({ fileName: 'bills.csv', contentBase64: Buffer.from(csv).toString('base64') });
    expect(preview.status).toBe(200);
    expect(preview.body.rows.map((r: { errors: string[] }) => r.errors.length > 0)).toEqual([true, false, true]);
  });
});

describe('a member with different roles per company', () => {
  it('records payments in Beta (FINANCE) but not in Alpha (VIEWER)', async () => {
    expect((await as(mixed).get(`/api/v1/bills/${fx.billIds.internet}`)).status).toBe(200);
    expect((await as(mixed).post(`/api/v1/bills/${fx.billIds.internet}/payments`).send({ method: 'CASH' })).status).toBe(403);
    expect((await as(mixed).patch(`/api/v1/bills/${fx.billIds.internet}`).send({ name: 'Nope' })).status).toBe(403);
    expect((await as(mixed).post(`/api/v1/bills/${fx.billIds['beta-hosting']}/payments`).send({ method: 'CASH' })).status).toBe(201);
  });

  it('reveals account references only where they are FINANCE', async () => {
    expect((await as(mixed).post(`/api/v1/bills/${fx.billIds.internet}/reference/reveal`)).status).not.toBe(200);
  });
});

describe('editing access', () => {
  it('moving a member to all companies, and back, takes effect on the next request', async () => {
    const members = (await fx.as('admin').get('/api/v1/workspaces/current/members')).body as { id: string; email: string }[];
    const bea = members.find((m) => m.email === 'bea@fixture.test')!;
    expect((await fx.as('admin').patch(`/api/v1/workspaces/current/members/${bea.id}`).send({ role: 'VIEWER', allCompanies: true })).status).toBe(200);
    expect((await as(betaFin).get('/api/v1/companies')).body).toHaveLength(2);
    const back = await fx
      .as('admin')
      .patch(`/api/v1/workspaces/current/members/${bea.id}`)
      .send({ role: 'FINANCE', allCompanies: false, companies: [{ companyId: fx.companies.beta, role: 'FINANCE' }] });
    expect(back.body).toMatchObject({ role: 'FINANCE', allCompanies: false });
    expect((await as(betaFin).get('/api/v1/companies')).body).toHaveLength(1);
  });
});

describe('notifications follow company access', () => {
  it('sends Alpha reminders only to members who can see Alpha', async () => {
    await ctx.db.notification.deleteMany({});
    ctx.clock.set('2026-11-03T07:00:00Z');
    await workOnce(ctx);
    const rows = await ctx.db.notification.findMany({ where: { workspaceId: fx.workspaceId, billId: { not: null } }, include: { bill: { select: { companyId: true } } } });
    expect(rows.length).toBeGreaterThan(0);
    const bea = await ctx.db.user.findUniqueOrThrow({ where: { email: 'bea@fixture.test' } });
    const max = await ctx.db.user.findUniqueOrThrow({ where: { email: 'max@fixture.test' } });
    expect(rows.filter((n) => n.userId === bea.id && n.bill?.companyId === fx.companies.alpha)).toEqual([]);
    expect(rows.some((n) => n.userId === max.id && n.bill?.companyId === fx.companies.alpha)).toBe(true);
    expect(rows.some((n) => n.userId === fx.userIds.admin && n.bill?.companyId === fx.companies.alpha)).toBe(true);
  });
});
