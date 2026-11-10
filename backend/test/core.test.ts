import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { parseAmountCents, parseDateCell, parseFrequency, guessCategoryName } from '../src/domain/guess.js';
import { parseCsv, suggestMapping } from '../src/modules/import/service.js';
import { unsubscribeUrl } from '../src/notifications/unsubscribe.js';

import { client, lastCode, login, register } from './helpers/api.js';
import { createTestContext } from './helpers/context.js';
import { buildFixture, type Fixture } from './helpers/fixture.js';

/**
 * Master prompt Part 1 additions: trials & auto-renew, default payment method, price history,
 * budgets, snooze, spreadsheet import, data export, account deletion, logout everywhere,
 * optional email verification, language, feedback and email unsubscribe.
 */
const ctx = createTestContext();
const app = createApp(ctx);
let fx: Fixture;

beforeAll(async () => {
  ctx.clock.set('2026-11-02T07:00:00Z'); // 09:00 in the fixture's timezone
  fx = await buildFixture(app, ctx);
});

afterAll(async () => {
  await ctx.db.$disconnect();
});

const base = () => ({
  companyId: fx.companies.alpha,
  categoryId: fx.categories['Technology & software'],
  amountCents: 2_500,
  frequencyUnit: 'MONTH',
});

describe('trials, auto-renew and default payment method', () => {
  it('stores the toggles and requires a trial end date', async () => {
    const missing = await fx.as('admin').post('/api/v1/subscriptions').send({ ...base(), name: 'Design tool', isTrial: true });
    expect(missing.status).toBe(400);

    const res = await fx
      .as('admin')
      .post('/api/v1/subscriptions')
      .send({ ...base(), name: 'Design tool', isTrial: true, trialEndsOn: '2026-11-20', autoRenew: true, defaultPaymentMethod: 'CARD' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ isTrial: true, trialEndsOn: '2026-11-20', autoRenew: true, defaultPaymentMethod: 'CARD' });

    const off = await fx.as('admin').patch(`/api/v1/subscriptions/${res.body.id}`).send({ isTrial: false });
    expect(off.body).toMatchObject({ isTrial: false, trialEndsOn: null });
  });

  it('a payment without a method uses the subscription default', async () => {
    const sub = await fx.as('admin').post('/api/v1/subscriptions').send({ ...base(), name: 'Phone plan', defaultPaymentMethod: 'MOBILE_MONEY' });
    const pay = await fx.as('finance').post(`/api/v1/subscriptions/${sub.body.id}/payments`).send({});
    expect(pay.status).toBe(201);
    expect(pay.body.payment.method).toBe('MOBILE_MONEY');
  });
});

describe('price changes', () => {
  it('editing the amount records history and tells the other managers', async () => {
    const id = fx.subscriptionIds.internet;
    const res = await fx.as('admin').patch(`/api/v1/subscriptions/${id}`).send({ amountCents: 14_400 });
    expect(res.status).toBe(200);
    const detail = await fx.as('viewer').get(`/api/v1/subscriptions/${id}`);
    expect(detail.body.priceHistory).toHaveLength(1);
    expect(detail.body.priceHistory[0]).toMatchObject({ oldAmountCents: 12_000, newAmountCents: 14_400 });

    const notes = await ctx.db.notification.findMany({ where: { type: 'PRICE_CHANGE', channel: 'IN_APP' } });
    expect(notes.map((n) => n.userId)).toEqual([fx.userIds.finance]); // not the admin who changed it, not the viewer
    expect(notes[0]!.body).toBe('📈 Alpha News · Internet went from $120.00 to $144.00.');
  });

  it('saving the same amount does not create a change', async () => {
    const id = fx.subscriptionIds.internet;
    await fx.as('admin').patch(`/api/v1/subscriptions/${id}`).send({ amountCents: 14_400 });
    expect(await ctx.db.priceChange.count({ where: { subscriptionId: id } })).toBe(1);
  });
});

describe('payment notices', () => {
  it('go to ADMIN and FINANCE only, never the person who recorded it', async () => {
    const before = await ctx.db.notification.count({ where: { type: 'PAYMENT_RECORDED' } });
    await fx.as('finance').post(`/api/v1/subscriptions/${fx.subscriptionIds['beta-x']}/payments`).send({ method: 'CARD' });
    const rows = await ctx.db.notification.findMany({ where: { type: 'PAYMENT_RECORDED' }, skip: before });
    expect(new Set(rows.map((r) => r.userId))).toEqual(new Set([fx.userIds.admin]));
  });
});

