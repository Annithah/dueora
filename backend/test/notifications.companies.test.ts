/**
 * Finalize brief, Part 7 — a year with several companies (fake clock, Africa/Kigali, UTC+2):
 * - each company may have its own reminder hour; reminders go out at that hour, once a day
 * - a member limited to one company never hears about another
 * - a variable bill asks its managers for the real amount 5 days before it is due
 * - the 25th brings next month's preview; the 1st says the report is ready, with
 *   obligations per company; the weekly digest lists what is still owed per company
 * - per-company switches: turning a company's reminders off stops them for that person only
 * - nothing is ever duplicated
 */
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { addDays } from '../src/domain/schedule.js';
import { workOnce } from '../src/notifications/scheduler.js';

import { client, lastInviteToken, register, type Session } from './helpers/api.js';
import { createTestContext } from './helpers/context.js';

const ctx = createTestContext({}, { ACCESS_TOKEN_TTL_MINUTES: '10000000', REFRESH_TOKEN_TTL_DAYS: '3650' });
const app: Express = createApp(ctx);

let admin: Session;
let alphaOnly: Session;
let workspaceId: string;
let alpha: string;
let beta: string;
let electricity: string;
const as = (s: Session) => client(app, s, workspaceId);
const START = '2026-11-01';

async function invite(email: string, body: Record<string, unknown>) {
  await as(admin).post('/api/v1/workspaces/current/invites').send({ email, ...body });
  const s = await register(app, email.split('@')[0]!, email);
  await client(app, s).post('/api/v1/workspaces/accept-invite').send({ token: lastInviteToken(ctx, email) });
  return s;
}

beforeAll(async () => {
  ctx.clock.set(`${START}T05:00:00Z`);
  admin = await register(app, 'Ada Admin', 'ada@multi.test');
  workspaceId = (await client(app, admin).post('/api/v1/workspaces').send({ name: 'Multi Media', timezone: 'Africa/Kigali', firstCompanyName: 'Alpha' })).body.id;
  alpha = (await as(admin).get('/api/v1/companies')).body[0].id;
  // Beta reminds at 14:00 local instead of the workspace's 09:00.
  beta = (await as(admin).post('/api/v1/companies').send({ name: 'Beta', reminderHour: 14, categoryStart: { mode: 'suggestions' } })).body.id;
  alphaOnly = await invite('alf@multi.test', { role: 'FINANCE', allCompanies: false, companies: [{ companyId: alpha, role: 'FINANCE' }] });
  const cat = async (companyId: string) => (await as(admin).get('/api/v1/categories').query({ companyId })).body.find((c: { name: string }) => c.name === 'Utilities').id;
  const add = async (body: Record<string, unknown>) => (await as(admin).post('/api/v1/bills').send({ frequencyUnit: 'MONTH', reminderOffsets: [3, 0, -1], ...body })).body.id as string;
  electricity = await add({ name: 'Electricity', companyId: alpha, categoryId: await cat(alpha), amountCents: 30_000, amountType: 'VARIABLE', startDate: '2026-11-20' });
  await add({ name: 'Studio rent', companyId: beta, categoryId: await cat(beta), amountCents: 80_000, startDate: '2026-11-10' });
  await ctx.db.notification.deleteMany({});
});
afterAll(async () => {
  await ctx.db.$disconnect();
});

const note = (where: Record<string, unknown> = {}) => ctx.db.notification.findMany({ where: { workspaceId, channel: 'IN_APP', ...where }, orderBy: { createdAt: 'asc' } });
/** Run the worker at 07:00, 12:00 and 16:00 UTC (09:00, 14:00, 18:00 Kigali) on one day. */
async function day(date: string) {
  for (const t of ['07:00', '12:00', '16:00']) {
    ctx.clock.set(`${date}T${t}:00Z`);
    await workOnce(ctx);
  }
}

describe('reminders follow each company’s own hour', () => {
  it('Beta’s reminders wait for 14:00; Alpha’s go at 09:00', async () => {
    ctx.clock.set('2026-11-07T07:30:00Z'); // 09:30 Kigali: Beta's rent is due in 3 days
    await workOnce(ctx);
    expect((await note({ type: 'REMINDER' })).filter((n) => n.body.includes('Studio rent'))).toEqual([]);
    ctx.clock.set('2026-11-07T12:05:00Z'); // 14:05 Kigali
    await workOnce(ctx);
    const rent = (await note({ type: 'REMINDER' })).filter((n) => n.body.includes('Studio rent'));
    expect(rent.length).toBeGreaterThan(0);
    // Copy names the company: "⏰ Beta · Studio rent is due in 3 days…".
    expect(rent[0]!.body).toContain('Beta · Studio rent');
  });

  it('a member limited to Alpha never hears about Beta', async () => {
    const alf = (await note({ userId: alphaOnly.userId })).map((n) => `${n.title} ${n.body}`);
    expect(alf.some((t) => t.includes('Beta'))).toBe(false);
  });
});

