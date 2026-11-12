import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

import { addMember, client, createWorkspace, lastInviteToken, login, register, type Session } from './helpers/api.js';
import { createTestContext } from './helpers/context.js';

const ctx = createTestContext();
const app = createApp(ctx);

let admin: Session;
let workspaceId: string;
const asAdmin = () => client(app, admin, workspaceId);

beforeAll(async () => {
  admin = await register(app, 'Amina Admin', 'amina@acme.test');
  workspaceId = await createWorkspace(app, admin, 'Acme Ltd');
});

afterAll(async () => {
  await ctx.db.$disconnect();
});

describe('creating and reading workspaces', () => {
  it('makes the creator an admin with sensible defaults and a first company', async () => {
    const res = await asAdmin().get('/api/v1/workspaces/current');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Acme Ltd',
      type: 'COMPANY',
      timezone: 'Africa/Kigali',
      reminderHour: 9,
      defaultReminderOffsets: [30, 14, 7, 3, 1, 0, -1, -3, -7],
      myRole: 'ADMIN',
      memberCount: 1,
      companyCount: 1,
      billCount: 0,
    });
    expect(res.body).not.toHaveProperty('defaultCurrency');
    const companies = await asAdmin().get('/api/v1/companies');
    expect(companies.body).toEqual([expect.objectContaining({ name: 'Acme Ltd', archived: false, billCount: 0 })]);
    const me = await client(app, admin).get('/api/v1/me');
    expect(me.body.workspaces).toEqual([expect.objectContaining({ id: workspaceId, role: 'ADMIN' })]);
  });

  it('names the first company from setup, and supports personal workspaces and switching', async () => {
    const named = await client(app, admin)
      .post('/api/v1/workspaces')
      .send({ name: 'Media Group', firstCompanyName: 'Radio One' });
    const companies = await client(app, admin, named.body.id).get('/api/v1/companies');
    expect(companies.body.map((c: { name: string }) => c.name)).toEqual(['Radio One']);

    const personal = await client(app, admin).post('/api/v1/workspaces').send({ name: 'Amina (personal)', type: 'PERSONAL' });
    expect(personal.status).toBe(201);
    const personalCompanies = await client(app, admin, personal.body.id).get('/api/v1/companies');
    expect(personalCompanies.body.map((c: { name: string }) => c.name)).toEqual(['Personal']);

    const list = await client(app, admin).get('/api/v1/workspaces');
    expect(list.body.map((w: { name: string }) => w.name)).toEqual(['Acme Ltd', 'Media Group', 'Amina (personal)']);
    const cur = await client(app, admin, personal.body.id).get('/api/v1/workspaces/current');
    expect(cur.body).toMatchObject({ type: 'PERSONAL' });
  });

  it('requires X-Workspace-Id for workspace routes', async () => {
    const res = await client(app, admin).get('/api/v1/workspaces/current');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WORKSPACE_REQUIRED');
  });

  it('validates the timezone and rejects currency fields', async () => {
    expect((await client(app, admin).post('/api/v1/workspaces').send({ name: 'X', timezone: 'Mars/Olympus' })).status).toBe(400);
    expect((await asAdmin().patch('/api/v1/workspaces/current').send({ defaultCurrency: 'RWF' })).status).toBe(400);
  });
});