describe('budgets', () => {
  it('shows paid + still-due progress for the month and alerts managers once', async () => {
    const empty = await fx.as('viewer').get('/api/v1/budgets');
    expect(empty.body).toEqual([]);
    expect((await fx.as('viewer').put('/api/v1/budgets').send({ monthlyLimitCents: 10_000 })).status).toBe(403);

    const res = await fx.as('admin').put('/api/v1/budgets').send({ monthlyLimitCents: 100_000, alertAtPercent: 80 });
    expect(res.status).toBe(200);
    const all = res.body[0];
    expect(all).toMatchObject({ categoryId: null, monthlyLimitCents: 100_000, month: '2026-11' });
    expect(all.spentCents).toBe(all.paidCents + all.dueCents);
    expect(all.spentCents).toBeGreaterThan(100_000);
    expect(all.state).toBe('OVER');

    const alerts = await ctx.db.notification.findMany({ where: { type: 'BUDGET_ALERT', channel: 'IN_APP' } });
    expect(new Set(alerts.map((a) => a.userId))).toEqual(new Set([fx.userIds.admin, fx.userIds.finance]));
    expect(alerts[0]!.body).toMatch(/^📊 You've used \d+% of your monthly budget this month\.$/);

    // Same month, same threshold → no second alert.
    await fx.as('admin').put('/api/v1/budgets').send({ monthlyLimitCents: 100_000 });
    expect(await ctx.db.notification.count({ where: { type: 'BUDGET_ALERT', channel: 'IN_APP' } })).toBe(alerts.length);
  });

  it('per-category budgets only count that category', async () => {
    const cat = fx.categories['Social media'];
    const res = await fx.as('finance').put('/api/v1/budgets').send({ categoryId: cat, monthlyLimitCents: 5_000 });
    const social = res.body.find((b: { categoryId: string | null }) => b.categoryId === cat);
    expect(social).toMatchObject({ category: { name: 'Social media' }, paidCents: 800, percent: 16, state: 'OK' });
    expect((await fx.as('admin').delete(`/api/v1/budgets/${social.id}`)).status).toBe(204);
  });
});

describe('snooze', () => {
  it('snoozes the current cycle for the caller only', async () => {
    const id = fx.subscriptionIds.cleaning;
    const res = await fx.as('viewer').post(`/api/v1/subscriptions/${id}/snooze`).send({ days: 3 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ snoozedUntil: '2026-11-05' });
    expect((await fx.as('viewer').get(`/api/v1/subscriptions/${id}`)).body.snoozedUntil).toBe('2026-11-05');
    expect((await fx.as('admin').get(`/api/v1/subscriptions/${id}`)).body.snoozedUntil).toBeNull();
    expect((await fx.as('viewer').post(`/api/v1/subscriptions/${id}/snooze`).send({ until: '2026-11-01' })).status).toBe(400);
    expect((await fx.as('viewer').delete(`/api/v1/subscriptions/${id}/snooze`)).status).toBe(204);
    expect((await fx.as('viewer').get(`/api/v1/subscriptions/${id}`)).body.snoozedUntil).toBeNull();
  });
});

describe('spreadsheet import', () => {
  const csv = [
    'Company,Category,Subscription name,Provider,Amount (USD),Frequency,Next due date',
    'Alpha News,,Fibre internet,Lakeside Telecom,"$1,050.00",Monthly,2026-12-05',
    'Gamma Bakery,Utilities,Electricity,,45.5,Quarterly,15/01/2027',
    'Alpha News,Brand new cat,Yearbook,,30,yearly,2026-03-01',
    ',,,,abc,sometimes,not a date',
  ].join('\r\n');
  const file = { fileName: 'sheet.csv', contentBase64: Buffer.from(csv).toString('base64') };

  it('downloads a header-only template', async () => {
    const res = await fx.as('admin').get('/api/v1/import/template?format=csv');
    expect(res.status).toBe(200);
    expect(res.text.replace(/^\W+/, '').trim()).toBe('Company,Category,Subscription name,Provider,Amount (USD),Frequency,Next due date');
    expect((await fx.as('viewer').get('/api/v1/import/template')).status).toBe(403);
  });

  it('previews with mapping, guesses and validation errors, writing nothing', async () => {
    const before = await ctx.db.subscription.count();
    const res = await fx.as('finance').post('/api/v1/import/preview').send(file);
    expect(res.status).toBe(200);
    expect(res.body.mapping).toEqual({ company: 0, category: 1, name: 2, provider: 3, amount: 4, frequency: 5, nextDueDate: 6 });
    expect(res.body).toMatchObject({ total: 4, valid: 3, missingColumns: [] });
    const [a, b, c, bad] = res.body.rows;
    expect(a.parsed).toMatchObject({ category: 'Communication & internet', categoryGuessed: true, amountCents: 105_000, frequencyUnit: 'MONTH', nextDueDate: '2026-12-05' });
    expect(b.parsed).toMatchObject({ company: 'Gamma Bakery', amountCents: 4_550, frequencyUnit: 'MONTH', frequencyInterval: 3, nextDueDate: '2027-01-15' });
    expect(b.warnings).toContain('New company "Gamma Bakery" will be created');
    expect(c.warnings).toContain('New category "Brand new cat" will be created');
    expect(bad.errors).toEqual(['Name is missing', '"abc" is not an amount', '"sometimes" is not a frequency we know (try Monthly, Quarterly, Yearly…)', '"not a date" is not a date']);
    expect(await ctx.db.subscription.count()).toBe(before);
  });

  it('imports the valid rows, creating companies and categories', async () => {
    const res = await fx.as('admin').post('/api/v1/import/commit').send(file);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ imported: 3, skipped: 1, createdCompanies: 1, createdCategories: 1 });
    const list = await fx.as('admin').get('/api/v1/subscriptions?q=Yearbook');
    // A past date in a recurring row rolls forward to the next renewal.
    expect(list.body.items[0]).toMatchObject({ nextDueDate: '2027-03-01', category: { name: 'Brand new cat' } });
  });

  it('reads Excel files too', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(['Name', 'Amount', 'Billing cycle', 'Due date']);
    ws.addRow(['Accounting app', 19.99, 'every 2 months', new Date(Date.UTC(2026, 11, 1))]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const res = await fx.as('admin').post('/api/v1/import/preview').send({ fileName: 'x.xlsx', contentBase64: buf.toString('base64') });
    expect(res.status).toBe(200);
    expect(res.body.rows[0].parsed).toMatchObject({ name: 'Accounting app', amountCents: 1_999, frequencyInterval: 2, nextDueDate: '2026-12-01', company: 'Alpha News' });
  });
});

