import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { addDays, localTimeIn } from '../src/domain/schedule.js';
import { workOnce } from '../src/notifications/scheduler.js';

import { addMember, client, register, type Session } from './helpers/api.js';
import { createTestContext } from './helpers/context.js';

/**
 * A full year with a fake clock, three fictional organisations in three timezones.
 * Each has a monthly bill that is paid on its due date and one that is never
 * paid (archived after three months). Asserts: reminders land on the right local day,
 * every member gets them, nothing is ever duplicated, paying stops reminders at once,
 * overdue follow-ups run 1, 3, 7 days then weekly, and archiving stops them.
 */
const ctx = createTestContext({}, { ACCESS_TOKEN_TTL_MINUTES: '10000000', REFRESH_TOKEN_TTL_DAYS: '3650' });
const app: Express = createApp(ctx);

const ORGS = [
  { key: 'school', name: 'Kowhai Primary School', tz: 'Pacific/Auckland', admin: 'aroha@kowhai-school.test' },
  { key: 'clinic', name: 'Hudson Family Clinic', tz: 'America/New_York', admin: 'mara@hudson-clinic.test' },
  { key: 'ngo', name: 'Thames Food Bank', tz: 'Europe/London', admin: 'priya@thames-foodbank.test' },
] as const;

interface Org {
  key: string;
  tz: string;
  workspaceId: string;
  admin: Session;
  memberIds: string[];
  paidSub: string;
  unpaidSub: string;
}
const orgs: Org[] = [];
const START = '2026-11-02T00:00:00Z';
const OFFSETS = [7, 3, 1, 0, -1, -3, -7];

beforeAll(async () => {
  ctx.clock.set(START);
  for (const o of ORGS) {
    const admin = await register(app, `${o.key} admin`, o.admin);
    const ws = await client(app, admin).post('/api/v1/workspaces').send({ name: o.name, timezone: o.tz, firstCompanyName: o.name });
    const workspaceId = ws.body.id as string;
    const finance = await addMember(app, ctx, admin, workspaceId, `${o.key} finance`, `finance@${o.key}.test`, 'FINANCE');
    const viewer = await addMember(app, ctx, admin, workspaceId, `${o.key} viewer`, `viewer@${o.key}.test`, 'VIEWER');
    const as = client(app, admin, workspaceId);
    const company = (await as.get('/api/v1/companies')).body[0].id;
    const category = (await as.get('/api/v1/categories')).body.find((c: { name: string }) => c.name === 'Utilities').id;
    // Summaries are opt-in extras; this simulation is about reminders.
    await ctx.db.notificationPreference.updateMany({ where: { workspaceId }, data: { weeklySummary: false, monthlySummary: false } });
    const make = async (name: string, due: string) =>
      (
        await as.post('/api/v1/bills').send({
          name,
          companyId: company,
          categoryId: category,
          amountCents: 5_000,
          frequencyUnit: 'MONTH',
          startDate: due,
          nextDueDate: due,
          reminderOffsets: OFFSETS,
        })
      ).body.id as string;
    orgs.push({
      key: o.key,
      tz: o.tz,
      workspaceId,
      admin,
      memberIds: [admin.userId, finance.userId, viewer.userId],
      paidSub: await make('Electricity', '2026-11-15'),
      unpaidSub: await make('Water', '2026-11-20'),
    });
  }
  await ctx.db.notification.deleteMany({});
  await ctx.db.job.deleteMany({});

  // One year in 6-hour steps (00, 06, 12, 18 UTC hits 09:00+ local the same day everywhere).
  const end = new Date('2027-11-02T00:00:00Z').getTime();
  for (let t = new Date(START).getTime(); t < end; t += 6 * 3_600_000) {
    ctx.clock.set(new Date(t));
    await workOnce(ctx);
    for (const o of orgs) {
      const local = localTimeIn(ctx.clock.now(), o.tz);
      const as = client(app, o.admin, o.workspaceId);
      // Pay the "paid" bill on its due date, after that day's reminders went out.
      const paid = await ctx.db.bill.findUniqueOrThrow({ where: { id: o.paidSub } });
      if (paid.nextDueDate === local.date && local.hour >= 10) {
        const r = await as.post(`/api/v1/bills/${o.paidSub}/payments`).send({ method: 'BANK_TRANSFER', paidOn: local.date });
        expect(r.status).toBe(201);
      }
      // The unpaid one is archived once it's three months overdue.
      if (local.date === '2027-02-20') {
        const s = await ctx.db.bill.findUniqueOrThrow({ where: { id: o.unpaidSub } });
        if (s.status === 'ACTIVE') await as.post(`/api/v1/bills/${o.unpaidSub}/archive`);
      }
    }
  }
}, 900_000);

