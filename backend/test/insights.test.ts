import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { Converter } from '../src/modules/insights/money.js';
import { Prisma } from '../src/generated/prisma/client.js';

import { client, createWorkspace, register } from './helpers/api.js';
import { createTestContext } from './helpers/context.js';
import { seedAndLogin, type SeededWorkspace } from './helpers/seed.js';

const ctx = createTestContext({}, { ACCESS_TOKEN_TTL_MINUTES: '100000' });
const app = createApp(ctx);
let ws: SeededWorkspace;
const as = (who: keyof SeededWorkspace['sessions']) => client(app, ws.sessions[who], ws.organizationId);

beforeAll(async () => {
  ctx.clock.set('2026-11-02T07:00:00Z');
  ws = await seedAndLogin(app, ctx);
});

afterAll(async () => {
  await ctx.db.$disconnect();
});

describe('Converter', () => {
  const c = new Converter('USD', [{ fromCurrency: 'RWF', rate: new Prisma.Decimal('0.00069') }]);
  it('converts with decimal maths and rounds to minor units', () => {
    expect(c.convert(110000, 'RWF')).toBe(7590); // 110,000 RWF → $75.90
    expect(c.convert(12345, 'USD')).toBe(12345);
    expect(c.total({ USD: 210000, RWF: 185000 })).toBe(222765);
  });
  it('reports currencies without a rate instead of guessing', () => {
    expect(c.convert(1000, 'EUR')).toBeNull();
    expect([...c.missing]).toEqual(['EUR']);
  });
});

describe('GET /dashboard', () => {
  it('aggregates the Home screen in one call', async () => {
    const res = await as('anitha').get('/api/v1/dashboard');
    expect(res.status).toBe(200);
    const d = res.body;
    expect(d).toMatchObject({ today: '2026-11-02', localHour: 9, defaultCurrency: 'USD', missingRates: [] });

    // $1,523 (KigaliToday hosting) + $240 (Cloudflare) — the prototype's "$1,763 · 2 obligations".
    expect(d.summary.overdue).toEqual({ count: 2, totals: [{ currency: 'USD', amountMinor: 176300 }], converted: { currency: 'USD', amountMinor: 176300 } });
    // Internet (5 Nov) and cleaning (6 Nov), both in RWF.
    expect(d.summary.dueThisWeek).toEqual({ count: 2, totals: [{ currency: 'RWF', amountMinor: 110000 }], converted: { currency: 'USD', amountMinor: 7590 } });
    // Rest of November: 4 weekly cleanings + internet (RWF), redesign + rent (USD).
    expect(d.summary.dueThisMonth.count).toBe(7);
    expect(d.summary.dueThisMonth.totals).toEqual([
      { currency: 'USD', amountMinor: 210000 },
      { currency: 'RWF', amountMinor: 185000 },
    ]);
    expect(d.summary.dueThisMonth.converted.amountMinor).toBe(222765);
    expect(d.summary.paidThisMonth).toMatchObject({ count: 0, changePercent: -100 });
  });

  it('lists what needs attention, most urgent first, and the next 30 days', async () => {
    const d = (await as('anitha').get('/api/v1/dashboard')).body;
    expect(d.needsAttention.map((o: { name: string; paymentStatus: string }) => `${o.name}:${o.paymentStatus}`)).toEqual([
      'Cloudflare:OVERDUE',
      'Hosting:OVERDUE',
      'Google Workspace:PARTIALLY_PAID',
      'Office internet:DUE_SOON',
      'Cleaning service:DUE_SOON',
    ]);
    expect(d.next30Days[0]).toMatchObject({ date: '2026-11-05', obligation: { name: 'Office internet' }, status: 'DUE_SOON' });
    expect(d.next30Days.every((t: { date: string }) => t.date > '2026-11-02' && t.date <= '2026-12-02')).toBe(true);
  });

  it('charts 12 months of spending and a category split', async () => {
    const d = (await as('anitha').get('/api/v1/dashboard')).body;
    expect(d.spending.months).toHaveLength(12);
    expect(d.spending.months.at(-1).month).toBe('2026-11');
    expect(d.spending.paidLast12Months).toBe(d.spending.months.reduce((s: number, m: { amountMinor: number }) => s + m.amountMinor, 0));
    const shares = d.byCategory.reduce((s: number, c: { share: number }) => s + c.share, 0);
    expect(shares).toBeGreaterThan(99.5);
    expect(shares).toBeLessThan(100.5);
  });

  it('shows employees only their own items', async () => {
    const d = (await as('eric').get('/api/v1/dashboard')).body;
    expect(d.summary.overdue.count).toBe(0);
    expect(d.needsAttention.map((o: { name: string }) => o.name)).toEqual(['Cleaning service']);
  });

  it('flags currencies without an exchange rate', async () => {
    await as('anitha').delete('/api/v1/workspaces/current/exchange-rates/RWF');
    const d = (await as('anitha').get('/api/v1/dashboard')).body;
    expect(d.missingRates).toEqual(['RWF']);
    expect(d.summary.dueThisWeek.converted.amountMinor).toBe(0);
    await as('anitha').put('/api/v1/workspaces/current/exchange-rates/RWF').send({ rate: '0.00069' });
  });
});

