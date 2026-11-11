import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

import { addMember, client, createWorkspace, lastInviteToken, register, type Session } from './helpers/api.js';
import { createTestContext } from './helpers/context.js';

/**
 * Cross-workspace isolation: a member of workspace A must never read or modify workspace B.
 * (test/security.test.ts additionally sweeps every registered route.)
 */
const ctx = createTestContext();
const app = createApp(ctx);

let aliceA: Session; // admin of A
let bobB: Session; // admin of B
let wsA: string;
let wsB: string;
let bMemberId: string;
let bCompanyId: string;
let bCategoryId: string;
let bBillId: string;
let bPaymentId: string;

const a = () => client(app, aliceA, wsA);
const aIntoB = () => client(app, aliceA, wsB);

beforeAll(async () => {
  ctx.clock.set('2026-11-02T07:00:00Z');
  aliceA = await register(app, 'Alice', 'alice@a.test');
  bobB = await register(app, 'Bob', 'bob@b.test');
  wsA = await createWorkspace(app, aliceA, 'Workspace A');
  wsB = await createWorkspace(app, bobB, 'Workspace B');
  await addMember(app, ctx, bobB, wsB, 'Carol', 'carol@b.test', 'VIEWER');
  const b = client(app, bobB, wsB);
  const members = await b.get('/api/v1/workspaces/current/members');
  bMemberId = members.body.find((m: { email: string }) => m.email === 'carol@b.test').id;
  bCompanyId = (await b.post('/api/v1/companies').send({ name: 'B-Company' })).body.id;
  bCategoryId = (await b.post('/api/v1/categories').send({ name: 'B-Only', icon: 'tag', color: '#111111' })).body.id;
  const created = await b.post('/api/v1/bills').send({
    name: 'B secret hosting',
    companyId: bCompanyId,
    categoryId: bCategoryId,
    amountCents: 99_900,
    frequencyUnit: 'YEAR',
    accountReference: 'B-SECRET-KEY-1234',
  });
  expect(created.status).toBe(201);
  bBillId = created.body.id;
  const paid = await b.post(`/api/v1/bills/${bBillId}/payments`).send({ amountCents: 100, method: 'CASH' });
  bPaymentId = paid.body.payment.id;
});

afterAll(async () => {
  await ctx.db.$disconnect();
});

