import type { Response } from 'superagent';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

import { client, createWorkspace, register } from './helpers/api.js';
import { createTestContext } from './helpers/context.js';
import { buildFixture, type Fixture } from './helpers/fixture.js';

const ctx = createTestContext({}, { ACCESS_TOKEN_TTL_MINUTES: '100000' });
const app = createApp(ctx);
let fx: Fixture;

beforeAll(async () => {
  ctx.clock.set('2026-11-02T07:00:00Z');
  fx = await buildFixture(app, ctx);
});

afterAll(async () => {
  await ctx.db.$disconnect();
});

const binary = (res: Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('an empty workspace', () => {
  it('returns zeros and empty lists — never sample data', async () => {
    const owner = await register(app, 'Empty Owner', 'empty@insights.test');
    const id = await createWorkspace(app, owner, 'Brand New Ltd');
    const d = (await client(app, owner, id).get('/api/v1/dashboard')).body;
    expect(d.summary).toEqual({
      overdue: { amountCents: 0, count: 0 },
      dueThisWeek: { amountCents: 0, count: 0 },
      dueThisMonth: { amountCents: 0, count: 0 },
      outstanding: { amountCents: 0, count: 0 },
      paidThisMonth: { amountCents: 0, count: 0, changePercent: null },
    });
    expect(d.needsAttention).toEqual([]);
    expect(d.next30Days).toEqual([]);
    expect(d.byCategory).toEqual([]);
    expect(d.byCompany).toEqual([]);
    expect(d.counts).toEqual({ active: 0, total: 0, overdue: 0, upcoming30: 0 });
    expect(d.spending.months.every((m: { amountCents: number }) => m.amountCents === 0)).toBe(true);
  });
});

describe('GET /dashboard', () => {
  it('aggregates the Home screen in one call, in USD cents', async () => {
    const res = await fx.as('admin').get('/api/v1/dashboard');
    expect(res.status).toBe(200);
    const d = res.body;
    expect(d).toMatchObject({ today: '2026-11-02', localHour: 9 });
    // Hosting $1,523.00 + CDN plan $240.00
    expect(d.summary.overdue).toEqual({ amountCents: 176_300, count: 2 });
    // Internet (5 Nov, $120) and cleaning (6 Nov, $40)
    expect(d.summary.dueThisWeek).toEqual({ amountCents: 16_000, count: 2 });
    // Rest of November: internet + 4 weekly cleanings + X ($8) + rent ($800)
    expect(d.summary.dueThisMonth).toEqual({ amountCents: 108_800, count: 7 });
    // Only October's $200 partial payment exists → -100% month on month.
    expect(d.summary.paidThisMonth).toEqual({ amountCents: 0, count: 0, changePercent: -100 });
    expect(JSON.stringify(d)).not.toMatch(/currency|RWF|missingRates/i);
  });

  it('lists what needs attention, most urgent first, and the next 30 days by due date', async () => {
    const d = (await fx.as('viewer').get('/api/v1/dashboard')).body;
    expect(d.needsAttention.map((o: { name: string; paymentStatus: string }) => `${o.name}:${o.paymentStatus}`)).toEqual([
      'CDN plan:OVERDUE',
      'Hosting:OVERDUE',
      'Google Workspace:PARTIALLY_PAID',
      'Internet:DUE_SOON',
      'Cleaning:DUE_SOON',
    ]);
    expect(d.needsAttention[0].company).toMatchObject({ name: 'Alpha News' });
    expect(d.next30Days[0]).toMatchObject({ date: '2026-11-05', bill: { name: 'Internet' }, status: 'DUE_SOON', amountCents: 12_000 });
    const dates = d.next30Days.map((t: { date: string }) => t.date);
    expect(dates).toEqual([...dates].sort());
    expect(dates.every((t: string) => t >= '2026-11-02' && t <= '2026-12-02')).toBe(true);
  });

  it('charts 12 months of spending with category and company splits', async () => {
    const d = (await fx.as('admin').get('/api/v1/dashboard')).body;
    expect(d.spending.months).toHaveLength(12);
    expect(d.spending.months.at(-1).month).toBe('2026-11');
    expect(d.spending.months.find((m: { month: string }) => m.month === '2026-10').amountCents).toBe(20_000);
    expect(d.spending.paidLast12Months).toBe(20_000);
    expect(d.byCategory).toEqual([expect.objectContaining({ name: 'Technology & software', amountCents: 20_000, share: 100 })]);
    expect(d.byCompany).toEqual([expect.objectContaining({ name: 'Alpha News', amountCents: 20_000, share: 100 })]);
  });
});

describe('GET /calendar', () => {
  it('projects future cycles with their status', async () => {
    const res = await fx.as('viewer').get('/api/v1/calendar').query({ from: '2026-11-01', to: '2026-11-30' });
    expect(res.status).toBe(200);
    const cleaning = res.body.events.filter((e: { name: string }) => e.name === 'Cleaning');
    expect(cleaning.map((e: { date: string; status: string; kind: string }) => `${e.date}:${e.status}:${e.kind}`)).toEqual([
      '2026-11-06:DUE_SOON:current',
      '2026-11-13:UPCOMING:future',
      '2026-11-20:UPCOMING:future',
      '2026-11-27:UPCOMING:future',
    ]);
    expect(res.body.events.find((e: { name: string }) => e.name === 'Office rent')).toMatchObject({
      date: '2026-11-30',
      amountCents: 80_000,
      company: 'Alpha News',
      categoryIcon: 'house',
    });
  });

  it('validates the range', async () => {
    expect((await fx.as('admin').get('/api/v1/calendar').query({ from: '2026-12-01', to: '2026-11-01' })).status).toBe(400);
    expect((await fx.as('admin').get('/api/v1/calendar').query({ from: '2026-01-01', to: '2027-12-31' })).status).toBe(400);
  });
});

describe('reports', () => {
  it('summarises a month: committed, paid, outstanding, overdue and a 12-month forecast', async () => {
    const r = (await fx.as('finance').get('/api/v1/reports').query({ period: 'month', year: 2026, month: 11 })).body;
    expect(r).toMatchObject({ period: 'month', from: '2026-11-01', to: '2026-11-30', workspace: { name: 'Fixture Media' } });
    expect(r.totals).toEqual({
      committed: { amountCents: 108_800, count: 7 },
      paid: { amountCents: 0, count: 0 },
      outstanding: { amountCents: 108_800, count: 7 },
      overdue: { amountCents: 176_300, count: 2 },
    });
    expect(r.forecast).toHaveLength(12);
    expect(r.forecast[0].month).toBe('2026-11');
    expect(r.overdue.map((o: { name: string }) => o.name).sort()).toEqual(['CDN plan', 'Hosting']);
  });

  it('summarises a year month by month, by category and by company', async () => {
    const r = (await fx.as('admin').get('/api/v1/reports').query({ period: 'year', year: 2026 })).body;
    expect(r.months).toHaveLength(12);
    expect(r.totals.paid).toEqual({ amountCents: 20_000, count: 1 });
    expect(r.months.reduce((s: number, m: { paidCents: number }) => s + m.paidCents, 0)).toBe(20_000);
    expect(r.byCategory[0]).toMatchObject({ name: 'Technology & software', share: 100 });
    expect(r.byCompany[0]).toMatchObject({ name: 'Alpha News', share: 100 });
    expect(r.payments[0]).toMatchObject({ name: 'Google Workspace', company: 'Alpha News', amountCents: 20_000, method: 'BANK_TRANSFER' });
  });

  it('exports PDF and Excel files', async () => {
    const pdf = await fx.as('admin').get('/api/v1/reports/export').query({ format: 'pdf', period: 'year', year: 2026 }).buffer(true).parse(binary);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toBe('attachment; filename="fixture-media-report-2026.pdf"');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const xlsx = await fx.as('finance')
      .get('/api/v1/reports/export')
      .query({ format: 'xlsx', period: 'month', year: 2026, month: 10 })
      .buffer(true)
      .parse(binary);
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-disposition']).toContain('fixture-media-report-2026-10.xlsx');
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK'); // zip container
  });

  it('is readable by viewers (read-only access includes reports)', async () => {
    expect((await fx.as('viewer').get('/api/v1/reports')).status).toBe(200);
    expect((await fx.as('viewer').get('/api/v1/reports/export').query({ format: 'pdf' })).status).toBe(200);
  });

  it('never includes another workspace', async () => {
    const other = await register(app, 'Other', 'other-insights@else.test');
    const id = await createWorkspace(app, other, 'Else Ltd');
    const o = client(app, other, id);
    expect((await o.get('/api/v1/dashboard')).body.summary.overdue.count).toBe(0);
    expect((await o.get('/api/v1/calendar').query({ from: '2026-10-01', to: '2026-11-30' })).body.events).toEqual([]);
    expect((await o.get('/api/v1/reports').query({ period: 'year', year: 2026 })).body.payments).toEqual([]);
    expect((await client(app, other, fx.workspaceId).get('/api/v1/dashboard')).status).toBe(404);
  });
});

describe('after a payment', () => {
  it('the calendar shows the paid cycle and the dashboard counts it', async () => {
    await fx.as('finance')
      .post(`/api/v1/bills/${fx.billIds['alpha-hosting']}/payments`)
      .send({ method: 'BANK_TRANSFER', paidOn: '2026-11-01' });
    const oct = await fx.as('admin').get('/api/v1/calendar').query({ from: '2026-10-01', to: '2026-10-31' });
    expect(oct.body.events.filter((e: { name: string }) => e.name === 'Hosting')).toEqual([
      expect.objectContaining({ date: '2026-10-20', status: 'PAID', kind: 'paid', amountCents: 152_300 }),
    ]);
    const d = (await fx.as('admin').get('/api/v1/dashboard')).body;
    expect(d.summary.overdue).toEqual({ amountCents: 24_000, count: 1 });
    expect(d.summary.paidThisMonth).toMatchObject({ amountCents: 152_300, count: 1 });
    expect(d.byCategory[0]).toMatchObject({ name: 'Hosting & domains', amountCents: 152_300 });
  });
});