describe('GET /calendar', () => {
  it('projects future cycles with their status', async () => {
    const res = await as('anitha').get('/api/v1/calendar').query({ from: '2026-11-01', to: '2026-11-30' });
    expect(res.status).toBe(200);
    const cleaning = res.body.events.filter((e: { name: string }) => e.name === 'Cleaning service');
    expect(cleaning.map((e: { date: string; status: string; kind: string }) => `${e.date}:${e.status}:${e.kind}`)).toEqual([
      '2026-11-06:DUE_SOON:current',
      '2026-11-13:UPCOMING:future',
      '2026-11-20:UPCOMING:future',
      '2026-11-27:UPCOMING:future',
    ]);
    expect(res.body.events.find((e: { name: string }) => e.name === 'Office rent')).toMatchObject({ date: '2026-11-30', amountMinor: 120000 });
  });

  it('shows paid cycles from history and the overdue open cycle', async () => {
    const res = await as('anitha').get('/api/v1/calendar').query({ from: '2026-10-01', to: '2026-10-31' });
    const byName = (n: string) => res.body.events.filter((e: { name: string }) => e.name === n);
    expect(byName('Hosting').map((e: { status: string; platform: string }) => `${e.platform}:${e.status}`).sort()).toEqual(['KT Radio:PAID', 'KigaliToday:OVERDUE']);
    expect(byName('Cleaning service').map((e: { date: string }) => e.date)).toEqual(['2026-10-23', '2026-10-30']);
    expect(byName('Office rent')[0]).toMatchObject({ date: '2026-10-31', status: 'PAID', kind: 'paid' });
  });

  it('validates the range', async () => {
    expect((await as('anitha').get('/api/v1/calendar').query({ from: '2026-12-01', to: '2026-11-01' })).status).toBe(400);
    expect((await as('anitha').get('/api/v1/calendar').query({ from: '2026-01-01', to: '2027-12-31' })).status).toBe(400);
  });
});

describe('reports', () => {
  it('summarises a month: committed, paid, outstanding, overdue, forecast', async () => {
    const res = await as('isaac').get('/api/v1/reports').query({ period: 'month', year: 2026, month: 11 });
    expect(res.status).toBe(200);
    const r = res.body;
    expect(r).toMatchObject({ period: 'month', from: '2026-11-01', to: '2026-11-30' });
    expect(r.totals.paid.count).toBe(0);
    expect(r.totals.outstanding.converted.amountMinor).toBe(222765);
    expect(r.totals.committed.converted.amountMinor).toBe(222765);
    expect(r.totals.overdue).toMatchObject({ count: 2, converted: { amountMinor: 176300 } });
    expect(r.forecast).toHaveLength(12);
    expect(r.forecast[0].month).toBe('2026-11');
    expect(r.overdue.map((o: { name: string }) => o.name).sort()).toEqual(['Cloudflare', 'Hosting']);
  });

  it('summarises a year month by month with categories', async () => {
    const r = (await as('anitha').get('/api/v1/reports').query({ period: 'year', year: 2026 })).body;
    expect(r.months).toHaveLength(12);
    expect(r.totals.paid.count).toBe(r.payments.length);
    expect(r.payments.every((p: { paidOn: string }) => p.paidOn.startsWith('2026'))).toBe(true);
    const paidFromMonths = r.months.reduce((s: number, m: { paidMinor: number }) => s + m.paidMinor, 0);
    expect(paidFromMonths).toBe(r.totals.paid.converted.amountMinor);
    expect(r.byCategory.length).toBeGreaterThan(0);
  });

  it('exports PDF and Excel files', async () => {
    const pdf = await as('anitha').get('/api/v1/reports/export').query({ format: 'pdf', period: 'year', year: 2026 }).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toBe('attachment; filename="kigali-today-ltd-report-2026.pdf"');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const xlsx = await as('anitha').get('/api/v1/reports/export').query({ format: 'xlsx', period: 'month', year: 2026, month: 10 }).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-disposition']).toContain('kigali-today-ltd-report-2026-10.xlsx');
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK'); // zip container
  });

  it('is limited to admins and finance', async () => {
    expect((await as('nadine').get('/api/v1/reports')).status).toBe(403);
    expect((await as('eric').get('/api/v1/reports')).status).toBe(403);
    expect((await as('eric').get('/api/v1/reports/export').query({ format: 'pdf' })).status).toBe(403);
  });

  it('never includes another workspace', async () => {
    const other = await register(app, 'Other', 'other-insights@else.test');
    const orgId = await createWorkspace(app, other, 'Else Ltd');
    const o = client(app, other, orgId);
    const d = (await o.get('/api/v1/dashboard')).body;
    expect(d.summary.overdue.count).toBe(0);
    expect(d.needsAttention).toEqual([]);
    expect((await o.get('/api/v1/calendar').query({ from: '2026-10-01', to: '2026-11-30' })).body.events).toEqual([]);
    expect((await o.get('/api/v1/reports').query({ period: 'year', year: 2026 })).body.payments).toEqual([]);
    expect((await client(app, other, ws.organizationId).get('/api/v1/dashboard')).status).toBe(404);
  });
});
