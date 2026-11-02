import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

import { addMember, client, createWorkspace, lastInviteToken, register, type Session } from './helpers/api.js';
import { createTestContext } from './helpers/context.js';

/**
 * Cross-organization isolation: a member of org A must never read or modify org B.
 * Later phases extend this file for obligations, payments, attachments and reports.
 */
const ctx = createTestContext();
const app = createApp(ctx);

let aliceA: Session; // admin of A
let bobB: Session; // admin of B
let orgA: string;
let orgB: string;
let bMemberId: string;
let bDeptId: string;

beforeAll(async () => {
  aliceA = await register(app, 'Alice', 'alice@a.test');
  bobB = await register(app, 'Bob', 'bob@b.test');
  orgA = await createWorkspace(app, aliceA, 'Org A');
  orgB = await createWorkspace(app, bobB, 'Org B');
  await addMember(app, ctx, bobB, orgB, 'Carol', 'carol@b.test', 'EMPLOYEE');
  const members = await client(app, bobB, orgB).get('/api/v1/workspaces/current/members');
  bMemberId = members.body.find((m: { email: string }) => m.email === 'carol@b.test').id;
  bDeptId = (await client(app, bobB, orgB).post('/api/v1/workspaces/current/departments').send({ name: 'B-Dept' })).body.id;
});

afterAll(async () => {
  await ctx.db.$disconnect();
});

describe('cross-organization isolation', () => {
  it('a non-member gets 404 for another workspace (no existence leak)', async () => {
    const res = await client(app, aliceA, orgB).get('/api/v1/workspaces/current');
    expect(res.status).toBe(404);
    const unknown = await client(app, aliceA, 'org_does_not_exist').get('/api/v1/workspaces/current');
    expect(unknown.status).toBe(404);
    expect(res.body.error.message).toBe(unknown.body.error.message);
  });

  it.each([
    ['patch', '/api/v1/workspaces/current', { name: 'Pwned' }],
    ['get', '/api/v1/workspaces/current/members', undefined],
    ['get', '/api/v1/workspaces/current/departments', undefined],
    ['post', '/api/v1/workspaces/current/invites', { email: 'spy@a.test', role: 'ADMIN' }],
    ['put', '/api/v1/workspaces/current/exchange-rates/EUR', { rate: 9 }],
    ['delete', '/api/v1/workspaces/current', { confirmName: 'Org B' }],
  ] as const)('org A admin cannot %s %s in org B', async (method, url, body) => {
    const res = await client(app, aliceA, orgB)[method](url).send(body as object);
    expect(res.status).toBe(404);
  });

  it("cannot touch org B's members or departments through org A", async () => {
    // Using A's header with B's ids must not find anything.
    const patch = await client(app, aliceA, orgA).patch(`/api/v1/workspaces/current/members/${bMemberId}`).send({ role: 'ADMIN' });
    expect(patch.status).toBe(404);
    const del = await client(app, aliceA, orgA).delete(`/api/v1/workspaces/current/members/${bMemberId}`);
    expect(del.status).toBe(404);
    const dept = await client(app, aliceA, orgA).patch(`/api/v1/workspaces/current/departments/${bDeptId}`).send({ name: 'Mine now' });
    expect(dept.status).toBe(404);
    const delDept = await client(app, aliceA, orgA).delete(`/api/v1/workspaces/current/departments/${bDeptId}`);
    expect(delDept.status).toBe(404);
  });

  it("cannot assign org B's department to an org A invite or member", async () => {
    const res = await client(app, aliceA, orgA).post('/api/v1/workspaces/current/invites').send({ email: 'd@a.test', role: 'DEPARTMENT', departmentId: bDeptId });
    expect(res.status).toBe(400);
  });

  it('B data is unchanged after all attempts', async () => {
    const org = await ctx.db.organization.findUniqueOrThrow({ where: { id: orgB } });
    expect(org.name).toBe('Org B');
    const carol = await ctx.db.membership.findUniqueOrThrow({ where: { id: bMemberId } });
    expect(carol.role).toBe('EMPLOYEE');
    const dept = await ctx.db.department.findUniqueOrThrow({ where: { id: bDeptId } });
    expect(dept.name).toBe('B-Dept');
  });

  it("an invite to org B can't be redeemed by an org A user with another email", async () => {
    await client(app, bobB, orgB).post('/api/v1/workspaces/current/invites').send({ email: 'dave@b.test', role: 'FINANCE' });
    const token = lastInviteToken(ctx, 'dave@b.test');
    const res = await client(app, aliceA).post('/api/v1/workspaces/accept-invite').send({ token });
    expect(res.status).toBe(403);
    expect(await ctx.db.membership.findFirst({ where: { userId: aliceA.userId, organizationId: orgB } })).toBeNull();
  });
});