afterAll(async () => {
  await ctx.db.$disconnect();
});

const reminders = (workspaceId: string, billId: string) =>
  ctx.db.notification.findMany({
    where: { workspaceId, billId, channel: 'IN_APP', type: { in: ['REMINDER', 'DUE_TODAY', 'OVERDUE'] } },
    orderBy: { createdAt: 'asc' },
  });

describe('a year of reminders in three timezones', () => {
  it.each(ORGS.map((o) => [o.key]))('%s: every reminder lands on the right local day, for every member', async (key) => {
    const o = orgs.find((x) => x.key === key)!;
    const rows = [...(await reminders(o.workspaceId, o.paidSub)), ...(await reminders(o.workspaceId, o.unpaidSub))];
    expect(rows.length).toBeGreaterThan(100);
    for (const n of rows) {
      const localDay = localTimeIn(n.createdAt, o.tz).date;
      expect(localDay, `${n.type} for ${n.cycleDueDate} offset ${n.offsetDays}`).toBe(addDays(n.cycleDueDate!, -n.offsetDays!));
    }
    // Each (cycle, offset) reaches all three members exactly once.
    const byEvent = new Map<string, string[]>();
    for (const n of rows) byEvent.set(`${n.billId}:${n.cycleDueDate}:${n.offsetDays}`, [...(byEvent.get(`${n.billId}:${n.cycleDueDate}:${n.offsetDays}`) ?? []), n.userId]);
    for (const users of byEvent.values()) expect(users.sort()).toEqual([...o.memberIds].sort());
  });

  it.each(ORGS.map((o) => [o.key]))('%s: paying on the due date means no overdue reminders, ever', async (key) => {
    const o = orgs.find((x) => x.key === key)!;
    const rows = await reminders(o.workspaceId, o.paidSub);
    expect(rows.filter((n) => n.type === 'OVERDUE')).toHaveLength(0);
    // A due-today reminder for every one of the 12 monthly cycles.
    const dueToday = new Set(rows.filter((n) => n.type === 'DUE_TODAY').map((n) => n.cycleDueDate));
    expect(dueToday.size).toBe(12);
    // And the 7-day one for each (it never falls inside the previous cycle for a monthly bill).
    expect(new Set(rows.filter((n) => n.offsetDays === 7).map((n) => n.cycleDueDate)).size).toBe(12);
  });

  it.each(ORGS.map((o) => [o.key]))('%s: unpaid → 1, 3, 7 days overdue then weekly, and nothing after archiving', async (key) => {
    const o = orgs.find((x) => x.key === key)!;
    const rows = (await reminders(o.workspaceId, o.unpaidSub)).filter((n) => n.userId === o.memberIds[0]);
    expect(new Set(rows.map((n) => n.cycleDueDate))).toEqual(new Set(['2026-11-20'])); // the cycle never closes
    const overdue = rows.filter((n) => n.type === 'OVERDUE').map((n) => -n.offsetDays!);
    // 20 Nov → archived 20 Feb (92 days): 1, 3, 7, then 14, 21 … 91.
    expect(overdue).toEqual([1, 3, 7, 14, 21, 28, 35, 42, 49, 56, 63, 70, 77, 84, 91]);
    const last = rows.at(-1)!;
    expect(localTimeIn(last.createdAt, o.tz).date <= '2027-02-20').toBe(true);
  });

  it('never creates the same notification twice (dedupe keys are unique and complete)', async () => {
    const all = await ctx.db.notification.findMany({ select: { dedupeKey: true, type: true, channel: true } });
    expect(new Set(all.map((n) => n.dedupeKey)).size).toBe(all.length);
    for (const n of all) expect(n.dedupeKey.split(':')).toHaveLength(7);
  });

  it('keeps every workspace to its own data', async () => {
    for (const o of orgs) {
      const rows = await ctx.db.notification.findMany({ where: { workspaceId: o.workspaceId }, select: { userId: true, billId: true } });
      for (const n of rows) {
        expect(o.memberIds).toContain(n.userId);
        if (n.billId) expect([o.paidSub, o.unpaidSub]).toContain(n.billId);
      }
    }
  });
});
