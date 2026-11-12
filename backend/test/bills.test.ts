import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

import { client, createWorkspace, login, register } from './helpers/api.js';
import { createTestContext } from './helpers/context.js';
import { buildFixture, USERS, type Fixture } from './helpers/fixture.js';

const ctx = createTestContext();
const app = createApp(ctx);
let fx: Fixture;

beforeAll(async () => {
  ctx.clock.set('2026-11-02T07:00:00Z'); // 09:00 in Kigali
  fx = await buildFixture(app, ctx);
});

afterAll(async () => {
  await ctx.db.$disconnect();
});

type Row = {
  id: string;
  name: string;
  amountCents: number;
  nextDueDate: string;
  paymentStatus: string;
  company: { id: string; name: string };
  category: { id: string; name: string };
  createdAt: string;
};
const list = (query: Record<string, string | number> = {}) => fx.as('admin').get('/api/v1/bills').query(query);
const ids = (rows: Row[]) => rows.map((r) => r.id);

describe('listing bills', () => {
  it('returns 10 per page, sorted by next due date (overdue first), with total and hasMore', async () => {
    const p1 = await list();
    expect(p1.status).toBe(200);
    expect(p1.body).toMatchObject({ page: 1, limit: 10, total: 12, hasMore: true });
    expect(p1.body.items).toHaveLength(10);
    const dates = (p1.body.items as Row[]).map((r) => r.nextDueDate);
    expect(dates).toEqual([...dates].sort());
    expect(p1.body.items[0].id).toBe(fx.billIds['alpha-cdn']); // due Jan 2026, overdue
    expect(p1.body.items[1].id).toBe(fx.billIds['alpha-hosting']); // due Oct 2026, overdue

    const p2 = await list({ page: 2 });
    expect(p2.body).toMatchObject({ page: 2, total: 12, hasMore: false });
    expect(p2.body.items).toHaveLength(2);
    expect(new Set([...ids(p1.body.items), ...ids(p2.body.items)]).size).toBe(12);
  });

  it('caps the page size at 50', async () => {
    expect((await list({ limit: 51 })).status).toBe(400);
    expect((await list({ limit: 50 })).body.items).toHaveLength(12);
  });

  it('computes each status for "today" in Kigali and reports amounts in USD cents', async () => {
    const rows: Row[] = (await list({ limit: 50 })).body.items;
    const status = (key: keyof Fixture['billIds']) => rows.find((r) => r.id === fx.billIds[key])?.paymentStatus;
    expect(status('alpha-hosting')).toBe('OVERDUE');
    expect(status('internet')).toBe('DUE_SOON');
    expect(status('workspace')).toBe('PARTIALLY_PAID');
    expect(status('beta-hosting')).toBe('UPCOMING');
    const gw = (await list({ q: 'google' })).body.items[0];
    expect(gw).toMatchObject({ amountCents: 43_200, paidCents: 20_000, remainingCents: 23_200, frequencyLabel: 'Quarterly', daysUntilDue: 43 });
    expect(gw).not.toHaveProperty('currency');
    expect(gw).not.toHaveProperty('assignee');
    expect(gw).not.toHaveProperty('department');
  });

  it('sorts by due date (latest), amount, name and recently added', async () => {
    const latest: Row[] = (await list({ sort: 'due_desc', limit: 50 })).body.items;
    expect(latest.map((r) => r.nextDueDate)).toEqual(latest.map((r) => r.nextDueDate).sort().reverse());

    const high: Row[] = (await list({ sort: 'amount_desc', limit: 50 })).body.items;
    expect(high[0]!.amountCents).toBe(152_300);
    expect(high.map((r) => r.amountCents)).toEqual([...high.map((r) => r.amountCents)].sort((a, b) => b - a));
    const low: Row[] = (await list({ sort: 'amount_asc', limit: 50 })).body.items;
    expect(low[0]!.amountCents).toBe(800);

    const names: Row[] = (await list({ sort: 'name_asc', limit: 50 })).body.items;
    expect(names.map((r) => r.name)).toEqual([...names.map((r) => r.name)].sort((a, b) => a.localeCompare(b)));

    const recent: Row[] = (await list({ sort: 'recent', limit: 50 })).body.items;
    expect(recent[0]!.id).toBe(fx.billIds['beta-domain']); // created last

    expect((await list({ sort: 'cheapest' })).status).toBe(400);
  });

  it('filters by status, company, category, frequency and due-date range', async () => {
    const overdue: Row[] = (await list({ status: 'overdue' })).body.items;
    expect(ids(overdue).sort()).toEqual([fx.billIds['alpha-cdn'], fx.billIds['alpha-hosting']].sort());
    expect((await list({ status: 'DUE_SOON,OVERDUE' })).body.total).toBe(4);

    const beta: Row[] = (await list({ companyId: fx.companies.beta })).body.items;
    expect(beta.every((r) => r.company.name === 'Beta Radio')).toBe(true);
    expect(beta).toHaveLength(3);
    expect((await list({ companyId: `${fx.companies.alpha},${fx.companies.beta}` })).body.total).toBe(12);

    // Categories belong to a company: Alpha's "Hosting & domains" has 3 bills, Beta's has 2.
    expect((await list({ categoryId: fx.categories['Hosting & domains']! })).body.total).toBe(3);
    const hosting = (await list({ categoryId: `${fx.categories['Hosting & domains']},${fx.categoriesOf.beta['Hosting & domains']}` })).body;
    expect(hosting.total).toBe(5);

    expect((await list({ frequency: 'WEEK' })).body.items.map((r: Row) => r.name)).toEqual(['Cleaning']);
    expect((await list({ frequency: 'YEAR,ONCE' })).body.total).toBe(7);

    const nov: Row[] = (await list({ dueFrom: '2026-11-01', dueTo: '2026-11-30' })).body.items;
    expect(nov.map((r) => r.nextDueDate)).toEqual(['2026-11-05', '2026-11-06', '2026-11-20', '2026-11-30']);

    // Filters combine.
    const combined = await list({ companyId: fx.companies.beta, categoryId: fx.categoriesOf.beta['Hosting & domains']!, sort: 'amount_desc' });
    expect(combined.body.items.map((r: Row) => r.name)).toEqual(['Hosting', 'Domain renewal']);
  });

  it('searches name, provider, company and category (case-insensitive)', async () => {
    expect((await list({ q: 'BETA radio' })).body.total).toBe(3);
    expect((await list({ q: 'social' })).body.items.map((r: Row) => r.name)).toEqual(['X bill']);
    expect((await list({ q: 'nothing-like-this' })).body).toMatchObject({ total: 0, items: [], hasMore: false });
  });

  it('viewers can list and read', async () => {
    expect((await fx.as('viewer').get('/api/v1/bills')).body.total).toBe(12);
    expect((await fx.as('viewer').get(`/api/v1/bills/${fx.billIds.rent}`)).status).toBe(200);
  });
});