describe('cross-organization isolation: obligations, platforms, categories', () => {
  let bObligationId: string;
  let bPlatformId: string;
  let bCategoryId: string;

  beforeAll(async () => {
    const b = client(app, bobB, orgB);
    const cats = await b.get('/api/v1/categories');
    bPlatformId = (await b.post('/api/v1/platforms').send({ name: 'B-Platform' })).body.id;
    bCategoryId = (await b.post('/api/v1/categories').send({ name: 'B-Only', icon: 'tag', color: '#111111' })).body.id;
    const created = await b.post('/api/v1/obligations').send({
      name: 'B secret hosting',
      provider: 'B Corp',
      amountMinor: 99900,
      currency: 'USD',
      frequencyUnit: 'YEAR',
      startDate: '2026-12-01',
      categoryId: cats.body[0].id,
      platformId: bPlatformId,
    });
    expect(created.status).toBe(201);
    bObligationId = created.body.id;
  });

  it("org A never sees org B's obligations, platforms or custom categories", async () => {
    const a = client(app, aliceA, orgA);
    expect((await a.get('/api/v1/obligations')).body.total).toBe(0);
    expect((await a.get('/api/v1/obligations').query({ platformId: bPlatformId })).body.total).toBe(0);
    expect((await a.get('/api/v1/platforms')).body).toEqual([]);
    const cats = await a.get('/api/v1/categories');
    expect(cats.body.some((c: { id: string }) => c.id === bCategoryId)).toBe(false);
  });

  it.each([
    ['get', ''],
    ['patch', ''],
    ['post', '/archive'],
    ['post', '/unarchive'],
    ['delete', ''],
  ] as const)("org A cannot %s org B's obligation%s", async (method, suffix) => {
    const res = await client(app, aliceA, orgA)[method](`/api/v1/obligations/${bObligationId}${suffix}`).send({ name: 'Hijacked' });
    expect(res.status).toBe(404);
  });

  it("org A cannot edit or delete org B's platform or category", async () => {
    const a = client(app, aliceA, orgA);
    expect((await a.patch(`/api/v1/platforms/${bPlatformId}`).send({ name: 'Mine' })).status).toBe(404);
    expect((await a.delete(`/api/v1/platforms/${bPlatformId}`)).status).toBe(404);
    expect((await a.patch(`/api/v1/categories/${bCategoryId}`).send({ name: 'Mine' })).status).toBe(404);
    expect((await a.delete(`/api/v1/categories/${bCategoryId}`)).status).toBe(404);
  });

  it("org A cannot attach org B's platform or category to its own obligation", async () => {
    const a = client(app, aliceA, orgA);
    const cats = await a.get('/api/v1/categories');
    const body = { name: 'X', provider: 'Y', amountMinor: 100, currency: 'USD', frequencyUnit: 'MONTH', startDate: '2026-12-01' };
    expect((await a.post('/api/v1/obligations').send({ ...body, categoryId: bCategoryId })).status).toBe(400);
    expect((await a.post('/api/v1/obligations').send({ ...body, categoryId: cats.body[0].id, platformId: bPlatformId })).status).toBe(400);
  });

  it("org B's obligation is untouched", async () => {
    const o = await ctx.db.obligation.findUniqueOrThrow({ where: { id: bObligationId } });
    expect(o).toMatchObject({ name: 'B secret hosting', status: 'ACTIVE', organizationId: orgB });
  });
});