describe('workspace-level isolation', () => {
  it('a non-member gets 404 for another workspace (no existence leak)', async () => {
    const res = await aIntoB().get('/api/v1/workspaces/current');
    const unknown = await client(app, aliceA, 'ws_does_not_exist').get('/api/v1/workspaces/current');
    expect(res.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(res.body.error.message).toBe(unknown.body.error.message);
  });

  it.each([
    ['patch', '/api/v1/workspaces/current', { name: 'Pwned' }],
    ['get', '/api/v1/workspaces/current/members', undefined],
    ['post', '/api/v1/workspaces/current/invites', { email: 'spy@a.test', role: 'ADMIN' }],
    ['delete', '/api/v1/workspaces/current', { confirmName: 'Workspace B' }],
    ['get', '/api/v1/companies', undefined],
    ['get', '/api/v1/bills', undefined],
    ['get', '/api/v1/payments', undefined],
    ['get', '/api/v1/dashboard', undefined],
    ['get', '/api/v1/reports', undefined],
    ['get', '/api/v1/notifications', undefined],
  ] as const)('workspace A admin cannot %s %s in workspace B', async (method, url, body) => {
    expect((await aIntoB()[method](url).send(body as object)).status).toBe(404);
  });

  it("cannot touch workspace B's members through workspace A", async () => {
    expect((await a().patch(`/api/v1/workspaces/current/members/${bMemberId}`).send({ role: 'ADMIN' })).status).toBe(404);
    expect((await a().delete(`/api/v1/workspaces/current/members/${bMemberId}`)).status).toBe(404);
  });

  it("an invite to workspace B can't be redeemed by a workspace A user with another email", async () => {
    await client(app, bobB, wsB).post('/api/v1/workspaces/current/invites').send({ email: 'dave@b.test', role: 'FINANCE' });
    const token = lastInviteToken(ctx, 'dave@b.test');
    expect((await client(app, aliceA).post('/api/v1/workspaces/accept-invite').send({ token })).status).toBe(403);
    expect(await ctx.db.membership.findFirst({ where: { userId: aliceA.userId, workspaceId: wsB } })).toBeNull();
  });
});

describe('data isolation: companies, categories, bills, payments', () => {
  it("workspace A never sees workspace B's data in any list", async () => {
    expect((await a().get('/api/v1/bills')).body.total).toBe(0);
    expect((await a().get('/api/v1/bills').query({ companyId: bCompanyId })).body.total).toBe(0);
    expect((await a().get('/api/v1/bills').query({ q: 'B-SECRET-KEY-1234' })).body.total).toBe(0);
    expect((await a().get('/api/v1/payments')).body.total).toBe(0);
    expect((await a().get('/api/v1/companies')).body.map((c: { name: string }) => c.name)).toEqual(['Workspace A']);
    expect((await a().get('/api/v1/categories')).body.some((c: { id: string }) => c.id === bCategoryId)).toBe(false);
    const dash = await a().get('/api/v1/dashboard');
    expect(dash.body.counts.total).toBe(0);
    const cal = await a().get('/api/v1/calendar').query({ from: '2026-11-01', to: '2027-11-30' });
    expect(cal.body.events).toEqual([]);
  });

  it.each([
    ['get', ''],
    ['get', '/reference'],
    ['patch', ''],
    ['post', '/archive'],
    ['post', '/unarchive'],
    ['post', '/payments'],
    ['post', '/mute'],
    ['delete', ''],
  ] as const)("workspace A cannot %s workspace B's bill%s", async (method, suffix) => {
    const body = suffix === '/payments' ? { method: 'CASH' } : method === 'patch' ? { name: 'Hijacked' } : {};
    const res = await a()[method](`/api/v1/bills/${bBillId}${suffix}`).send(body);
    expect(res.status).toBe(404);
  });

  it("workspace A cannot read, edit or delete workspace B's payments, companies or categories", async () => {
    expect((await a().get(`/api/v1/payments/${bPaymentId}`)).status).toBe(404);
    expect((await a().patch(`/api/v1/payments/${bPaymentId}`).send({ amountCents: 1 })).status).toBe(404);
    expect((await a().delete(`/api/v1/payments/${bPaymentId}`)).status).toBe(404);
    expect((await a().patch(`/api/v1/companies/${bCompanyId}`).send({ name: 'Mine' })).status).toBe(404);
    expect((await a().delete(`/api/v1/companies/${bCompanyId}`)).status).toBe(404);
    expect((await a().post(`/api/v1/companies/${bCompanyId}/unarchive`)).status).toBe(404);
    expect((await a().patch(`/api/v1/categories/${bCategoryId}`).send({ name: 'Mine' })).status).toBe(404);
    expect((await a().delete(`/api/v1/categories/${bCategoryId}`)).status).toBe(404);
  });

  it("workspace A cannot use workspace B's company or category on its own bill", async () => {
    const own = (await a().get('/api/v1/companies')).body[0].id;
    const cats = await a().get('/api/v1/categories');
    const body = { name: 'X', amountCents: 100, frequencyUnit: 'MONTH' };
    expect((await a().post('/api/v1/bills').send({ ...body, companyId: bCompanyId, categoryId: cats.body[0].id })).status).toBe(400);
    expect((await a().post('/api/v1/bills').send({ ...body, companyId: own, categoryId: bCategoryId })).status).toBe(400);
  });

  it("workspace B's data is unchanged after every attempt", async () => {
    expect((await ctx.db.workspace.findUniqueOrThrow({ where: { id: wsB } })).name).toBe('Workspace B');
    expect((await ctx.db.membership.findUniqueOrThrow({ where: { id: bMemberId } })).role).toBe('VIEWER');
    expect(await ctx.db.bill.findUniqueOrThrow({ where: { id: bBillId } })).toMatchObject({
      name: 'B secret hosting',
      status: 'ACTIVE',
      workspaceId: wsB,
    });
    expect((await ctx.db.paymentRecord.findUniqueOrThrow({ where: { id: bPaymentId } })).amountCents).toBe(100);
    expect((await ctx.db.company.findUniqueOrThrow({ where: { id: bCompanyId } })).name).toBe('B-Company');
    expect((await ctx.db.category.findUniqueOrThrow({ where: { id: bCategoryId } })).name).toBe('B-Only');
  });
});
