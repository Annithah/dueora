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