describe('a year of company notifications', () => {
  beforeAll(async () => {
    for (let d = '2026-11-08'; d <= '2027-10-31'; d = addDays(d, 1)) {
      await day(d);
      // Pay everything on its due date so reminders stay calm; Electricity gets its real amount first.
      const bills = (await as(admin).get('/api/v1/bills').query({ limit: 50 })).body.items as { id: string; name: string; nextDueDate: string; isEstimate: boolean; status: string }[];
      for (const b of bills) {
        if (b.status !== 'ACTIVE' || b.nextDueDate !== d) continue;
        if (b.isEstimate) await as(admin).put(`/api/v1/bills/${b.id}/cycles/${d}`).send({ amountCents: 31_500 });
        await as(admin).post(`/api/v1/bills/${b.id}/payments`).send({ method: 'BANK_TRANSFER', paidOn: d });
      }
    }
  }, 600_000);

  it('asks for the variable amount 5 days before every due date', async () => {
    const asks = await note({ type: 'AMOUNT_NEEDED', userId: admin.userId });
    // Electricity is due on the 20th; the first ask (15 Nov) is in the year, then one a month.
    expect(asks.length).toBe(12);
    expect(asks.every((n) => n.title.includes('Alpha · Electricity'))).toBe(true);
    // The restricted Alpha member is Finance there, so they are asked too.
    expect((await note({ type: 'AMOUNT_NEEDED', userId: alphaOnly.userId })).length).toBe(12);
    expect(asks.every((n) => n.cycleDueDate?.endsWith('-20'))).toBe(true);
  });

  it('sends next month’s preview on the 25th and the report on the 1st, per company', async () => {
    const previews = await note({ type: 'NEXT_MONTH_PREVIEW', userId: admin.userId });
    expect(previews.length).toBe(12);
    expect(previews[0]!.body).toContain('Beta');
    expect(previews[0]!.body).toContain('Alpha');
    // The 1st of each month from December (the simulation starts on 8 November).
    const reports = await note({ type: 'MONTHLY_SUMMARY', userId: admin.userId });
    expect(reports.length).toBe(11);
    expect(reports[0]!.title).toMatch(/report is ready/);
    // The restricted member's summaries only ever mention their company.
    const alf = [...(await note({ type: 'NEXT_MONTH_PREVIEW', userId: alphaOnly.userId })), ...(await note({ type: 'MONTHLY_SUMMARY', userId: alphaOnly.userId }))];
    expect(alf.length).toBe(23);
    expect(alf.some((n) => n.body.includes('Beta'))).toBe(false);
  });

  it('never duplicates anything', async () => {
    const all = await ctx.db.notification.findMany({ where: { workspaceId } });
    expect(new Set(all.map((n) => n.dedupeKey)).size).toBe(all.length);
  });

  it('history keeps the actual amounts of the variable bill', async () => {
    const cycles = (await as(admin).get(`/api/v1/bills/${electricity}/cycles`).query({ from: '2026-11-01', to: '2027-10-31' })).body.cycles;
    expect(cycles.length).toBe(12);
    expect(cycles.every((c: { kind: string; expectedCents: number; state: string }) => c.kind === 'closed' && c.expectedCents === 31_500 && c.state === 'PAID')).toBe(true);
  });
});

describe('per-company notification switches', () => {
  it('turning a company’s reminders off stops them for that person only', async () => {
    const res = await as(admin).patch('/api/v1/notifications/preferences').send({ companies: { [beta]: { reminders: false } } });
    expect(res.body.companies).toEqual({ [beta]: { reminders: false } });
    await ctx.db.notification.deleteMany({});
    // Beta's rent is due on the 10th; the 3-days-before reminder is on 7 Nov 2027.
    await day('2027-11-07');
    const rent = (await note({ type: 'REMINDER' })).filter((n) => n.body.includes('Studio rent'));
    expect(rent.some((n) => n.userId === admin.userId)).toBe(false);
    // A company the person can't see is ignored.
    const alf = await as(alphaOnly).patch('/api/v1/notifications/preferences').send({ companies: { [beta]: { reminders: false } } });
    expect(alf.body.companies).toEqual({});
  });
});
