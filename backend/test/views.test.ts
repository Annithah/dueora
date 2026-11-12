/**
 * Finalize brief, Parts 5 and 6: tracking views and the period reports, on the fixture
 * workspace as seen on 2 Nov 2026 (see helpers/fixture.ts for the bills).
 */
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

import { createTestContext } from './helpers/context.js';
import { buildFixture, type Fixture } from './helpers/fixture.js';

const ctx = createTestContext({}, { ACCESS_TOKEN_TTL_MINUTES: '1000000' });
const app = createApp(ctx);
let fx: Fixture;

beforeAll(async () => {
  ctx.clock.set('2026-11-02T07:00:00Z');
  fx = await buildFixture(app, ctx);
});
afterAll(async () => {
  await ctx.db.$disconnect();
});

const view = async (name: string, query: Record<string, string | number> = {}) => {
  const res = await fx.as('viewer').get(`/api/v1/views/${name}`).query(query);
  expect(res.status).toBe(200);
  return res.body;
};
type Item = { bill: { name: string; company: { name: string } }; dueDate: string; remainingCents: number; daysOverdue: number };

describe('tracking views', () => {
  it('overdue: each cycle with days overdue, and ageing buckets', async () => {
    const v = await view('overdue');
    expect(v.items.map((i: Item) => [i.bill.name, i.dueDate, i.daysOverdue])).toEqual([
      ['CDN plan', '2026-01-30', 276],
      ['Hosting', '2026-10-20', 13],
    ]);
    expect(v.totals).toMatchObject({ count: 2, remainingCents: 176_300 });
    expect(v.ageing).toEqual([
      { bucket: '0–30', count: 1, amountCents: 152_300 },
      { bucket: '31–60', count: 0, amountCents: 0 },
      { bucket: '61–90', count: 0, amountCents: 0 },
      { bucket: '90+', count: 1, amountCents: 24_000 },
    ]);
  });

  it('upcoming 7/30 days, this month (total, paid, left) and next month', async () => {
    const week = await view('upcoming', { days: 7 });
    expect(week.items.map((i: Item) => i.bill.name)).toEqual(['Internet', 'Cleaning']);
    expect(week.totals.remainingCents).toBe(16_000);
    expect((await fx.as('viewer').get('/api/v1/views/upcoming').query({ days: 12 })).status).toBe(400);

    const month = await view('this-month');
    expect(month.totals).toMatchObject({ count: 7, expectedCents: 108_800, paidCents: 0, remainingCents: 108_800 });
    expect(month.byCompany.map((c: { company: { name: string }; expectedCents: number }) => [c.company.name, c.expectedCents])).toEqual([
      ['Alpha News', 108_000],
      ['Beta Radio', 800],
    ]);
    const next = await view('next-month');
    expect(next.from).toBe('2026-12-01');
    expect(next.items.some((i: Item) => i.bill.name === 'Google Workspace')).toBe(true);
  });

  it('outstanding includes everything due and unpaid; the company switcher narrows every view', async () => {
    const all = await view('outstanding');
    expect(all.totals.remainingCents).toBe(176_300);
    expect((await view('outstanding', { companyId: fx.companies.beta })).items).toEqual([]);
    expect((await view('this-month', { companyId: fx.companies.beta })).totals.expectedCents).toBe(800);
  });

  it('obligations carry the next reminder date', async () => {
    const o = await view('obligations', { days: 30 });
    const internet = o.items.find((i: Item) => i.bill.name === 'Internet');
    expect(internet.nextReminder).toBe('2026-11-02');
  });

  it('paid: cycles paid this month', async () => {
    await fx.as('finance').post(`/api/v1/bills/${fx.billIds.internet}/payments`).send({ method: 'CASH' });
    const paid = await view('paid');
    expect(paid.items.map((i: Item) => i.bill.name)).toEqual(['Internet']);
  });
});

describe('dashboard', () => {
  it('has last month at a glance, the cash-flow chart and the Bills-tab segment counts', async () => {
    const d = (await fx.as('viewer').get('/api/v1/dashboard')).body;
    expect(d.summary.outstanding).toEqual({ amountCents: 176_300, count: 2 });
    expect(d.lastMonth).toMatchObject({ month: '2026-10', count: 1, unpaid: 1 });
    expect(d.cashflow).toHaveLength(10);
    expect(d.cashflow.filter((m: { projected: boolean }) => m.projected).map((m: { month: string }) => m.month)).toEqual(['2026-12', '2027-01', '2027-02']);
    expect(d.segments).toMatchObject({ overdue: 2, outstanding: 2 });
  });
});

describe('reports', () => {
  it('include the payment report, ageing, upcoming and the category report', async () => {
    const r = (await fx.as('finance').get('/api/v1/reports').query({ period: 'month', year: 2026, month: 11 })).body;
    expect(r.company).toBeNull();
    expect(r.analysis.due.count).toBe(7);
    expect(r.analysis.timing).toMatchObject({ paid: 1, onTime: 1, late: 0 });
    expect(r.analysis.byMethod).toEqual([{ method: 'CASH', count: 1, amountCents: 12_000 }]);
    expect(r.analysis.previous.from).toBe('2026-10-01');
    expect(r.analysis.upcoming.days30.count).toBeGreaterThan(0);
    expect(r.analysis.categories[0].name).toBe('Office & rent');
    expect(r.totals.overdue.amountCents).toBe(176_300);
  });

  it('export one sheet per company with the company, the period and the generated date', async () => {
    const res = await fx
      .as('finance')
      .get('/api/v1/reports/export')
      .query({ format: 'xlsx', period: 'month', year: 2026, month: 11 })
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ArrayBuffer);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toEqual(expect.arrayContaining(['Summary', 'Due in period', 'Alpha News', 'Beta Radio', 'Payment report']));
    const summary = wb.getWorksheet('Summary')!;
    const cells = summary.getSheetValues().flat().map(String);
    expect(cells).toContain('All companies');
    expect(cells).toContain('2026-11-02');

    const one = await fx.as('finance').get('/api/v1/reports/export').query({ format: 'pdf', period: 'month', year: 2026, month: 11, companyId: fx.companies.beta });
    expect(one.headers['content-disposition']).toContain('beta-radio');
  });
});
