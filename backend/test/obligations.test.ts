import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

import { client, createWorkspace, login, register } from './helpers/api.js';
import { createTestContext } from './helpers/context.js';
import { DEMO_PASSWORD, seedAndLogin, type SeededWorkspace } from './helpers/seed.js';

const ctx = createTestContext();
const app = createApp(ctx);
let ws: SeededWorkspace;
let hostingCategoryId: string;

const as = (who: keyof SeededWorkspace['sessions']) => client(app, ws.sessions[who], ws.organizationId);

beforeAll(async () => {
  ctx.clock.set('2026-11-02T07:00:00Z'); // 09:00 in Kigali
  ws = await seedAndLogin(app, ctx);
  const cats = await as('anitha').get('/api/v1/categories');
  hostingCategoryId = cats.body.find((c: { name: string }) => c.name === 'Hosting & domains').id;
});

afterAll(async () => {
  await ctx.db.$disconnect();
});

type Row = { name: string; provider: string; paymentStatus: string; platform: { name: string } | null; id: string };
const byKey = (rows: Row[], key: string) => rows.find((r) => r.id === ws.obligationIds[key]);

describe('listing obligations', () => {
  it('computes each status for "today" in Kigali', async () => {
    const res = await as('anitha').get('/api/v1/obligations');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(12);
    const rows: Row[] = res.body.items;
    expect(byKey(rows, 'kt-hosting')?.paymentStatus).toBe('OVERDUE');
    expect(byKey(rows, 'kt-cloudflare')?.paymentStatus).toBe('OVERDUE');
    expect(byKey(rows, 'internet')?.paymentStatus).toBe('DUE_SOON'); // 5 Nov
    expect(byKey(rows, 'cleaning')?.paymentStatus).toBe('DUE_SOON'); // 6 Nov
    expect(byKey(rows, 'workspace')?.paymentStatus).toBe('PARTIALLY_PAID');
    expect(byKey(rows, 'ktr-hosting')?.paymentStatus).toBe('UPCOMING');
    // Sorted by next due date.
    expect(rows[0]!.id).toBe(ws.obligationIds['kt-cloudflare']);
  });

  it('reports amounts, partial payments and schedule metadata', async () => {
    const res = await as('anitha').get('/api/v1/obligations').query({ q: 'google' });
    expect(res.body.items[0]).toMatchObject({
      name: 'Google Workspace',
      amountMinor: 43200,
      paidMinor: 20000,
      remainingMinor: 23200,
      frequencyLabel: 'Quarterly',
      daysUntilDue: 43,
      icon: 'cpu',
    });
  });

  it('filters by status, search, platform and assignment', async () => {
    const overdue = await as('anitha').get('/api/v1/obligations').query({ status: 'overdue' });
    expect(overdue.body.items.map((r: Row) => r.provider).sort()).toEqual(['AWS', 'Cloudflare Pro']);

    const soon = await as('anitha').get('/api/v1/obligations').query({ status: 'DUE_SOON,OVERDUE' });
    expect(soon.body.total).toBe(4);

    const search = await as('anitha').get('/api/v1/obligations').query({ q: 'kt radio' });
    expect(search.body.items.every((r: Row) => r.platform?.name === 'KT Radio')).toBe(true);
    expect(search.body.total).toBe(3);

    const platformId = search.body.items[0].platform.id;
    const byPlatform = await as('anitha').get('/api/v1/obligations').query({ platformId });
    expect(byPlatform.body.total).toBe(3);

    const mine = await as('anitha').get('/api/v1/obligations').query({ assignedToMe: 'true' });
    expect(mine.body.items.map((r: Row) => r.name).sort()).toEqual(
      ['Cloudflare', 'Google Workspace', 'Website redesign (final instalment)', 'X subscription'].sort(),
    );
  });

  it('paginates', async () => {
    const p1 = await as('anitha').get('/api/v1/obligations').query({ pageSize: 5, page: 1 });
    const p3 = await as('anitha').get('/api/v1/obligations').query({ pageSize: 5, page: 3 });
    expect(p1.body.items).toHaveLength(5);
    expect(p3.body.items).toHaveLength(2);
    expect(p3.body.total).toBe(12);
  });

  it('employees only see what is assigned to them', async () => {
    const res = await as('eric').get('/api/v1/obligations');
    expect(res.body.items.map((r: Row) => r.name)).toEqual(['Cleaning service']);
    const hidden = await as('eric').get(`/api/v1/obligations/${ws.obligationIds['kt-hosting']}`);
    expect(hidden.status).toBe(404);
  });

  it('department officers can view everything', async () => {
    expect((await as('nadine').get('/api/v1/obligations')).body.total).toBe(12);
  });
});

