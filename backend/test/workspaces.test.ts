import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

import { addMember, client, createWorkspace, lastInviteToken, login, register, type Session } from './helpers/api.js';
import { createTestContext } from './helpers/context.js';

const ctx = createTestContext();
const app = createApp(ctx);

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4510000000049454e44ae426082', 'hex');

let admin: Session;
let orgId: string;

beforeAll(async () => {
  admin = await register(app, 'Anitha Uwase', 'anitha@acme.test');
  orgId = await createWorkspace(app, admin, 'Acme Ltd');
});

afterAll(async () => {
  await ctx.db.$disconnect();
});

describe('creating and reading workspaces', () => {
  it('makes the creator an admin with sensible defaults', async () => {
    const res = await client(app, admin, orgId).get('/api/v1/workspaces/current');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Acme Ltd',
      type: 'COMPANY',
      defaultCurrency: 'USD',
      timezone: 'Africa/Kigali',
      reminderHour: 9,
      defaultReminderOffsets: [30, 14, 7, 3, 1, 0, -1, -3, -7],
      myRole: 'ADMIN',
      memberCount: 1,
    });
    const me = await client(app, admin).get('/api/v1/me');
    expect(me.body.workspaces).toEqual([expect.objectContaining({ id: orgId, role: 'ADMIN' })]);
  });

  it('supports personal workspaces and switching between several', async () => {
    const personal = await client(app, admin)
      .post('/api/v1/workspaces')
      .send({ name: 'Anitha (personal)', type: 'PERSONAL', defaultCurrency: 'RWF' });
    expect(personal.status).toBe(201);
    const list = await client(app, admin).get('/api/v1/workspaces');
    expect(list.body.map((w: { name: string }) => w.name)).toEqual(['Acme Ltd', 'Anitha (personal)']);
    // Switching = sending a different X-Org-Id.
    const cur = await client(app, admin, personal.body.id).get('/api/v1/workspaces/current');
    expect(cur.body).toMatchObject({ type: 'PERSONAL', defaultCurrency: 'RWF' });
  });

  it('requires X-Org-Id for workspace routes', async () => {
    const res = await client(app, admin).get('/api/v1/workspaces/current');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ORG_REQUIRED');
  });

  it('validates timezone and currency', async () => {
    const res = await client(app, admin).post('/api/v1/workspaces').send({ name: 'X', timezone: 'Mars/Olympus', defaultCurrency: 'dollars' });
    expect(res.status).toBe(400);
  });
});

