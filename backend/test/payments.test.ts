import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

import { client, createWorkspace, register } from './helpers/api.js';
import { createTestContext } from './helpers/context.js';
import { seedAndLogin, type SeededWorkspace } from './helpers/seed.js';

const ctx = createTestContext();
const app = createApp(ctx);
let ws: SeededWorkspace;
const as = (who: keyof SeededWorkspace['sessions']) => client(app, ws.sessions[who], ws.organizationId);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

beforeAll(async () => {
  ctx.clock.set('2026-11-02T07:00:00Z');
  ws = await seedAndLogin(app, ctx);
});

afterAll(async () => {
  await ctx.db.$disconnect();
});

describe('recording payments', () => {
  it('a full payment closes the cycle and advances one year', async () => {
    const id = ws.obligationIds['kt-hosting']; // $1,523 due 2026-10-20 (overdue)
    const res = await as('anitha')
      .post(`/api/v1/obligations/${id}/payments`)
      .send({ method: 'BANK_TRANSFER', reference: 'TXN-482913', paidOn: '2026-11-01' });
    expect(res.status).toBe(201);
    expect(res.body.payment).toMatchObject({
      amountMinor: 152300, // defaults to the remaining amount
      currency: 'USD',
      cycleDueDate: '2026-10-20',
      paidOn: '2026-11-01',
      method: 'BANK_TRANSFER',
      reference: 'TXN-482913',
      recordedBy: { name: 'Anitha Uwase' },
    });
    expect(res.body.cycleCompleted).toBe(true);
    expect(res.body.obligation).toMatchObject({ nextDueDate: '2027-10-20', paymentStatus: 'UPCOMING', paidMinor: 0 });
  });

  it('history is kept when the new cycle begins', async () => {
    const detail = await as('anitha').get(`/api/v1/obligations/${ws.obligationIds['kt-hosting']}`);
    expect(detail.body.history.map((h: { cycleDueDate: string }) => h.cycleDueDate)).toEqual(['2026-10-20', '2025-10-20']);
  });

  it('partial payments keep the cycle open', async () => {
    const id = ws.obligationIds['kt-cloudflare']; // $240 due 2026-01-30
    const first = await as('isaac').post(`/api/v1/obligations/${id}/payments`).send({ amountMinor: 12000, method: 'CARD' });
    expect(first.body.cycleCompleted).toBe(false);
    expect(first.body.payment.paidOn).toBe('2026-11-02'); // defaults to today in Kigali
    expect(first.body.obligation).toMatchObject({ nextDueDate: '2026-01-30', paidMinor: 12000, remainingMinor: 12000, paymentStatus: 'OVERDUE' });

    const second = await as('isaac').post(`/api/v1/obligations/${id}/payments`).send({ method: 'CARD' });
    expect(second.body.payment.amountMinor).toBe(12000); // the rest
    expect(second.body.cycleCompleted).toBe(true);
    expect(second.body.obligation.nextDueDate).toBe('2027-01-30');
  });

  it('a partial payment on an upcoming cycle shows PARTIALLY_PAID', async () => {
    const id = ws.obligationIds['ktr-x']; // $48 due 2027-09-16
    const res = await as('anitha').post(`/api/v1/obligations/${id}/payments`).send({ amountMinor: 1000, method: 'MOBILE_MONEY' });
    expect(res.body.obligation).toMatchObject({ paymentStatus: 'PARTIALLY_PAID', remainingMinor: 3800 });
  });

  it('monthly items with month-end anchors advance correctly', async () => {
    const id = ws.obligationIds.rent; // anchored to the 31st, due 2026-11-30
    const r1 = await as('isaac').post(`/api/v1/obligations/${id}/payments`).send({ method: 'BANK_TRANSFER' });
    expect(r1.body.obligation.nextDueDate).toBe('2026-12-31');
    const r2 = await as('isaac').post(`/api/v1/obligations/${id}/payments`).send({ method: 'BANK_TRANSFER' });
    expect(r2.body.obligation.nextDueDate).toBe('2027-01-31');
    const r3 = await as('isaac').post(`/api/v1/obligations/${id}/payments`).send({ method: 'BANK_TRANSFER' });
    expect(r3.body.obligation.nextDueDate).toBe('2027-02-28');
  });

  it('one-time obligations become COMPLETED', async () => {
    const id = ws.obligationIds.redesign;
    const res = await as('anitha').post(`/api/v1/obligations/${id}/payments`).send({ method: 'BANK_TRANSFER' });
    expect(res.body.obligation).toMatchObject({ status: 'COMPLETED', paymentStatus: 'PAID', nextDueDate: '2026-11-20' });
    const again = await as('anitha').post(`/api/v1/obligations/${id}/payments`).send({ method: 'CARD' });
    expect(again.status).toBe(409);
  });

  it('validates the payment', async () => {
    const id = ws.obligationIds.internet;
    const url = `/api/v1/obligations/${id}/payments`;
    expect((await as('anitha').post(url).send({ method: 'CHEQUE' })).status).toBe(400);
    expect((await as('anitha').post(url).send({ method: 'CASH', amountMinor: 10.5 })).status).toBe(400);
    expect((await as('anitha').post(url).send({ method: 'CASH', currency: 'USD' })).status).toBe(400); // obligation is RWF
    expect((await as('anitha').post(url).send({ method: 'CASH', paidOn: '2026-11-03' })).status).toBe(400); // future
  });

  it('two simultaneous full payments advance the schedule only once', async () => {
    const id = ws.obligationIds.cleaning; // weekly 25,000 RWF due 2026-11-06
    const [a, b] = await Promise.all([
      as('isaac').post(`/api/v1/obligations/${id}/payments`).send({ method: 'CASH', amountMinor: 25000 }),
      as('isaac').post(`/api/v1/obligations/${id}/payments`).send({ method: 'CASH', amountMinor: 25000 }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const o = await ctx.db.obligation.findUniqueOrThrow({ where: { id } });
    const today = await ctx.db.paymentRecord.findMany({ where: { obligationId: id, paidOn: '2026-11-02' } });
    // The schedule moves one week per distinct cycle that got paid — never more.
    const cyclesPaid = new Set(today.map((p) => p.cycleDueDate)).size;
    expect(o.nextDueDate).toBe(cyclesPaid === 2 ? '2026-11-20' : '2026-11-13');
  });

  it('archived obligations cannot take payments', async () => {
    const id = ws.obligationIds.insurance;
    await as('anitha').post(`/api/v1/obligations/${id}/archive`);
    expect((await as('anitha').post(`/api/v1/obligations/${id}/payments`).send({ method: 'CARD' })).status).toBe(400);
    await as('anitha').post(`/api/v1/obligations/${id}/unarchive`);
  });
});

describe('who can record', () => {
  it('department officers record within their department only', async () => {
    const tech = await as('nadine').post(`/api/v1/obligations/${ws.obligationIds['ktr-domain']}/payments`).send({ method: 'MOBILE_MONEY' });
    expect(tech.status).toBe(201);
    const ops = await as('nadine').post(`/api/v1/obligations/${ws.obligationIds.internet}/payments`).send({ method: 'MOBILE_MONEY' });
    expect(ops.status).toBe(403);
  });

  it('employees cannot record, even on their own assignments', async () => {
    const res = await as('eric').post(`/api/v1/obligations/${ws.obligationIds.cleaning}/payments`).send({ method: 'CASH' });
    expect(res.status).toBe(403);
  });
});

describe('editing and deleting payments', () => {
  it('only admins and finance may edit or delete', async () => {
    const hist = await as('anitha').get('/api/v1/payments').query({ obligationId: ws.obligationIds['ktr-domain'] });
    const pid = hist.body.items[0].id;
    expect((await as('nadine').patch(`/api/v1/payments/${pid}`).send({ reference: 'X' })).status).toBe(403);
    expect((await as('nadine').delete(`/api/v1/payments/${pid}`)).status).toBe(403);
    expect((await as('eric').patch(`/api/v1/payments/${pid}`).send({ reference: 'X' })).status).toBe(404); // not visible to him
  });

  it('lowering a payment reopens the cycle it closed, and logs the change', async () => {
    const id = ws.obligationIds['ktr-domain']; // closed by Nadine above: 2027-02-26 → 2028-02-26
    const before = await ctx.db.obligation.findUniqueOrThrow({ where: { id } });
    expect(before.nextDueDate).toBe('2028-02-26');
    const pay = await ctx.db.paymentRecord.findFirstOrThrow({ where: { obligationId: id, cycleDueDate: '2027-02-26' } });

    const edited = await as('isaac').patch(`/api/v1/payments/${pay.id}`).send({ amountMinor: 10000, reference: 'MOMO-1' });
    expect(edited.status).toBe(200);
    expect(edited.body.cycleReopened).toBe(true);
    expect(edited.body.obligation).toMatchObject({ nextDueDate: '2027-02-26', paidMinor: 10000, remainingMinor: 8880, paymentStatus: 'PARTIALLY_PAID' });

    const log = await ctx.db.auditLog.findFirstOrThrow({ where: { action: 'payment.update', entityId: pay.id } });
    expect(log.meta).toMatchObject({ before: { amountMinor: 18880 }, after: { amountMinor: 10000, reference: 'MOMO-1' } });

    // Raising it back closes the cycle again.
    const fixed = await as('isaac').patch(`/api/v1/payments/${pay.id}`).send({ amountMinor: 18880 });
    expect(fixed.body.cycleCompleted).toBe(true);
    expect(fixed.body.obligation.nextDueDate).toBe('2028-02-26');
  });

  it('deleting the payment that closed a cycle reopens it', async () => {
    const id = ws.obligationIds['kt-hosting']; // closed in the first test → 2027-10-20
    const pay = await ctx.db.paymentRecord.findFirstOrThrow({ where: { obligationId: id, cycleDueDate: '2026-10-20' } });
    const res = await as('anitha').delete(`/api/v1/payments/${pay.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cycleReopened: true, obligation: { nextDueDate: '2026-10-20', paymentStatus: 'OVERDUE' } });
    expect(await ctx.db.auditLog.count({ where: { action: 'payment.delete', entityId: pay.id } })).toBe(1);
    // Older history is untouched.
    expect(await ctx.db.paymentRecord.count({ where: { obligationId: id, cycleDueDate: '2025-10-20' } })).toBe(1);
  });

  it('deleting a payment from an older, non-adjacent cycle never rewinds the schedule', async () => {
    // KT Radio hosting: open cycle 2027-10-02; paid cycles 2026-10-02 and 2025-10-02.
    const id = ws.obligationIds['ktr-hosting'];
    const old = await ctx.db.paymentRecord.findFirstOrThrow({ where: { obligationId: id, cycleDueDate: '2025-10-02' } });
    const res = await as('anitha').delete(`/api/v1/payments/${old.id}`);
    expect(res.body.cycleReopened).toBe(false);
    expect((await ctx.db.obligation.findUniqueOrThrow({ where: { id } })).nextDueDate).toBe('2027-10-02');
  });

  it('un-completes a one-time obligation when its payment is removed', async () => {
    const id = ws.obligationIds.redesign;
    const pay = await ctx.db.paymentRecord.findFirstOrThrow({ where: { obligationId: id } });
    const res = await as('anitha').delete(`/api/v1/payments/${pay.id}`);
    expect(res.body.obligation).toMatchObject({ status: 'ACTIVE', paymentStatus: 'UPCOMING' });
  });
});

describe('history', () => {
  it('lists newest first with totals per currency', async () => {
    const res = await as('anitha').get('/api/v1/payments').query({ pageSize: 5 });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(5);
    const dates = res.body.items.map((p: { paidOn: string }) => p.paidOn);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(res.body.totals.map((t: { currency: string }) => t.currency).sort()).toEqual(['RWF', 'USD']);
    expect(res.body.items[0].obligation).toHaveProperty('platform');
  });

  it('filters by date range, provider, platform, category and search (case-insensitive)', async () => {
    const range = await as('anitha').get('/api/v1/payments').query({ from: '2026-10-01', to: '2026-10-31' });
    expect(range.body.items.every((p: { paidOn: string }) => p.paidOn >= '2026-10-01' && p.paidOn <= '2026-10-31')).toBe(true);
    expect(range.body.total).toBeGreaterThan(0);

    const provider = await as('anitha').get('/api/v1/payments').query({ provider: 'digitalocean' });
    expect(provider.body.items.every((p: { obligation: { provider: string } }) => p.obligation.provider === 'DigitalOcean')).toBe(true);
    expect(provider.body.total).toBe(await ctx.db.paymentRecord.count({ where: { obligation: { provider: 'DigitalOcean' } } }));
    expect(provider.body.total).toBeGreaterThan(0);

    const search = await as('anitha').get('/api/v1/payments').query({ q: 'KT RADIO' });
    expect(search.body.items.every((p: { obligation: { platform: { name: string } | null } }) => p.obligation.platform?.name === 'KT Radio')).toBe(true);

    const ref = await as('anitha').get('/api/v1/payments').query({ q: 'DO-88213' });
    expect(ref.body.total).toBe(1);

    const platformId = search.body.items[0].obligation.platform.id;
    const byPlatform = await as('anitha').get('/api/v1/payments').query({ platformId });
    expect(byPlatform.body.total).toBe(search.body.total);

    const categoryId = search.body.items[0].obligation.category.id;
    const byCategory = await as('anitha').get('/api/v1/payments').query({ categoryId });
    expect(byCategory.body.items.every((p: { obligation: { category: { id: string } } }) => p.obligation.category.id === categoryId)).toBe(true);
  });

  it('employees only see history for their assignments', async () => {
    const res = await as('eric').get('/api/v1/payments');
    expect(res.body.items.every((p: { obligation: { name: string } }) => p.obligation.name === 'Cleaning service')).toBe(true);
    expect(res.body.total).toBeGreaterThan(0);
  });
});

describe('receipts and attachments', () => {
  let paymentId: string;
  let attachmentId: string;

  beforeAll(async () => {
    const res = await as('isaac').post(`/api/v1/obligations/${ws.obligationIds.internet}/payments`).send({ method: 'MOBILE_MONEY' });
    paymentId = res.body.payment.id;
  });

  it('uploads a receipt to a payment', async () => {
    const res = await as('isaac').post(`/api/v1/payments/${paymentId}/attachments`).attach('file', PDF, '../../etc/receipt "nov".pdf');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ mimeType: 'application/pdf', fileName: 'receipt nov.pdf' });
    attachmentId = res.body.id;
    const payment = await as('isaac').get(`/api/v1/payments/${paymentId}`);
    expect(payment.body.attachments).toHaveLength(1);
  });

  it('downloads it with safe headers', async () => {
    const res = await as('anitha').get(`/api/v1/attachments/${attachmentId}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="receipt nov.pdf"');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects disguised and oversized files', async () => {
    const html = await as('isaac')
      .post(`/api/v1/payments/${paymentId}/attachments`)
      .attach('file', Buffer.from('<html><script>x</script></html>'), { filename: 'r.pdf', contentType: 'application/pdf' });
    expect(html.status).toBe(400);
    const big = await as('isaac').post(`/api/v1/payments/${paymentId}/attachments`).attach('file', Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]), 'big.pdf');
    expect(big.status).toBe(413);
  });

  it('attaches contracts to obligations and hides them from unassigned employees', async () => {
    const res = await as('anitha').post(`/api/v1/obligations/${ws.obligationIds['kt-hosting']}/attachments`).attach('file', PDF, 'contract.pdf');
    expect(res.status).toBe(201);
    const detail = await as('anitha').get(`/api/v1/obligations/${ws.obligationIds['kt-hosting']}`);
    expect(detail.body.attachments.map((a: { fileName: string }) => a.fileName)).toEqual(['contract.pdf']);
    expect((await as('eric').get(`/api/v1/attachments/${res.body.id}`)).status).toBe(404);
  });

  it('deleting a payment removes its receipts from storage', async () => {
    const before = ctx.storage.files.size;
    await as('isaac').delete(`/api/v1/payments/${paymentId}`);
    expect(ctx.storage.files.size).toBe(before - 1);
    expect((await as('anitha').get(`/api/v1/attachments/${attachmentId}`)).status).toBe(404);
  });
});

describe('isolation', () => {
  it("another workspace can't see, record against, edit or download any of it", async () => {
    const outsider = await register(app, 'Out Sider', 'pay-outsider@else.test');
    const otherOrg = await createWorkspace(app, outsider, 'Elsewhere');
    const o = client(app, outsider, otherOrg);
    const anyPayment = await ctx.db.paymentRecord.findFirstOrThrow({ where: { organizationId: ws.organizationId } });
    const anyAttachment = await ctx.db.attachment.findFirstOrThrow({ where: { organizationId: ws.organizationId } });

    expect((await o.get('/api/v1/payments')).body.total).toBe(0);
    expect((await o.get(`/api/v1/payments/${anyPayment.id}`)).status).toBe(404);
    expect((await o.patch(`/api/v1/payments/${anyPayment.id}`).send({ amountMinor: 1 })).status).toBe(404);
    expect((await o.delete(`/api/v1/payments/${anyPayment.id}`)).status).toBe(404);
    expect((await o.post(`/api/v1/obligations/${anyPayment.obligationId}/payments`).send({ method: 'CASH' })).status).toBe(404);
    expect((await o.post(`/api/v1/payments/${anyPayment.id}/attachments`).attach('file', PDF, 'x.pdf')).status).toBe(404);
    expect((await o.get(`/api/v1/attachments/${anyAttachment.id}`)).status).toBe(404);
    expect((await o.delete(`/api/v1/attachments/${anyAttachment.id}`)).status).toBe(404);
    expect((await ctx.db.paymentRecord.findUniqueOrThrow({ where: { id: anyPayment.id } })).amountMinor).toBe(anyPayment.amountMinor);
  });
});