describe('today follows the organization timezone', () => {
  it('flips to DUE_TODAY at local midnight', async () => {
    // 22:30 UTC on 4 Nov = 00:30 on 5 Nov in Kigali → internet is due today.
    ctx.clock.set('2026-11-04T22:30:00Z');
    try {
      const anitha = client(app, await login(app, 'anitha@kigalitoday.com', DEMO_PASSWORD), ws.organizationId);
      const res = await anitha.get(`/api/v1/obligations/${ws.obligationIds.internet}`);
      expect(res.body.paymentStatus).toBe('DUE_TODAY');
      expect(res.body.daysUntilDue).toBe(0);

      // The same instant for a workspace in UTC is still 4 Nov.
      await anitha.patch('/api/v1/workspaces/current').send({ timezone: 'UTC' });
      const utc = await anitha.get(`/api/v1/obligations/${ws.obligationIds.internet}`);
      expect(utc.body.paymentStatus).toBe('DUE_SOON');
      expect(utc.body.daysUntilDue).toBe(1);
      await anitha.patch('/api/v1/workspaces/current').send({ timezone: 'Africa/Kigali' });
    } finally {
      ctx.clock.set('2026-11-02T07:00:00Z');
    }
  });
});

describe('obligation detail', () => {
  it('includes the reminder plan, history and cycle length', async () => {
    const res = await as('anitha').get(`/api/v1/obligations/${ws.obligationIds['ktr-hosting']}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Hosting', provider: 'DigitalOcean', cycleLengthDays: 365, frequencyLabel: 'Yearly' });
    expect(res.body.reminders.map((r: { offsetDays: number }) => r.offsetDays)).toEqual([30, 14, 7, 3, 1, 0, -1, -3, -7]);
    expect(res.body.reminders[0]).toEqual({ offsetDays: 30, date: '2027-09-02', sent: false });
    expect(res.body.history.map((h: { cycleDueDate: string }) => h.cycleDueDate)).toEqual(['2026-10-02', '2025-10-02']);
  });

  it('adds weekly follow-ups for long-overdue items', async () => {
    const res = await as('anitha').get(`/api/v1/obligations/${ws.obligationIds['kt-cloudflare']}`);
    const offsets = res.body.reminders.map((r: { offsetDays: number }) => r.offsetDays);
    expect(offsets.slice(0, 9)).toEqual([30, 14, 7, 3, 1, 0, -1, -3, -7]);
    expect(offsets.at(-1)).toBeLessThanOrEqual(-273); // weekly until today (2 Nov)
  });
});

describe('creating and editing', () => {
  const base = () => ({
    name: 'Mailchimp',
    provider: 'Intuit',
    amountMinor: 2900,
    currency: 'usd',
    frequencyUnit: 'MONTH',
    frequencyInterval: 1,
    startDate: '2026-11-10',
    categoryId: hostingCategoryId,
  });

  it('finance can create; defaults come from the workspace', async () => {
    const res = await as('isaac').post('/api/v1/obligations').send(base());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      currency: 'USD',
      nextDueDate: '2026-11-10',
      anchorDay: 10,
      reminderOffsets: [30, 14, 7, 3, 1, 0, -1, -3, -7],
      paymentStatus: 'UPCOMING',
      status: 'ACTIVE',
    });
    const log = await ctx.db.auditLog.findFirst({ where: { action: 'obligation.create', entityId: res.body.id } });
    expect(log?.userId).toBe(ws.userIds.isaac);
  });

  it('keeps month-end anchors and custom reminder offsets', async () => {
    const res = await as('anitha')
      .post('/api/v1/obligations')
      .send({ ...base(), name: 'Payroll tool', startDate: '2027-01-31', anchorDay: 31, reminderOffsets: [1, 7, 0, 7, -2] });
    expect(res.body).toMatchObject({ anchorDay: 31, reminderOffsets: [7, 1, 0, -2] });
  });

  it('one-time items ignore the interval', async () => {
    const res = await as('anitha').post('/api/v1/obligations').send({ ...base(), name: 'Audit fee', frequencyUnit: 'ONCE', frequencyInterval: 4 });
    expect(res.body).toMatchObject({ frequencyInterval: 1, frequencyLabel: 'One-time' });
  });

  it.each([
    ['float money', { amountMinor: 29.5 }],
    ['zero amount', { amountMinor: 0 }],
    ['bad currency', { currency: 'DOLLARS' }],
    ['impossible date', { startDate: '2027-02-30' }],
    ['due before start', { nextDueDate: '2026-11-01' }],
    ['interval 0', { frequencyInterval: 0 }],
    ['missing name', { name: '' }],
  ])('rejects %s', async (_label, patch) => {
    const res = await as('anitha').post('/api/v1/obligations').send({ ...base(), ...patch });
    expect(res.status).toBe(400);
  });

  it("rejects references from another workspace", async () => {
    const outsider = await register(app, 'Out Sider', 'outsider@else.test');
    const otherOrg = await createWorkspace(app, outsider, 'Elsewhere');
    const plat = await client(app, outsider, otherOrg).post('/api/v1/platforms').send({ name: 'Theirs' });
    const cat = await client(app, outsider, otherOrg).post('/api/v1/categories').send({ name: 'Secret', icon: 'tag', color: '#123456' });
    expect((await as('anitha').post('/api/v1/obligations').send({ ...base(), platformId: plat.body.id })).status).toBe(400);
    expect((await as('anitha').post('/api/v1/obligations').send({ ...base(), categoryId: cat.body.id })).status).toBe(400);
    expect((await as('anitha').post('/api/v1/obligations').send({ ...base(), assigneeUserId: outsider.userId })).status).toBe(400);
  });

  it('employees cannot create; department officers create in their own department', async () => {
    expect((await as('eric').post('/api/v1/obligations').send(base())).status).toBe(403);

    const own = await as('nadine').post('/api/v1/obligations').send({ ...base(), name: 'Sentry' });
    expect(own.status).toBe(201);
    expect(own.body.department.name).toBe('Technology');

    const depts = await as('anitha').get('/api/v1/workspaces/current/departments');
    const ops = depts.body.find((d: { name: string }) => d.name === 'Operations').id;
    expect((await as('nadine').post('/api/v1/obligations').send({ ...base(), departmentId: ops })).status).toBe(403);
  });

  it('department officers edit only their department', async () => {
    const tech = await as('nadine').patch(`/api/v1/obligations/${ws.obligationIds['kt-hosting']}`).send({ provider: 'AWS Lightsail' });
    expect(tech.status).toBe(200);
    expect(tech.body.provider).toBe('AWS Lightsail');
    expect((await as('nadine').patch(`/api/v1/obligations/${ws.obligationIds.rent}`).send({ provider: 'X' })).status).toBe(403);
    expect((await as('eric').patch(`/api/v1/obligations/${ws.obligationIds.cleaning}`).send({ provider: 'X' })).status).toBe(403);
  });

  it('re-anchors when the next due date changes', async () => {
    const res = await as('anitha').patch(`/api/v1/obligations/${ws.obligationIds.internet}`).send({ nextDueDate: '2026-11-28' });
    expect(res.body).toMatchObject({ nextDueDate: '2026-11-28', anchorDay: 28 });
    await as('anitha').patch(`/api/v1/obligations/${ws.obligationIds.internet}`).send({ nextDueDate: '2026-11-05' });
  });
});

describe('archive, unarchive and delete', () => {
  it('archived items leave the default list and stop being due', async () => {
    const id = ws.obligationIds.redesign;
    const archived = await as('anitha').post(`/api/v1/obligations/${id}/archive`);
    expect(archived.body).toMatchObject({ status: 'ARCHIVED', paymentStatus: 'ARCHIVED' });

    const list = await as('anitha').get('/api/v1/obligations');
    expect(list.body.items.some((r: Row) => r.id === id)).toBe(false);
    const onlyArchived = await as('anitha').get('/api/v1/obligations').query({ status: 'ARCHIVED' });
    expect(onlyArchived.body.items.map((r: Row) => r.id)).toEqual([id]);

    const restored = await as('anitha').post(`/api/v1/obligations/${id}/unarchive`);
    expect(restored.body.status).toBe('ACTIVE');
    expect((await as('anitha').post(`/api/v1/obligations/${id}/unarchive`)).status).toBe(400);
  });

  it('refuses to delete history; deletes empty items (admin/finance only)', async () => {
    const withHistory = await as('anitha').delete(`/api/v1/obligations/${ws.obligationIds['ktr-hosting']}`);
    expect(withHistory.status).toBe(409);
    expect(withHistory.body.error.code).toBe('HAS_HISTORY');

    const fresh = await as('nadine').post('/api/v1/obligations').send({
      name: 'Temp',
      provider: 'Temp',
      amountMinor: 100,
      currency: 'USD',
      frequencyUnit: 'WEEK',
      startDate: '2026-12-01',
      categoryId: hostingCategoryId,
    });
    expect((await as('nadine').delete(`/api/v1/obligations/${fresh.body.id}`)).status).toBe(403);
    expect((await as('isaac').delete(`/api/v1/obligations/${fresh.body.id}`)).status).toBe(204);
  });
});

describe('platforms and categories', () => {
  it('manages platforms', async () => {
    const created = await as('isaac').post('/api/v1/platforms').send({ name: 'KT Press', color: '#7C3AED' });
    expect(created.status).toBe(201);
    const list = await as('eric').get('/api/v1/platforms');
    expect(list.body.map((p: { name: string }) => p.name)).toEqual(['KT Press', 'KT Radio', 'KigaliToday']);
    expect(list.body.find((p: { name: string }) => p.name === 'KT Radio').obligationCount).toBe(3);
    expect((await as('eric').post('/api/v1/platforms').send({ name: 'Nope' })).status).toBe(403);
    expect((await as('isaac').patch(`/api/v1/platforms/${created.body.id}`).send({ name: 'KT Press Ltd' })).body.name).toBe('KT Press Ltd');
    expect((await as('isaac').delete(`/api/v1/platforms/${created.body.id}`)).status).toBe(204);
  });

  it('lists built-in categories and manages custom ones', async () => {
    const list = await as('eric').get('/api/v1/categories');
    expect(list.body.filter((c: { isDefault: boolean }) => c.isDefault)).toHaveLength(8);

    const custom = await as('nadine').post('/api/v1/categories').send({ name: 'Licences', icon: 'package', color: '#6D36CC' });
    expect(custom.status).toBe(201);
    expect((await as('nadine').post('/api/v1/categories').send({ name: 'Office', icon: 'house', color: '#A35900' })).status).toBe(409);

    const builtIn = list.body.find((c: { name: string }) => c.name === 'Office').id;
    expect((await as('anitha').patch(`/api/v1/categories/${builtIn}`).send({ name: 'Mine' })).status).toBe(404);
    expect((await as('anitha').delete(`/api/v1/categories/${builtIn}`)).status).toBe(404);

    await as('anitha').post('/api/v1/obligations').send({
      name: 'Adobe',
      provider: 'Adobe',
      amountMinor: 5000,
      currency: 'USD',
      frequencyUnit: 'MONTH',
      startDate: '2026-12-01',
      categoryId: custom.body.id,
    });
    expect((await as('anitha').delete(`/api/v1/categories/${custom.body.id}`)).status).toBe(409);
  });
});