describe('updating company info', () => {
  it('lets admins update settings, reminder hour and quiet hours', async () => {
    const res = await client(app, admin, orgId)
      .patch('/api/v1/workspaces/current')
      .send({ name: 'Acme Rwanda Ltd', reminderHour: 8, quietHoursStart: 22 * 60, quietHoursEnd: 7 * 60, defaultReminderOffsets: [7, 1, 0, 14, 7] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Acme Rwanda Ltd', reminderHour: 8, quietHoursStart: 1320, quietHoursEnd: 420 });
    expect(res.body.defaultReminderOffsets).toEqual([14, 7, 1, 0]);
  });

  it('requires both quiet-hour bounds', async () => {
    const res = await client(app, admin, orgId).patch('/api/v1/workspaces/current').send({ quietHoursStart: 600 });
    expect(res.status).toBe(400);
  });

  it('uploads a logo, serves it publicly, and rejects non-images', async () => {
    const up = await client(app, admin, orgId).post('/api/v1/workspaces/current/logo').attach('file', PNG, 'logo.png');
    expect(up.status).toBe(200);
    expect(up.body.logoUrl).toMatch(new RegExp(`/api/v1/public/logos/${orgId}\\?v=\\d+$`));
    const served = await request(app).get(`/api/v1/public/logos/${orgId}`);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');

    const fake = await client(app, admin, orgId)
      .post('/api/v1/workspaces/current/logo')
      .attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'logo.png', contentType: 'image/png' });
    expect(fake.status).toBe(400);
  });

  it('rejects files over 5 MB', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await client(app, admin, orgId).post('/api/v1/workspaces/current/logo').attach('file', big, 'big.png');
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('stores exchange rates as decimals', async () => {
    const res = await client(app, admin, orgId).put('/api/v1/workspaces/current/exchange-rates/rwf').send({ rate: '0.00069' });
    expect(res.status).toBe(200);
    expect(res.body.exchangeRates).toEqual([{ fromCurrency: 'RWF', rate: '0.00069' }]);
    const same = await client(app, admin, orgId).put('/api/v1/workspaces/current/exchange-rates/USD').send({ rate: 1 });
    expect(same.status).toBe(400);
  });
});

describe('departments, invites and members', () => {
  let techId: string;

  it('manages departments', async () => {
    const res = await client(app, admin, orgId).post('/api/v1/workspaces/current/departments').send({ name: 'Technology' });
    expect(res.status).toBe(201);
    techId = res.body.id;
    const dup = await client(app, admin, orgId).post('/api/v1/workspaces/current/departments').send({ name: 'Technology' });
    expect(dup.status).toBe(409);
  });

  it('invites by email; the invitee previews and accepts', async () => {
    const inv = await client(app, admin, orgId).post('/api/v1/workspaces/current/invites').send({ email: 'Isaac@Acme.test', role: 'FINANCE' });
    expect(inv.status).toBe(201);
    const mail = ctx.mailer.lastTo('isaac@acme.test');
    expect(mail?.subject).toBe('Anitha Uwase invited you to Acme Rwanda Ltd on DueOra');
    expect(mail?.text).toContain('dueora://invite?token=');

    const token = lastInviteToken(ctx, 'isaac@acme.test');
    const preview = await request(app).get('/api/v1/public/invites/preview').query({ token });
    expect(preview.body).toMatchObject({ organization: { name: 'Acme Rwanda Ltd' }, role: 'FINANCE', invitedBy: 'Anitha Uwase' });

    const pending = await client(app, admin, orgId).get('/api/v1/workspaces/current/invites');
    expect(pending.body).toHaveLength(1);

    const isaac = await register(app, 'Isaac Mugisha', 'isaac@acme.test');
    const acc = await client(app, isaac).post('/api/v1/workspaces/accept-invite').send({ token });
    expect(acc.status).toBe(200);
    const me = await client(app, isaac).get('/api/v1/me');
    expect(me.body.workspaces).toEqual([expect.objectContaining({ id: orgId, role: 'FINANCE' })]);
    expect(me.body.emailVerified).toBe(true);

    // Tokens are single-use.
    const again = await client(app, isaac).post('/api/v1/workspaces/accept-invite').send({ token });
    expect(again.status).toBe(410);
  });

  it('refuses an invite accepted by a different email', async () => {
    await client(app, admin, orgId).post('/api/v1/workspaces/current/invites').send({ email: 'eric@acme.test', role: 'EMPLOYEE' });
    const token = lastInviteToken(ctx, 'eric@acme.test');
    const mallory = await register(app, 'Mallory', 'mallory@evil.test');
    const res = await client(app, mallory).post('/api/v1/workspaces/accept-invite').send({ token });
    expect(res.status).toBe(403);
  });

  it('expires invites after 7 days and lets admins revoke them', async () => {
    const inv = await client(app, admin, orgId).post('/api/v1/workspaces/current/invites').send({ email: 'late@acme.test', role: 'EMPLOYEE' });
    const token = lastInviteToken(ctx, 'late@acme.test');
    ctx.clock.advance(8 * 86_400_000);
    expect((await request(app).get('/api/v1/public/invites/preview').query({ token })).status).toBe(410);
    admin = await login(app, 'anitha@acme.test', 'correct-horse-9'); // access token expired with the jump

    const inv2 = await client(app, admin, orgId).post('/api/v1/workspaces/current/invites').send({ email: 'late@acme.test', role: 'EMPLOYEE' });
    expect((await client(app, admin, orgId).delete(`/api/v1/workspaces/current/invites/${inv2.body.id}`)).status).toBe(204);
    expect((await client(app, admin, orgId).delete(`/api/v1/workspaces/current/invites/${inv.body.id}`)).status).toBe(404);
  });

  it('requires a department for department officers', async () => {
    const res = await client(app, admin, orgId).post('/api/v1/workspaces/current/invites').send({ email: 'nadine@acme.test', role: 'DEPARTMENT' });
    expect(res.status).toBe(400);
    const ok = await client(app, admin, orgId).post('/api/v1/workspaces/current/invites').send({ email: 'nadine@acme.test', role: 'DEPARTMENT', departmentId: techId });
    expect(ok.status).toBe(201);
  });

  it('changes roles and protects the last admin', async () => {
    const members = await client(app, admin, orgId).get('/api/v1/workspaces/current/members');
    const me = members.body.find((m: { email: string }) => m.email === 'anitha@acme.test');
    const isaac = members.body.find((m: { email: string }) => m.email === 'isaac@acme.test');

    const demoteSelf = await client(app, admin, orgId).patch(`/api/v1/workspaces/current/members/${me.id}`).send({ role: 'FINANCE' });
    expect(demoteSelf.status).toBe(409);
    expect(demoteSelf.body.error.code).toBe('LAST_ADMIN');

    const promote = await client(app, admin, orgId).patch(`/api/v1/workspaces/current/members/${isaac.id}`).send({ role: 'DEPARTMENT', departmentId: techId });
    expect(promote.body).toMatchObject({ role: 'DEPARTMENT', department: { name: 'Technology' } });

    const leaveAsLastAdmin = await client(app, admin, orgId).delete(`/api/v1/workspaces/current/members/${me.id}`);
    expect(leaveAsLastAdmin.status).toBe(409);
  });

  it('removes members and records it in the audit log', async () => {
    const temp = await addMember(app, ctx, admin, orgId, 'Temp Person', 'temp@acme.test', 'EMPLOYEE');
    const members = await client(app, admin, orgId).get('/api/v1/workspaces/current/members');
    const row = members.body.find((m: { email: string }) => m.email === 'temp@acme.test');
    expect((await client(app, admin, orgId).delete(`/api/v1/workspaces/current/members/${row.id}`)).status).toBe(204);
    expect((await client(app, temp, orgId).get('/api/v1/workspaces/current')).status).toBe(404);
    const log = await ctx.db.auditLog.findFirst({ where: { organizationId: orgId, action: 'member.remove' } });
    expect(log).not.toBeNull();
  });
});

describe('role permissions on workspace routes', () => {
  let finance: Session;
  let employee: Session;

  beforeAll(async () => {
    finance = await addMember(app, ctx, admin, orgId, 'Fiona Finance', 'fiona@acme.test', 'FINANCE');
    employee = await addMember(app, ctx, admin, orgId, 'Eve Employee', 'eve@acme.test', 'EMPLOYEE');
  });

  it.each([
    ['patch', '/api/v1/workspaces/current', { name: 'Hacked' }],
    ['post', '/api/v1/workspaces/current/departments', { name: 'Shadow' }],
    ['post', '/api/v1/workspaces/current/invites', { email: 'x@acme.test', role: 'ADMIN' }],
    ['get', '/api/v1/workspaces/current/invites', undefined],
  ] as const)('finance and employees cannot %s %s', async (method, url, body) => {
    for (const s of [finance, employee]) {
      const res = await client(app, s, orgId)[method](url).send(body as object);
      expect(res.status).toBe(403);
    }
  });

  it('finance can manage exchange rates; employees cannot', async () => {
    expect((await client(app, finance, orgId).put('/api/v1/workspaces/current/exchange-rates/EUR').send({ rate: 1.08 })).status).toBe(200);
    expect((await client(app, employee, orgId).put('/api/v1/workspaces/current/exchange-rates/EUR').send({ rate: 2 })).status).toBe(403);
  });

  it('members can leave on their own', async () => {
    const members = await client(app, admin, orgId).get('/api/v1/workspaces/current/members');
    const eve = members.body.find((m: { email: string }) => m.email === 'eve@acme.test');
    const fiona = members.body.find((m: { email: string }) => m.email === 'fiona@acme.test');
    // An employee cannot remove someone else...
    expect((await client(app, employee, orgId).delete(`/api/v1/workspaces/current/members/${fiona.id}`)).status).toBe(403);
    // ...but can leave.
    expect((await client(app, employee, orgId).delete(`/api/v1/workspaces/current/members/${eve.id}`)).status).toBe(204);
  });
});

describe('deleting a workspace', () => {
  it('requires typing the name', async () => {
    const s = await register(app, 'Owner', 'owner@temp.test');
    const id = await createWorkspace(app, s, 'Temp Co');
    expect((await client(app, s, id).delete('/api/v1/workspaces/current').send({ confirmName: 'temp co' })).status).toBe(400);
    expect((await client(app, s, id).delete('/api/v1/workspaces/current').send({ confirmName: 'Temp Co' })).status).toBe(204);
    expect(await ctx.db.organization.findUnique({ where: { id } })).toBeNull();
  });
});