describe('today follows the workspace timezone', () => {
  it('flips to DUE_TODAY at local midnight', async () => {
    // 22:30 UTC on 4 Nov = 00:30 on 5 Nov in Kigali → internet is due today.
    ctx.clock.set('2026-11-04T22:30:00Z');
    try {
      const admin = client(app, await login(app, USERS.admin.email, 'correct-horse-9'), fx.workspaceId);
      const res = await admin.get(`/api/v1/bills/${fx.billIds.internet}`);
      expect(res.body).toMatchObject({ paymentStatus: 'DUE_TODAY', daysUntilDue: 0 });
      await admin.patch('/api/v1/workspaces/current').send({ timezone: 'UTC' });
      const utc = await admin.get(`/api/v1/bills/${fx.billIds.internet}`);
      expect(utc.body).toMatchObject({ paymentStatus: 'DUE_SOON', daysUntilDue: 1 });
      await admin.patch('/api/v1/workspaces/current').send({ timezone: 'Africa/Kigali' });
    } finally {
      ctx.clock.set('2026-11-02T07:00:00Z');
    }
  });
});

describe('bill detail', () => {
  it('includes the reminder plan, history and cycle length', async () => {
    const res = await fx.as('admin').get(`/api/v1/bills/${fx.billIds['beta-hosting']}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Hosting', cycleLengthDays: 365, frequencyLabel: 'Yearly', muted: false, historyTotal: 0 });
    expect(res.body.reminders.map((r: { offsetDays: number }) => r.offsetDays)).toEqual([30, 14, 7, 3, 1, 0, -1, -3, -7]);
    expect(res.body.reminders[0]).toEqual({ offsetDays: 30, date: '2027-09-02', sent: false });
  });

  it('adds weekly follow-ups for long-overdue bills', async () => {
    const res = await fx.as('admin').get(`/api/v1/bills/${fx.billIds['alpha-cdn']}`);
    const offsets = res.body.reminders.map((r: { offsetDays: number }) => r.offsetDays);
    expect(offsets.slice(0, 9)).toEqual([30, 14, 7, 3, 1, 0, -1, -3, -7]);
    expect(offsets.at(-1)).toBeLessThanOrEqual(-273);
  });

  it('returns history for partially paid cycles', async () => {
    const res = await fx.as('viewer').get(`/api/v1/bills/${fx.billIds.workspace}`);
    expect(res.body.history).toEqual([expect.objectContaining({ amountCents: 20_000, cycleDueDate: '2026-12-15', method: 'BANK_TRANSFER' })]);
    expect(res.body.history[0]).not.toHaveProperty('recordedBy');
  });
});

describe('creating and editing', () => {
  const base = () => ({
    name: 'Mailchimp',
    companyId: fx.companies.alpha,
    categoryId: fx.categories['Marketing']!,
    amountCents: 2900,
    frequencyUnit: 'MONTH',
  });

  it('defaults the start date to today and calculates the next due date', async () => {
    const res = await fx.as('finance').post('/api/v1/bills').send(base());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      startDate: '2026-11-02',
      nextDueDate: '2026-11-02',
      anchorDay: 2,
      provider: null,
      accountReference: null,
      reminderOffsets: [30, 14, 7, 3, 1, 0, -1, -3, -7],
      paymentStatus: 'DUE_TODAY',
      status: 'ACTIVE',
      company: { id: fx.companies.alpha, name: 'Alpha News' },
      category: { name: 'Marketing' },
    });
    const log = await ctx.db.auditLog.findFirst({ where: { action: 'bill.create', entityId: res.body.id } });
    expect(log?.userId).toBe(fx.userIds.finance);
  });

  it('rolls a past start date forward to the first due date on/after today', async () => {
    const monthly = await fx.as('admin').post('/api/v1/bills').send({ ...base(), name: 'Monthly', startDate: '2026-01-15' });
    expect(monthly.body).toMatchObject({ startDate: '2026-01-15', nextDueDate: '2026-11-15', anchorDay: 15 });
    const quarterly = await fx.as('admin').post('/api/v1/bills').send({ ...base(), name: 'Quarterly', frequencyInterval: 3, startDate: '2026-01-31' });
    expect(quarterly.body.nextDueDate).toBe('2027-01-31');
    const yearly = await fx.as('admin').post('/api/v1/bills').send({ ...base(), name: 'Yearly', frequencyUnit: 'YEAR', startDate: '2024-02-29' });
    expect(yearly.body.nextDueDate).toBe('2027-02-28');
    const weekly = await fx.as('admin').post('/api/v1/bills').send({ ...base(), name: 'Weekly', frequencyUnit: 'WEEK', startDate: '2026-10-20' });
    expect(weekly.body.nextDueDate).toBe('2026-11-03');
  });

  it('lets the user override the next due date', async () => {
    const res = await fx.as('admin').post('/api/v1/bills').send({ ...base(), name: 'Override', startDate: '2026-11-02', nextDueDate: '2026-12-01' });
    expect(res.body).toMatchObject({ nextDueDate: '2026-12-01', anchorDay: 1 });
  });

  it('re-derives the due date when the schedule changes before any payment', async () => {
    const created = await fx.as('admin').post('/api/v1/bills').send({ ...base(), name: 'Changes', startDate: '2026-11-10' });
    const yearly = await fx.as('admin').patch(`/api/v1/bills/${created.body.id}`).send({ startDate: '2025-12-01', frequencyUnit: 'YEAR' });
    expect(yearly.body).toMatchObject({ startDate: '2025-12-01', nextDueDate: '2026-12-01', frequencyLabel: 'Yearly' });
  });

  it('keeps month-end anchors and custom reminder offsets', async () => {
    const res = await fx.as('admin')
      .post('/api/v1/bills')
      .send({ ...base(), name: 'Payroll tool', startDate: '2027-01-31', anchorDay: 31, reminderOffsets: [1, 7, 0, 7, -2] });
    expect(res.body).toMatchObject({ anchorDay: 31, reminderOffsets: [7, 1, 0, -2] });
  });

  it('one-time bills ignore the interval', async () => {
    const res = await fx.as('admin').post('/api/v1/bills').send({ ...base(), name: 'Audit fee', frequencyUnit: 'ONCE', frequencyInterval: 4 });
    expect(res.body).toMatchObject({ frequencyInterval: 1, frequencyLabel: 'One-time' });
  });

  it.each([
    ['float money', { amountCents: 29.5 }],
    ['zero amount', { amountCents: 0 }],
    ['negative amount', { amountCents: -100 }],
    ['a currency', { currency: 'RWF' }],
    ['an assignee', { assigneeUserId: 'someone' }],
    ['a project/platform', { platformId: 'x' }],
    ['impossible date', { startDate: '2027-02-30' }],
    ['due before start', { startDate: '2026-11-10', nextDueDate: '2026-11-01' }],
    ['interval 0', { frequencyInterval: 0 }],
    ['missing name', { name: '' }],
    ['missing company', { companyId: undefined }],
    ['missing category', { categoryId: undefined }],
  ])('rejects %s', async (_label, patch) => {
    const res = await fx.as('admin').post('/api/v1/bills').send({ ...base(), ...patch });
    expect(res.status).toBe(400);
  });

  it('rejects companies and categories from another workspace', async () => {
    const outsider = await register(app, 'Out Sider', 'outsider@else.test');
    const other = await createWorkspace(app, outsider, 'Elsewhere');
    const theirCompany = (await client(app, outsider, other).get('/api/v1/companies')).body[0].id;
    const theirCategory = await client(app, outsider, other).post('/api/v1/categories').send({ companyId: theirCompany, name: 'Secret', icon: 'tag', color: '#123456' });
    expect((await fx.as('admin').post('/api/v1/bills').send({ ...base(), companyId: theirCompany })).status).toBe(400);
    expect((await fx.as('admin').post('/api/v1/bills').send({ ...base(), categoryId: theirCategory.body.id })).status).toBe(400);
  });

  it('viewers cannot create, edit, archive or delete', async () => {
    const id = fx.billIds.rent;
    expect((await fx.as('viewer').post('/api/v1/bills').send(base())).status).toBe(403);
    expect((await fx.as('viewer').patch(`/api/v1/bills/${id}`).send({ name: 'X' })).status).toBe(403);
    expect((await fx.as('viewer').post(`/api/v1/bills/${id}/archive`)).status).toBe(403);
    expect((await fx.as('viewer').delete(`/api/v1/bills/${id}`)).status).toBe(403);
  });

  it('re-anchors when the next due date changes', async () => {
    const id = fx.billIds.internet;
    const res = await fx.as('admin').patch(`/api/v1/bills/${id}`).send({ nextDueDate: '2026-11-28' });
    expect(res.body).toMatchObject({ nextDueDate: '2026-11-28', anchorDay: 28 });
    await fx.as('admin').patch(`/api/v1/bills/${id}`).send({ nextDueDate: '2026-11-05' });
  });

  it('moves a bill to another company and category', async () => {
    const id = fx.billIds['beta-x'];
    const res = await fx.as('finance')
      .patch(`/api/v1/bills/${id}`)
      .send({ companyId: fx.companies.alpha, categoryId: fx.categories['Marketing'] });
    expect(res.body).toMatchObject({ company: { name: 'Alpha News' }, category: { name: 'Marketing' } });
    await fx.as('finance').patch(`/api/v1/bills/${id}`).send({ companyId: fx.companies.beta, categoryId: fx.categoriesOf.beta['Social media'] });
  });
});

describe('account references', () => {
  let id: string;
  const KEY = 'LIC-9F3A-22B1-4F7A';

  beforeAll(async () => {
    const res = await fx.as('admin').post('/api/v1/bills').send({
      name: 'Adobe CC',
      companyId: fx.companies.beta,
      categoryId: fx.categoriesOf.beta['Technology & software'],
      amountCents: 5_999,
      frequencyUnit: 'MONTH',
      accountReference: KEY,
    });
    id = res.body.id;
  });

  it('stores the key encrypted and returns only the masked value in lists and details', async () => {
    const row = await ctx.db.bill.findUniqueOrThrow({ where: { id } });
    expect(row.accountRefEncrypted).toMatch(/^v1\./);
    expect(row.accountRefEncrypted).not.toContain('9F3A');
    expect(row.accountRefLast4).toBe('4F7A');
    expect(row.accountRefHash).toMatch(/^[0-9a-f]{64}$/);

    for (const who of ['admin', 'finance', 'viewer'] as const) {
      const detail = await fx.as(who).get(`/api/v1/bills/${id}`);
      expect(detail.body.accountReference).toEqual({ hasKey: true, last4: '4F7A', masked: '••••••4F7A' });
      expect(JSON.stringify(detail.body)).not.toContain(KEY);
      const listed = await fx.as(who).get('/api/v1/bills').query({ limit: 50 });
      expect(JSON.stringify(listed.body)).not.toContain(KEY);
    }
  });

  it('reveals the plain key to ADMIN and FINANCE only, and audits each reveal', async () => {
    for (const who of ['admin', 'finance'] as const) {
      const res = await fx.as(who).get(`/api/v1/bills/${id}/reference`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ value: KEY });
      expect(res.headers['cache-control']).toBe('no-store');
    }
    const viewer = await fx.as('viewer').get(`/api/v1/bills/${id}/reference`);
    expect(viewer.status).toBe(403);
    expect(JSON.stringify(viewer.body)).not.toContain(KEY);
    const reveals = await ctx.db.auditLog.findMany({ where: { action: 'bill.reference.reveal', entityId: id } });
    expect(reveals).toHaveLength(2);
    expect(JSON.stringify(reveals)).not.toContain(KEY);
  });

  it('finds bills by exact key (ignoring case, spaces and dashes), never by partial key', async () => {
    expect((await list({ q: 'lic 9f3a 22b1 4f7a' })).body.items.map((r: Row) => r.id)).toEqual([id]);
    expect((await list({ q: '9F3A-22B1' })).body.total).toBe(0);
  });

  it('replaces and removes keys; the audit log records field names only', async () => {
    const replaced = await fx.as('finance').patch(`/api/v1/bills/${id}`).send({ accountReference: 'ACC-0000-1234' });
    expect(replaced.body.accountReference.last4).toBe('1234');
    expect((await fx.as('admin').get(`/api/v1/bills/${id}/reference`)).body.value).toBe('ACC-0000-1234');
    const removed = await fx.as('finance').patch(`/api/v1/bills/${id}`).send({ accountReference: null });
    expect(removed.body.accountReference).toBeNull();
    expect((await fx.as('admin').get(`/api/v1/bills/${id}/reference`)).status).toBe(404);
    const logs = await ctx.db.auditLog.findMany({ where: { entityId: id } });
    expect(JSON.stringify(logs)).not.toMatch(/ACC-0000-1234|LIC-9F3A/);
  });
});

describe('archive, unarchive and delete', () => {
  it('archived bills leave the default list and stop being due', async () => {
    const id = fx.billIds.redesign;
    const archived = await fx.as('admin').post(`/api/v1/bills/${id}/archive`);
    expect(archived.body).toMatchObject({ status: 'ARCHIVED', paymentStatus: 'ARCHIVED' });
    expect(ids((await list({ limit: 50 })).body.items).includes(id)).toBe(false);
    expect(ids((await list({ status: 'ARCHIVED' })).body.items)).toEqual([id]);
    expect((await fx.as('admin').post(`/api/v1/bills/${id}/unarchive`)).body.status).toBe('ACTIVE');
    expect((await fx.as('admin').post(`/api/v1/bills/${id}/unarchive`)).status).toBe(400);
  });

  it('refuses to delete history; deletes bills without payments', async () => {
    const withHistory = await fx.as('admin').delete(`/api/v1/bills/${fx.billIds.workspace}`);
    expect(withHistory.status).toBe(409);
    expect(withHistory.body.error.code).toBe('HAS_HISTORY');
    const fresh = await fx.as('finance').post('/api/v1/bills').send({
      name: 'Temp',
      companyId: fx.companies.alpha,
      categoryId: fx.categories['Other'],
      amountCents: 100,
      frequencyUnit: 'WEEK',
    });
    expect((await fx.as('finance').delete(`/api/v1/bills/${fresh.body.id}`)).status).toBe(204);
  });

  it('a category in use cannot be deleted', async () => {
    const custom = await fx.as('admin').post('/api/v1/categories').send({ companyId: fx.companies.alpha, name: 'Licences', icon: 'key', color: '#6D36CC' });
    await fx.as('admin')
      .post('/api/v1/bills')
      .send({ name: 'Figma', companyId: fx.companies.alpha, categoryId: custom.body.id, amountCents: 1500, frequencyUnit: 'MONTH' });
    expect((await fx.as('admin').delete(`/api/v1/categories/${custom.body.id}`)).status).toBe(409);
  });
});