describe('workspace settings', () => {
  it('lets admins update name, timezone, reminder hour, quiet hours and default reminders', async () => {
    const res = await asAdmin()
      .patch('/api/v1/workspaces/current')
      .send({ name: 'Acme Rwanda Ltd', reminderHour: 8, quietHoursStart: 22 * 60, quietHoursEnd: 7 * 60, defaultReminderOffsets: [7, 1, 0, 14, 7] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Acme Rwanda Ltd', reminderHour: 8, quietHoursStart: 1320, quietHoursEnd: 420 });
    expect(res.body.defaultReminderOffsets).toEqual([14, 7, 1, 0]);
  });

  it('requires both quiet-hour bounds', async () => {
    expect((await asAdmin().patch('/api/v1/workspaces/current').send({ quietHoursStart: 600 })).status).toBe(400);
  });

  it('has no logo or exchange-rate routes (no file storage, USD only)', async () => {
    expect((await asAdmin().post('/api/v1/workspaces/current/logo')).status).toBe(404);
    expect((await asAdmin().put('/api/v1/workspaces/current/exchange-rates/RWF').send({ rate: 1 })).status).toBe(404);
  });
});

describe('companies', () => {
  let companyId: string;

  it('creates, renames and lists companies; names are unique per workspace', async () => {
    const res = await asAdmin().post('/api/v1/companies').send({ name: 'Radio Two', color: '#3B82F6', categoryStart: { mode: 'suggestions' } });
    expect(res.status).toBe(201);
    companyId = res.body.id;
    expect((await asAdmin().post('/api/v1/companies').send({ name: 'Radio Two' })).status).toBe(409);
    const renamed = await asAdmin().patch(`/api/v1/companies/${companyId}`).send({ name: 'Radio 2' });
    expect(renamed.body).toMatchObject({ name: 'Radio 2', color: '#3B82F6' });
    expect((await asAdmin().get('/api/v1/companies')).body.map((c: { name: string }) => c.name)).toEqual(['Acme Ltd', 'Radio 2']);
  });

  it('deletes a company without bills; one with bills must be archived explicitly', async () => {
    const unused = await asAdmin().post('/api/v1/companies').send({ name: 'Unused' });
    expect((await asAdmin().delete(`/api/v1/companies/${unused.body.id}`)).status).toBe(204);

    const cats = await asAdmin().get('/api/v1/categories').query({ companyId });
    await asAdmin()
      .post('/api/v1/bills')
      .send({ name: 'Streaming', companyId, categoryId: cats.body[0].id, amountCents: 999, frequencyUnit: 'MONTH' });
    const refused = await asAdmin().delete(`/api/v1/companies/${companyId}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('HAS_BILLS');

    const archived = await asAdmin().post(`/api/v1/companies/${companyId}/archive`);
    expect(archived.body.archived).toBe(true);
    expect((await asAdmin().get('/api/v1/companies')).body.map((c: { name: string }) => c.name)).toEqual(['Acme Ltd']);
    const all = await asAdmin().get('/api/v1/companies').query({ includeArchived: 'true' });
    expect(all.body.find((c: { id: string }) => c.id === companyId)).toMatchObject({ archived: true, billCount: 1 });

    // Archived companies can't take new bills, but can be restored.
    const blocked = await asAdmin()
      .post('/api/v1/bills')
      .send({ name: 'Another', companyId, categoryId: cats.body[0].id, amountCents: 100, frequencyUnit: 'MONTH' });
    expect(blocked.status).toBe(400);
    expect((await asAdmin().post(`/api/v1/companies/${companyId}/unarchive`)).body.archived).toBe(false);
  });

  it('derives initials and stores the optional company settings', async () => {
    const res = await asAdmin()
      .post('/api/v1/companies')
      .send({ name: 'Kivu Radio Ltd', description: 'FM station', reminderOffsets: [1, 7, 3], reminderHour: 8, monthlyBudgetCents: 50000 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ shortName: 'KR', description: 'FM station', reminderOffsets: [7, 3, 1], reminderHour: 8, monthlyBudgetCents: 50000 });
    const patched = await asAdmin().patch(`/api/v1/companies/${res.body.id}`).send({ shortName: 'kv', reminderHour: null });
    expect(patched.body).toMatchObject({ shortName: 'KV', reminderHour: null });
  });
});

describe('categories', () => {
  let companyId: string;

  it('belong to a company; the first company starts with the suggestions', async () => {
    companyId = (await asAdmin().get('/api/v1/companies')).body[0].id;
    const list = (await asAdmin().get('/api/v1/categories').query({ companyId })).body as { name: string; companyId: string }[];
    expect(list.length).toBeGreaterThan(5);
    expect(list.every((c) => c.companyId === companyId)).toBe(true);
    expect(list.map((c) => c.name)).toContain('Insurance');
  });

  it('creates with sub-categories, edits, archives and deletes; names are unique per company', async () => {
    const created = await asAdmin()
      .post('/api/v1/categories')
      .send({ companyId, name: 'Licences', icon: 'key', color: '#7C3AED', subcategories: ['Design', 'Office'], defaultFrequencyUnit: 'YEAR' });
    expect(created.status).toBe(201);
    expect(created.body.defaults.frequencyUnit).toBe('YEAR');
    const subs = (await asAdmin().get('/api/v1/categories').query({ companyId })).body.filter((c: { parentId: string | null }) => c.parentId === created.body.id);
    expect(subs.map((c: { name: string }) => c.name).sort()).toEqual(['Design', 'Office']);
    // One level only.
    expect((await asAdmin().post('/api/v1/categories').send({ companyId, name: 'Deep', parentId: subs[0].id })).status).toBe(400);
    expect((await asAdmin().post('/api/v1/categories').send({ companyId, name: 'Insurance', icon: 'shield', color: '#157A53' })).status).toBe(409);
    expect((await asAdmin().patch(`/api/v1/categories/${created.body.id}`).send({ name: 'Licenses' })).body.name).toBe('Licenses');

    const archived = await asAdmin().post(`/api/v1/categories/${created.body.id}/archive`);
    expect(archived.body.archived).toBe(true);
    expect((await asAdmin().get('/api/v1/categories').query({ companyId })).body.some((c: { id: string }) => c.id === created.body.id)).toBe(false);
    expect((await asAdmin().post(`/api/v1/categories/${created.body.id}/unarchive`)).body.archived).toBe(false);
    expect((await asAdmin().delete(`/api/v1/categories/${created.body.id}`)).status).toBe(204);
    // Its sub-categories became top level.
    const after = (await asAdmin().get('/api/v1/categories').query({ companyId })).body.filter((c: { name: string }) => ['Design', 'Office'].includes(c.name));
    expect(after.every((c: { parentId: string | null }) => c.parentId === null)).toBe(true);
  });

  it('merges and moves bills before deleting, and reorders', async () => {
    const cats = (await asAdmin().get('/api/v1/categories').query({ companyId })).body as { id: string; name: string }[];
    const from = cats.find((c) => c.name === 'Design')!;
    const into = cats.find((c) => c.name === 'Office')!;
    const bill = await asAdmin().post('/api/v1/bills').send({ name: 'Figma', companyId, categoryId: from.id, amountCents: 1500, frequencyUnit: 'MONTH' });
    expect((await asAdmin().delete(`/api/v1/categories/${from.id}`)).status).toBe(409);
    expect((await asAdmin().delete(`/api/v1/categories/${from.id}`).query({ moveToId: into.id })).status).toBe(204);
    expect((await asAdmin().get(`/api/v1/bills/${bill.body.id}`)).body.category.id).toBe(into.id);

    const ids = (await asAdmin().get('/api/v1/categories').query({ companyId })).body.filter((c: { parentId: string | null }) => !c.parentId).map((c: { id: string }) => c.id);
    const reversed = [...ids].reverse();
    expect((await asAdmin().post('/api/v1/categories/reorder').send({ companyId, ids: reversed })).status).toBe(204);
    const now = (await asAdmin().get('/api/v1/categories').query({ companyId })).body.filter((c: { parentId: string | null }) => !c.parentId).map((c: { id: string }) => c.id);
    expect(now).toEqual(reversed);
  });

  it('a new company can start empty, from suggestions, or as a copy', async () => {
    const empty = await asAdmin().post('/api/v1/companies').send({ name: 'Empty Co' });
    expect((await asAdmin().get('/api/v1/categories').query({ companyId: empty.body.id })).body).toEqual([]);
    const picked = await asAdmin().post('/api/v1/companies').send({ name: 'Picked Co', categoryStart: { mode: 'suggestions', names: ['Utilities'], withSubcategories: true } });
    const pickedCats = (await asAdmin().get('/api/v1/categories').query({ companyId: picked.body.id })).body.map((c: { name: string }) => c.name);
    expect(pickedCats.sort()).toEqual(['Electricity', 'Utilities', 'Water']);
    const copy = await asAdmin().post('/api/v1/companies').send({ name: 'Copy Co', categoryStart: { mode: 'copy', fromCompanyId: picked.body.id } });
    const copyCats = (await asAdmin().get('/api/v1/categories').query({ companyId: copy.body.id })).body.map((c: { name: string }) => c.name);
    expect(copyCats.sort()).toEqual(['Electricity', 'Utilities', 'Water']);
    for (const c of [empty, picked, copy]) await asAdmin().delete(`/api/v1/companies/${c.body.id}`);
  });

  it('custom fields: at most 10, typed values checked on bills', async () => {
    const cats = (await asAdmin().get('/api/v1/categories').query({ companyId })).body as { id: string; name: string }[];
    const insurance = cats.find((c) => c.name === 'Insurance')!;
    const meter = await asAdmin().post('/api/v1/custom-fields').query({ companyId }).send({ name: 'Meter no.', type: 'TEXT' });
    expect(meter.status).toBe(201);
    const kind = await asAdmin().post('/api/v1/custom-fields').query({ companyId }).send({ name: 'Plan', type: 'DROPDOWN', options: ['Basic', 'Pro'], required: true, categoryIds: [insurance.id] });
    expect(kind.status).toBe(201);
    expect((await asAdmin().post('/api/v1/custom-fields').query({ companyId }).send({ name: 'Bad', type: 'DROPDOWN', options: ['Only'] })).status).toBe(400);

    const base = { name: 'Cover', companyId, categoryId: insurance.id, amountCents: 9_000, frequencyUnit: 'YEAR' };
    expect((await asAdmin().post('/api/v1/bills').send(base)).status).toBe(400); // "Plan" is required here
    expect((await asAdmin().post('/api/v1/bills').send({ ...base, customValues: { [kind.body.id]: 'Gold' } })).status).toBe(400);
    const ok = await asAdmin().post('/api/v1/bills').send({ ...base, customValues: { [kind.body.id]: 'Pro', [meter.body.id]: ' M-42 ', junk: 'x' } });
    expect(ok.status).toBe(201);
    const detail = await asAdmin().get(`/api/v1/bills/${ok.body.id}`);
    expect(detail.body.customValues).toEqual({ [kind.body.id]: 'Pro', [meter.body.id]: 'M-42' });

    for (let i = 0; i < 8; i++) await asAdmin().post('/api/v1/custom-fields').query({ companyId }).send({ name: `F${i}`, type: 'NUMBER' });
    expect((await asAdmin().post('/api/v1/custom-fields').query({ companyId }).send({ name: 'Eleventh', type: 'TEXT' })).status).toBe(409);
    expect((await asAdmin().get('/api/v1/custom-fields').query({ companyId })).body).toHaveLength(10);
  });
});

describe('invites and members', () => {
  it('invites by email; the invitee previews and accepts', async () => {
    const inv = await asAdmin().post('/api/v1/workspaces/current/invites').send({ email: 'Felix@Acme.test', role: 'FINANCE' });
    expect(inv.status).toBe(201);
    const mail = ctx.mailer.lastTo('felix@acme.test');
    expect(mail?.subject).toBe('Amina Admin invited you to Acme Rwanda Ltd on DueOra');
    expect(mail?.text).toContain('dueora://invite?token=');

    const token = lastInviteToken(ctx, 'felix@acme.test');
    const preview = await request(app).get('/api/v1/public/invites/preview').query({ token });
    expect(preview.body).toMatchObject({ workspace: { name: 'Acme Rwanda Ltd' }, role: 'FINANCE', invitedBy: 'Amina Admin' });
    expect((await asAdmin().get('/api/v1/workspaces/current/invites')).body).toHaveLength(1);

    const felix = await register(app, 'Felix Finance', 'felix@acme.test');
    expect((await client(app, felix).post('/api/v1/workspaces/accept-invite').send({ token })).status).toBe(200);
    const me = await client(app, felix).get('/api/v1/me');
    expect(me.body.workspaces).toEqual([expect.objectContaining({ id: workspaceId, role: 'FINANCE' })]);
    expect(me.body.emailVerified).toBe(true);
    expect((await client(app, felix).post('/api/v1/workspaces/accept-invite').send({ token })).status).toBe(410);
  });

  it('defaults invites to VIEWER and only accepts the three roles', async () => {
    const inv = await asAdmin().post('/api/v1/workspaces/current/invites').send({ email: 'viewer@acme.test' });
    expect(inv.body.role).toBe('VIEWER');
    for (const role of ['DEPARTMENT', 'EMPLOYEE', 'OWNER']) {
      expect((await asAdmin().post('/api/v1/workspaces/current/invites').send({ email: 'x@acme.test', role })).status).toBe(400);
    }
  });

  it('refuses an invite accepted by a different email', async () => {
    await asAdmin().post('/api/v1/workspaces/current/invites').send({ email: 'erin@acme.test', role: 'VIEWER' });
    const token = lastInviteToken(ctx, 'erin@acme.test');
    const mallory = await register(app, 'Mallory', 'mallory@evil.test');
    expect((await client(app, mallory).post('/api/v1/workspaces/accept-invite').send({ token })).status).toBe(403);
  });

  it('expires invites after 7 days and lets admins revoke them', async () => {
    const inv = await asAdmin().post('/api/v1/workspaces/current/invites').send({ email: 'late@acme.test', role: 'VIEWER' });
    const token = lastInviteToken(ctx, 'late@acme.test');
    ctx.clock.advance(8 * 86_400_000);
    expect((await request(app).get('/api/v1/public/invites/preview').query({ token })).status).toBe(410);
    admin = await login(app, 'amina@acme.test', 'correct-horse-9'); // the access token expired with the jump

    const inv2 = await asAdmin().post('/api/v1/workspaces/current/invites').send({ email: 'late@acme.test', role: 'VIEWER' });
    expect((await asAdmin().delete(`/api/v1/workspaces/current/invites/${inv2.body.id}`)).status).toBe(204);
    expect((await asAdmin().delete(`/api/v1/workspaces/current/invites/${inv.body.id}`)).status).toBe(404);
  });

  it('lists members without ownership details, changes roles and protects the last admin', async () => {
    const members = await asAdmin().get('/api/v1/workspaces/current/members');
    const me = members.body.find((m: { email: string }) => m.email === 'amina@acme.test');
    const felix = members.body.find((m: { email: string }) => m.email === 'felix@acme.test');
    expect(Object.keys(me).sort()).toEqual(['allCompanies', 'companies', 'email', 'id', 'joinedAt', 'name', 'role', 'userId']);

    const demoteSelf = await asAdmin().patch(`/api/v1/workspaces/current/members/${me.id}`).send({ role: 'FINANCE' });
    expect(demoteSelf.status).toBe(409);
    expect(demoteSelf.body.error.code).toBe('LAST_ADMIN');
    expect((await asAdmin().patch(`/api/v1/workspaces/current/members/${felix.id}`).send({ role: 'VIEWER' })).body.role).toBe('VIEWER');
    expect((await asAdmin().patch(`/api/v1/workspaces/current/members/${felix.id}`).send({ role: 'FINANCE' })).body.role).toBe('FINANCE');
    expect((await asAdmin().delete(`/api/v1/workspaces/current/members/${me.id}`)).status).toBe(409);
  });

  it('removes members and records it in the audit log', async () => {
    const temp = await addMember(app, ctx, admin, workspaceId, 'Temp Person', 'temp@acme.test', 'VIEWER');
    const members = await asAdmin().get('/api/v1/workspaces/current/members');
    const row = members.body.find((m: { email: string }) => m.email === 'temp@acme.test');
    expect((await asAdmin().delete(`/api/v1/workspaces/current/members/${row.id}`)).status).toBe(204);
    expect((await client(app, temp, workspaceId).get('/api/v1/workspaces/current')).status).toBe(404);
    expect(await ctx.db.auditLog.findFirst({ where: { workspaceId, action: 'member.remove' } })).not.toBeNull();
  });
});

describe('role permissions on workspace routes', () => {
  let finance: Session;
  let viewer: Session;

  beforeAll(async () => {
    finance = await addMember(app, ctx, admin, workspaceId, 'Fiona Finance', 'fiona@acme.test', 'FINANCE');
    viewer = await addMember(app, ctx, admin, workspaceId, 'Vic Viewer', 'vic@acme.test', 'VIEWER');
  });

  it.each([
    ['patch', '/api/v1/workspaces/current', { name: 'Hacked' }],
    ['post', '/api/v1/workspaces/current/invites', { email: 'x@acme.test', role: 'ADMIN' }],
    ['get', '/api/v1/workspaces/current/invites', undefined],
  ] as const)('finance and viewers cannot %s %s', async (method, url, body) => {
    for (const s of [finance, viewer]) {
      expect((await client(app, s, workspaceId)[method](url).send(body as object)).status).toBe(403);
    }
  });

  it('only admins manage companies; finance manages categories; viewers are read-only', async () => {
    expect((await client(app, finance, workspaceId).post('/api/v1/companies').send({ name: 'Finance Co' })).status).toBe(403);
    const companyId = (await asAdmin().get('/api/v1/companies')).body[0].id;
    expect((await client(app, finance, workspaceId).post('/api/v1/categories').send({ companyId, name: 'F', icon: 'tag', color: '#000000' })).status).toBe(201);
    expect((await client(app, viewer, workspaceId).post('/api/v1/companies').send({ name: 'Viewer Co' })).status).toBe(403);
    expect((await client(app, viewer, workspaceId).post('/api/v1/categories').send({ companyId, name: 'V', icon: 'tag', color: '#000000' })).status).toBe(
      403,
    );
    expect((await client(app, viewer, workspaceId).get('/api/v1/companies')).status).toBe(200);
  });

  it('members can leave on their own but not remove others', async () => {
    const members = await asAdmin().get('/api/v1/workspaces/current/members');
    const vic = members.body.find((m: { email: string }) => m.email === 'vic@acme.test');
    const fiona = members.body.find((m: { email: string }) => m.email === 'fiona@acme.test');
    expect((await client(app, viewer, workspaceId).delete(`/api/v1/workspaces/current/members/${fiona.id}`)).status).toBe(403);
    expect((await client(app, viewer, workspaceId).delete(`/api/v1/workspaces/current/members/${vic.id}`)).status).toBe(204);
  });
});

describe('deleting a workspace', () => {
  it('requires typing the name', async () => {
    const s = await register(app, 'Owner', 'owner@temp.test');
    const id = await createWorkspace(app, s, 'Temp Co');
    expect((await client(app, s, id).delete('/api/v1/workspaces/current').send({ confirmName: 'temp co' })).status).toBe(400);
    expect((await client(app, s, id).delete('/api/v1/workspaces/current').send({ confirmName: 'Temp Co' })).status).toBe(204);
    expect(await ctx.db.workspace.findUnique({ where: { id } })).toBeNull();
  });
});
