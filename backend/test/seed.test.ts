import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DEMO_OBLIGATIONS, seedDemo, type DemoSeedResult } from '../src/db/seed/demo.js';
import { verifyPassword } from '../src/lib/password.js';

import { createTestContext } from './helpers/context.js';

const ctx = createTestContext();
let seeded: DemoSeedResult;

beforeAll(async () => {
  seeded = await seedDemo(ctx.db, { password: 'demo-password-123' });
});

afterAll(async () => {
  await ctx.db.$disconnect();
});

describe('seedDemo', () => {
  it('creates the Kigali Today workspace in Africa/Kigali with USD', async () => {
    const org = await ctx.db.organization.findUniqueOrThrow({ where: { id: seeded.organizationId } });
    expect(org).toMatchObject({ name: 'Kigali Today Ltd', timezone: 'Africa/Kigali', defaultCurrency: 'USD', reminderHour: 9 });
  });

  it('creates the four team members with their roles', async () => {
    const members = await ctx.db.membership.findMany({
      where: { organizationId: seeded.organizationId },
      include: { user: true },
    });
    expect(members.map((m) => [m.user.email, m.role]).sort()).toEqual([
      ['anitha@kigalitoday.com', 'ADMIN'],
      ['eric@kigalitoday.com', 'EMPLOYEE'],
      ['isaac@kigalitoday.com', 'FINANCE'],
      ['nadine@kigalitoday.com', 'DEPARTMENT'],
    ]);
    const anitha = await ctx.db.user.findUniqueOrThrow({ where: { email: 'anitha@kigalitoday.com' } });
    expect(await verifyPassword(anitha.passwordHash, 'demo-password-123')).toBe(true);
  });

  it('includes the six obligations from the brief with exact amounts and dates', async () => {
    const rows = await ctx.db.obligation.findMany({
      where: { organizationId: seeded.organizationId },
      include: { platform: true },
    });
    const brief = rows
      .filter((r) => r.platform)
      .filter((r) => !r.name.startsWith('Website'))
      .map((r) => [r.platform?.name, r.name, r.amountMinor, r.currency, r.frequencyUnit, r.nextDueDate])
      .sort();
    expect(brief).toEqual(
      [
        ['KT Radio', 'Hosting', 13200, 'USD', 'YEAR', '2027-10-02'],
        ['KT Radio', 'Domain', 18880, 'RWF', 'YEAR', '2027-02-26'],
        ['KT Radio', 'X subscription', 4800, 'USD', 'YEAR', '2027-09-16'],
        ['KigaliToday', 'Hosting', 152300, 'USD', 'YEAR', '2026-10-20'],
        ['KigaliToday', 'Domain', 2200, 'USD', 'YEAR', '2027-08-24'],
        ['KigaliToday', 'Cloudflare', 24000, 'USD', 'YEAR', '2026-01-30'],
      ].sort(),
    );
  });

  it('exercises every frequency', async () => {
    const units = new Set(DEMO_OBLIGATIONS.map((o) => `${o.unit}:${o.interval}`));
    expect(units).toEqual(new Set(['YEAR:1', 'MONTH:1', 'WEEK:1', 'MONTH:3', 'MONTH:6', 'ONCE:1']));
    const rent = await ctx.db.obligation.findUniqueOrThrow({ where: { id: seeded.obligationIds.rent } });
    expect(rent.anchorDay).toBe(31);
  });

  it('stores money as integers and JSON offsets', async () => {
    const o = await ctx.db.obligation.findFirstOrThrow({ where: { organizationId: seeded.organizationId } });
    expect(Number.isInteger(o.amountMinor)).toBe(true);
    expect(o.reminderOffsets).toEqual([30, 14, 7, 3, 1, 0, -1, -3, -7]);
    expect(await ctx.db.paymentRecord.count({ where: { organizationId: seeded.organizationId } })).toBeGreaterThan(10);
  });
});
