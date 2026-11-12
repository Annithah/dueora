/**
 * Finalize brief, Part 4: variable amounts, stored cycles, "paid in full", and recurring bills
 * that fell behind several cycles.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

import { createTestContext } from './helpers/context.js';
import { buildFixture, type Fixture } from './helpers/fixture.js';

const ctx = createTestContext({}, { ACCESS_TOKEN_TTL_MINUTES: '1000000' });
const app = createApp(ctx);
let fx: Fixture;

beforeAll(async () => {
  ctx.clock.set('2026-11-02T07:00:00Z');
  fx = await buildFixture(app, ctx, { bills: false });
});
afterAll(async () => {
  await ctx.db.$disconnect();
});

const add = async (body: Record<string, unknown>) => {
  const res = await fx
    .as('admin')
    .post('/api/v1/bills')
    .send({ companyId: fx.companies.alpha, categoryId: fx.categories['Utilities'], frequencyUnit: 'MONTH', ...body });
  expect(res.status).toBe(201);
  return res.body.id as string;
};

describe('variable bills', () => {
  let id: string;

  it('start as an estimate; the real amount is set per cycle', async () => {
    id = await add({ name: 'Electricity', amountCents: 20_000, amountType: 'VARIABLE', nextDueDate: '2026-11-20', startDate: '2026-10-20' });
    const before = (await fx.as('viewer').get(`/api/v1/bills/${id}`)).body;
    expect(before).toMatchObject({ amountType: 'VARIABLE', isEstimate: true, cycleAmountCents: 20_000, remainingCents: 20_000 });

    expect((await fx.as('viewer').put(`/api/v1/bills/${id}/cycles/2026-11-20`).send({ amountCents: 23_456 })).status).toBe(403);
    expect((await fx.as('finance').put(`/api/v1/bills/${id}/cycles/2026-11-21`).send({ amountCents: 1 })).status).toBe(400);
    const set = await fx.as('finance').put(`/api/v1/bills/${id}/cycles/2026-11-20`).send({ amountCents: 23_456 });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ isEstimate: false, cycleAmountCents: 23_456, remainingCents: 23_456, amountCents: 20_000 });

    const cycles = (await fx.as('viewer').get(`/api/v1/bills/${id}/cycles`).query({ from: '2026-11-01', to: '2026-12-31' })).body.cycles;
    expect(cycles.map((c: { dueDate: string; expectedCents: number; isEstimate: boolean }) => [c.dueDate, c.expectedCents, c.isEstimate])).toEqual([
      ['2026-11-20', 23_456, false],
      ['2026-12-20', 20_000, true],
    ]);
  });

  it('a full payment of the actual amount closes the cycle at that amount', async () => {
    const pay = await fx.as('finance').post(`/api/v1/bills/${id}/payments`).send({ method: 'CASH' });
    expect(pay.status).toBe(201);
    expect(pay.body.payment.amountCents).toBe(23_456);
    const after = (await fx.as('viewer').get(`/api/v1/bills/${id}`)).body;
    expect(after).toMatchObject({ nextDueDate: '2026-12-20', isEstimate: true, cycleAmountCents: 20_000 });
  });
});

describe('"paid in full"', () => {
  it('closes a cycle at a smaller amount, and history keeps it', async () => {
    const id = await add({ name: 'Water', amountCents: 10_000, nextDueDate: '2026-11-10', startDate: '2026-10-10' });
    const pay = await fx.as('finance').post(`/api/v1/bills/${id}/payments`).send({ amountCents: 8_000, method: 'CASH', paidInFull: true });
    expect(pay.status).toBe(201);
    const after = (await fx.as('viewer').get(`/api/v1/bills/${id}`)).body;
    expect(after.nextDueDate).toBe('2026-12-10');

    // Raising the amount later doesn't change what the closed cycle expected.
    await fx.as('admin').patch(`/api/v1/bills/${id}`).send({ amountCents: 12_000 });
    const cycles = (await fx.as('viewer').get(`/api/v1/bills/${id}/cycles`).query({ from: '2026-11-01', to: '2026-12-31' })).body.cycles;
    expect(cycles.map((c: { dueDate: string; kind: string; expectedCents: number; state: string }) => [c.dueDate, c.kind, c.expectedCents, c.state])).toEqual([
      ['2026-11-10', 'closed', 8_000, 'PAID'],
      ['2026-12-10', 'current', 12_000, 'UPCOMING'],
    ]);
  });

  it('a normal part payment leaves the cycle open', async () => {
    const id = await add({ name: 'Gas', amountCents: 10_000, nextDueDate: '2026-11-15', startDate: '2026-10-15' });
    await fx.as('finance').post(`/api/v1/bills/${id}/payments`).send({ amountCents: 4_000, method: 'CASH' });
    expect((await fx.as('viewer').get(`/api/v1/bills/${id}`)).body).toMatchObject({ nextDueDate: '2026-11-15', remainingCents: 6_000, paymentStatus: 'PARTIALLY_PAID' });
  });
});

describe('a recurring bill that fell behind', () => {
  it('owes every missed cycle, not just the oldest', async () => {
    const id = await add({ name: 'Rent', amountCents: 50_000, nextDueDate: '2026-08-01', startDate: '2026-08-01' });
    const v = (await fx.as('viewer').get(`/api/v1/bills/${id}`)).body;
    // Aug (open cycle) plus Sep, Oct and Nov (missed), all before 2 Nov.
    expect(v).toMatchObject({ paymentStatus: 'OVERDUE', daysOverdue: 93, overdueCycles: 4, missedCycles: 3, outstandingCents: 200_000, overdueCents: 200_000 });
    // Paying the oldest moves on to the next missed one.
    await fx.as('finance').post(`/api/v1/bills/${id}/payments`).send({ method: 'CASH' });
    expect((await fx.as('viewer').get(`/api/v1/bills/${id}`)).body).toMatchObject({ nextDueDate: '2026-09-01', overdueCycles: 3, outstandingCents: 150_000 });
  });
});