describe('import parsing helpers', () => {
  it('parses frequencies, amounts, dates and CSV', () => {
    expect(parseFrequency('Every 2 weeks')).toEqual({ unit: 'WEEK', interval: 2 });
    expect(parseFrequency('Semi-annual')).toEqual({ unit: 'MONTH', interval: 6 });
    expect(parseFrequency('14 days')).toEqual({ unit: 'WEEK', interval: 2 });
    expect(parseFrequency('One-time')).toEqual({ unit: 'ONCE', interval: 1 });
    expect(parseFrequency('whenever')).toBeNull();
    expect(parseAmountCents('1.523,50')).toBe(152_350);
    expect(parseAmountCents('USD 40')).toBe(4_000);
    expect(parseAmountCents('-5')).toBeNull();
    expect(parseDateCell('10/20/2026')).toBe('2026-10-20');
    expect(parseDateCell('05/04/2026')).toBe('2026-04-05');
    expect(parseDateCell('20 Oct 2026')).toBe('2026-10-20');
    expect(parseDateCell('Oct 20, 2026')).toBe('2026-10-20');
    expect(parseDateCell(46315)).toBe('2026-10-20');
    expect(parseDateCell('31/02/2026')).toBeNull();
    expect(parseCsv('a;b\n"x;1";"say ""hi"""\n')).toEqual([['a', 'b'], ['x;1', 'say "hi"']]);
    expect(suggestMapping(['Vendor', 'Service', 'Price', 'Renewal date', 'Cycle'])).toMatchObject({ provider: 0, name: 1, amount: 2, nextDueDate: 3, frequency: 4 });
    expect(guessCategoryName('Office 365 licence')).toBe('Technology & software');
    expect(guessCategoryName('School fees')).toBe('Education & training');
    expect(guessCategoryName('Zebra')).toBeNull();
  });
});

describe('data export', () => {
  it('exports JSON with masked keys only, for managers', async () => {
    const key = 'LIC-4242-SECRET-4F7A';
    await fx.as('admin').patch(`/api/v1/subscriptions/${fx.subscriptionIds.workspace}`).send({ subscriptionKey: key });
    expect((await fx.as('viewer').get('/api/v1/workspaces/current/export')).status).toBe(403);
    const res = await fx.as('finance').get('/api/v1/workspaces/current/export?format=json');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="dueora-export-2026-11-02\.json"/);
    expect(JSON.stringify(res.body)).not.toContain('SECRET');
    expect(res.body.subscriptions.find((s: { name: string }) => s.name === 'Google Workspace').subscriptionKey).toBe('••••••4F7A');
    expect(res.body.members).toHaveLength(3);
    expect(res.body.payments.length).toBeGreaterThan(0);
  });

  it('exports an Excel workbook', async () => {
    const res = await fx
      .as('admin')
      .get('/api/v1/workspaces/current/export?format=xlsx')
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Workspace', 'Members', 'Companies', 'Categories', 'Subscriptions', 'Payments', 'Price changes', 'Budgets']);
  });
});

