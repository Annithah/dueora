import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

import { client, createWorkspace, register } from './helpers/api.js';
import { createTestContext } from './helpers/context.js';
import { buildFixture, type Fixture } from './helpers/fixture.js';

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

const pay = (who: 'admin' | 'finance' | 'viewer', key: keyof Fixture['billIds'], body: object) =>
  fx.as(who).post(`/api/v1/bills/${fx.billIds[key]}/payments`).send(body);

describe('recording payments', () => {
  it('a full payment closes the cycle and moves the next due date forward one year', async () => {
    const res = await pay('admin', 'alpha-hosting', { method: 'BANK_TRANSFER', reference: 'TXN-482913', paidOn: '2026-11-01' });
    expect(res.status).toBe(201);
    expect(res.body.payment).toMatchObject({
      amountCents: 152_300, // defaults to the remaining amount
      cycleDueDate: '2026-10-20',
      paidOn: '2026-11-01',
      method: 'BANK_TRANSFER',
      reference: 'TXN-482913',
      bill: { name: 'Hosting', company: { name: 'Alpha News' } },
    });
    expect(res.body.payment).not.toHaveProperty('currency');
    expect(res.body.payment).not.toHaveProperty('recordedBy');
    expect(res.body.cycleCompleted).toBe(true);
    expect(res.body.bill).toMatchObject({ nextDueDate: '2027-10-20', paymentStatus: 'UPCOMING', paidCents: 0 });
  });

  it('keeps history when the new cycle begins', async () => {
    const detail = await fx.as('viewer').get(`/api/v1/bills/${fx.billIds['alpha-hosting']}`);
    expect(detail.body.history.map((h: { cycleDueDate: string }) => h.cycleDueDate)).toEqual(['2026-10-20']);
    expect(detail.body.historyTotal).toBe(1);
  });

  it('partial payments keep the cycle open; date paid defaults to today', async () => {
    const first = await pay('finance', 'alpha-cdn', { amountCents: 12_000, method: 'CARD' });
    expect(first.body.cycleCompleted).toBe(false);
    expect(first.body.payment.paidOn).toBe('2026-11-02');
    expect(first.body.bill).toMatchObject({ nextDueDate: '2026-01-30', paidCents: 12_000, remainingCents: 12_000, paymentStatus: 'OVERDUE' });
    const second = await pay('finance', 'alpha-cdn', { method: 'CARD' });
    expect(second.body.payment.amountCents).toBe(12_000); // the rest
    expect(second.body.cycleCompleted).toBe(true);
    expect(second.body.bill.nextDueDate).toBe('2027-01-30');
  });

  it('a partial payment on an upcoming cycle shows PARTIALLY_PAID', async () => {
    const res = await pay('admin', 'beta-x', { amountCents: 300, method: 'MOBILE_MONEY' });
    expect(res.body.bill).toMatchObject({ paymentStatus: 'PARTIALLY_PAID', remainingCents: 500 });
  });

  it('month-end anchors advance correctly (31 → Dec 31 → Jan 31 → Feb 28)', async () => {
    expect((await pay('finance', 'rent', { method: 'BANK_TRANSFER' })).body.bill.nextDueDate).toBe('2026-12-31');
    expect((await pay('finance', 'rent', { method: 'BANK_TRANSFER' })).body.bill.nextDueDate).toBe('2027-01-31');
    expect((await pay('finance', 'rent', { method: 'BANK_TRANSFER' })).body.bill.nextDueDate).toBe('2027-02-28');
  });

  it('one-time bills become COMPLETED', async () => {
    const res = await pay('admin', 'redesign', { method: 'BANK_TRANSFER' });
    expect(res.body.bill).toMatchObject({ status: 'COMPLETED', paymentStatus: 'PAID', nextDueDate: '2027-01-20' });
    expect((await pay('admin', 'redesign', { method: 'CARD' })).status).toBe(409);
  });

  it('validates the payment', async () => {
    expect((await pay('admin', 'internet', { method: 'CHEQUE' })).status).toBe(400);
    expect((await pay('admin', 'internet', { method: 'CASH', amountCents: 10.5 })).status).toBe(400);
    expect((await pay('admin', 'internet', { method: 'CASH', currency: 'USD' })).status).toBe(400); // no currency field
    expect((await pay('admin', 'internet', { method: 'CASH', paidOn: '2026-11-03' })).status).toBe(400); // future
  });

  it('two simultaneous full payments advance the schedule only once per paid cycle', async () => {
    const id = fx.billIds.cleaning; // weekly $40 due 2026-11-06
    const [a, b] = await Promise.all([
      fx.as('finance').post(`/api/v1/bills/${id}/payments`).send({ method: 'CASH', amountCents: 4_000 }),
      fx.as('finance').post(`/api/v1/bills/${id}/payments`).send({ method: 'CASH', amountCents: 4_000 }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const s = await ctx.db.bill.findUniqueOrThrow({ where: { id } });
    const rows = await ctx.db.paymentRecord.findMany({ where: { billId: id } });
    const cyclesPaid = new Set(rows.map((p) => p.cycleDueDate)).size;
    expect(s.nextDueDate).toBe(cyclesPaid === 2 ? '2026-11-20' : '2026-11-13');
  });

  it('archived bills cannot take payments', async () => {
    const id = fx.billIds.insurance;
    await fx.as('admin').post(`/api/v1/bills/${id}/archive`);
    expect((await pay('admin', 'insurance', { method: 'CARD' })).status).toBe(400);
    await fx.as('admin').post(`/api/v1/bills/${id}/unarchive`);
  });

  it('viewers cannot record payments', async () => {
    expect((await pay('viewer', 'internet', { method: 'CASH' })).status).toBe(403);
  });
});

describe('editing and deleting payments', () => {
  it('only admins and finance may edit or delete', async () => {
    const hist = await fx.as('viewer').get('/api/v1/payments').query({ billId: fx.billIds['alpha-hosting'] });
    const pid = hist.body.items[0].id;
    expect((await fx.as('viewer').patch(`/api/v1/payments/${pid}`).send({ reference: 'X' })).status).toBe(403);
    expect((await fx.as('viewer').delete(`/api/v1/payments/${pid}`)).status).toBe(403);
  });

  it('lowering a payment reopens the cycle it closed, and logs the change', async () => {
    const id = fx.billIds['beta-domain']; // $13 due 2027-02-26
    await pay('finance', 'beta-domain', { method: 'MOBILE_MONEY' });
    expect((await ctx.db.bill.findUniqueOrThrow({ where: { id } })).nextDueDate).toBe('2028-02-26');
    const p = await ctx.db.paymentRecord.findFirstOrThrow({ where: { billId: id, cycleDueDate: '2027-02-26' } });

    const edited = await fx.as('finance').patch(`/api/v1/payments/${p.id}`).send({ amountCents: 1_000, reference: 'MOMO-1' });
    expect(edited.status).toBe(200);
    expect(edited.body.cycleReopened).toBe(true);
    expect(edited.body.bill).toMatchObject({ nextDueDate: '2027-02-26', paidCents: 1_000, remainingCents: 300, paymentStatus: 'PARTIALLY_PAID' });
    const log = await ctx.db.auditLog.findFirstOrThrow({ where: { action: 'payment.update', entityId: p.id } });
    expect(log.meta).toMatchObject({ before: { amountCents: 1_300 }, after: { amountCents: 1_000, reference: 'MOMO-1' } });

    const fixed = await fx.as('finance').patch(`/api/v1/payments/${p.id}`).send({ amountCents: 1_300 });
    expect(fixed.body.cycleCompleted).toBe(true);
    expect(fixed.body.bill.nextDueDate).toBe('2028-02-26');
  });

  it('deleting the payment that closed a cycle reopens it', async () => {
    const id = fx.billIds['alpha-hosting'];
    const p = await ctx.db.paymentRecord.findFirstOrThrow({ where: { billId: id, cycleDueDate: '2026-10-20' } });
    const res = await fx.as('admin').delete(`/api/v1/payments/${p.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cycleReopened: true, bill: { nextDueDate: '2026-10-20', paymentStatus: 'OVERDUE' } });
    expect(await ctx.db.auditLog.count({ where: { action: 'payment.delete', entityId: p.id } })).toBe(1);
  });

  it('deleting a payment from an older, non-adjacent cycle never rewinds the schedule', async () => {
    const id = fx.billIds.rent; // paid three cycles above → open 2027-02-28
    const oldest = await ctx.db.paymentRecord.findFirstOrThrow({ where: { billId: id, cycleDueDate: '2026-11-30' } });
    const res = await fx.as('admin').delete(`/api/v1/payments/${oldest.id}`);
    expect(res.body.cycleReopened).toBe(false);
    expect((await ctx.db.bill.findUniqueOrThrow({ where: { id } })).nextDueDate).toBe('2027-02-28');
  });

  it('un-completes a one-time bill when its payment is removed', async () => {
    const p = await ctx.db.paymentRecord.findFirstOrThrow({ where: { billId: fx.billIds.redesign } });
    const res = await fx.as('admin').delete(`/api/v1/payments/${p.id}`);
    expect(res.body.bill).toMatchObject({ status: 'ACTIVE', paymentStatus: 'UPCOMING' });
  });
});

describe('history', () => {
  type Item = { id: string; paidOn: string; amountCents: number; bill: { name: string; company: { name: string } } };

  it('lists 10 per page, newest first, with the USD total for the filter', async () => {
    // Add enough payments for two pages.
    for (let i = 0; i < 6; i++) await pay('finance', 'internet', { method: 'MOBILE_MONEY', paidOn: `2026-10-0${i + 1}` });
    const total = await ctx.db.paymentRecord.count({ where: { workspaceId: fx.workspaceId } });
    expect(total).toBeGreaterThan(10);

    const p1 = await fx.as('viewer').get('/api/v1/payments');
    expect(p1.body).toMatchObject({ page: 1, limit: 10, total, hasMore: true });
    expect(p1.body.items).toHaveLength(10);
    const dates = (p1.body.items as Item[]).map((i) => i.paidOn);
    expect(dates).toEqual([...dates].sort().reverse());
    const sum = await ctx.db.paymentRecord.aggregate({ where: { workspaceId: fx.workspaceId }, _sum: { amountCents: true } });
    expect(p1.body.totalCents).toBe(sum._sum.amountCents);

    const p2 = await fx.as('viewer').get('/api/v1/payments').query({ page: 2 });
    expect(p2.body.hasMore).toBe(false);
    expect(p2.body.items).toHaveLength(total - 10);
  });

  it('sorts by date paid (oldest) and amount', async () => {
    const oldest: Item[] = (await fx.as('admin').get('/api/v1/payments').query({ sort: 'paid_asc', limit: 50 })).body.items;
    expect(oldest.map((i) => i.paidOn)).toEqual([...oldest.map((i) => i.paidOn)].sort());
    const high: Item[] = (await fx.as('admin').get('/api/v1/payments').query({ sort: 'amount_desc', limit: 50 })).body.items;
    expect(high.map((i) => i.amountCents)).toEqual([...high.map((i) => i.amountCents)].sort((a, b) => b - a));
    const low: Item[] = (await fx.as('admin').get('/api/v1/payments').query({ sort: 'amount_asc', limit: 50 })).body.items;
    expect(low[0]!.amountCents).toBe(Math.min(...high.map((i) => i.amountCents)));
  });

  it('filters by date range, company, category and search (case-insensitive)', async () => {
    const oct = await fx.as('admin').get('/api/v1/payments').query({ from: '2026-10-01', to: '2026-10-31', limit: 50 });
    expect((oct.body.items as Item[]).every((i) => i.paidOn >= '2026-10-01' && i.paidOn <= '2026-10-31')).toBe(true);
    expect(oct.body.total).toBe(7); // 6 internet + the fixture's Google Workspace partial

    const beta = await fx.as('admin').get('/api/v1/payments').query({ companyId: fx.companies.beta, limit: 50 });
    expect((beta.body.items as Item[]).every((i) => i.bill.company.name === 'Beta Radio')).toBe(true);
    expect(beta.body.total).toBe(2);

    const comms = await fx.as('admin').get('/api/v1/payments').query({ categoryId: fx.categories['Communication & internet'] });
    expect(comms.body.total).toBe(6);

    const search = await fx.as('admin').get('/api/v1/payments').query({ q: 'GOOGLE' });
    expect((search.body.items as Item[]).map((i) => i.bill.name)).toEqual(['Google Workspace']);
    const byRef = await fx.as('admin').get('/api/v1/payments').query({ q: 'MOMO-1' });
    expect(byRef.body.total).toBe(1);
  });

  it('rejects unknown sort values', async () => {
    expect((await fx.as('admin').get('/api/v1/payments').query({ sort: 'random' })).status).toBe(400);
  });
});

describe('isolation', () => {
  it("another workspace can't see, record against, edit or delete any of it", async () => {
    const outsider = await register(app, 'Out Sider', 'outsider@pay.test');
    const other = await createWorkspace(app, outsider, 'Elsewhere');
    const them = client(app, outsider, other);
    const p = await ctx.db.paymentRecord.findFirstOrThrow({ where: { workspaceId: fx.workspaceId } });
    expect((await them.get('/api/v1/payments')).body.total).toBe(0);
    expect((await them.get(`/api/v1/payments/${p.id}`)).status).toBe(404);
    expect((await them.patch(`/api/v1/payments/${p.id}`).send({ reference: 'pwned' })).status).toBe(404);
    expect((await them.delete(`/api/v1/payments/${p.id}`)).status).toBe(404);
    expect((await them.post(`/api/v1/bills/${fx.billIds.internet}/payments`).send({ method: 'CASH' })).status).toBe(404);
    // Using their own token against our workspace id is a 404 too.
    expect((await client(app, outsider, fx.workspaceId).get('/api/v1/payments')).status).toBe(404);
    expect((await ctx.db.paymentRecord.findUniqueOrThrow({ where: { id: p.id } })).reference).not.toBe('pwned');
  });
});