describe('account', () => {
  it('changes language and verifies email optionally', async () => {
    const me = await register(app, 'Lina Okafor', 'lina@harbor-clinic.test');
    const c = client(app, me);
    expect((await c.patch('/api/v1/me').send({ locale: 'fr' })).body).toMatchObject({ locale: 'fr', emailVerified: false });
    expect((await c.patch('/api/v1/me').send({ locale: 'de' })).status).toBe(400);
    expect((await c.post('/api/v1/auth/verify-email/request')).status).toBe(202);
    const done = await c.post('/api/v1/auth/verify-email').send({ code: lastCode(ctx, 'lina@harbor-clinic.test') });
    expect(done.body.emailVerified).toBe(true);
  });

  it('logs out from every device', async () => {
    const a = await register(app, 'Tomas Reyes', 'tomas@riverside-school.test');
    const b = await login(app, 'tomas@riverside-school.test', 'correct-horse-9');
    expect((await client(app, a).post('/api/v1/auth/logout-all')).status).toBe(204);
    for (const s of [a, b]) {
      expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken })).status).toBe(401);
    }
  });

  it('stores feedback', async () => {
    const res = await fx.as('viewer').post('/api/v1/feedback').send({ message: 'Love the reminders!', appVersion: '1.0.0', platform: 'android' });
    expect(res.status).toBe(201);
    expect(await ctx.db.feedback.findFirst({ where: { userId: fx.userIds.viewer } })).toMatchObject({ workspaceId: fx.workspaceId, message: 'Love the reminders!' });
  });

  it('deletes the account: own workspace deleted, shared workspace kept with a new admin', async () => {
    const owner = await register(app, 'Ana Duarte', 'ana@northwind-ngo.test');
    const solo = (await client(app, owner).post('/api/v1/workspaces').send({ name: 'Ana personal', type: 'PERSONAL', timezone: 'Europe/Lisbon' })).body.id;
    const shared = (await client(app, owner).post('/api/v1/workspaces').send({ name: 'Northwind NGO', timezone: 'Europe/Lisbon' })).body.id;
    await client(app, owner, shared).post('/api/v1/workspaces/current/invites').send({ email: 'ben@northwind-ngo.test', role: 'VIEWER' });
    const ben = await register(app, 'Ben Ito', 'ben@northwind-ngo.test');
    const token = [...ctx.mailer.sent].reverse().find((m) => m.to === 'ben@northwind-ngo.test')!.text.match(/token=([\w%-]+)/)![1]!;
    await client(app, ben).post('/api/v1/workspaces/accept-invite').send({ token: decodeURIComponent(token) });

    const c = client(app, owner);
    expect((await c.delete('/api/v1/me').send({ password: 'wrong-password', confirm: 'DELETE' })).status).toBe(400);
    const res = await c.delete('/api/v1/me').send({ password: 'correct-horse-9', confirm: 'DELETE' });
    expect(res.body).toEqual({ deletedWorkspaces: 1, leftWorkspaces: 1 });

    expect(await ctx.db.workspace.findUnique({ where: { id: solo } })).toBeNull();
    expect(await ctx.db.membership.findFirst({ where: { workspaceId: shared, userId: ben.userId } })).toMatchObject({ role: 'ADMIN' });
    const tomb = await ctx.db.user.findUniqueOrThrow({ where: { id: owner.userId } });
    expect(tomb).toMatchObject({ name: 'Deleted user', email: `deleted-${owner.userId}@deleted.invalid` });
    expect(tomb.deletedAt).not.toBeNull();
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'ana@northwind-ngo.test', password: 'correct-horse-9' })).status).toBe(401);
  });
});

describe('email unsubscribe', () => {
  it('a signed link turns email off; a forged one does nothing', async () => {
    const url = new URL(unsubscribeUrl(ctx, fx.userIds.viewer, fx.workspaceId));
    const ok = await request(app).get(`${url.pathname}${url.search}`);
    expect(ok.status).toBe(200);
    expect(ok.text).toContain('unsubscribed');
    const prefs = await ctx.db.notificationPreference.findUnique({ where: { userId_workspaceId: { userId: fx.userIds.viewer, workspaceId: fx.workspaceId } } });
    expect(prefs?.emailEnabled).toBe(false);
    const forged = await request(app).get(`/api/v1/public/unsubscribe?token=${fx.userIds.admin}.${fx.workspaceId}.AAAA`);
    expect(forged.status).toBe(400);
  });
});

describe('default categories', () => {
  it('are the 11 from the master prompt', async () => {
    const res = await fx.as('viewer').get('/api/v1/categories');
    const defaults = (res.body as { name: string; isDefault: boolean }[]).filter((c) => c.isDefault).map((c) => c.name);
    expect(defaults.sort()).toEqual(
      [
        'Technology & software',
        'Hosting & domains',
        'Communication & internet',
        'Social media',
        'Office & rent',
        'Insurance',
        'Marketing',
        'Utilities',
        'Transport',
        'Education & training',
        'Other',
      ].sort(),
    );
  });
});
