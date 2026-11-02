import { Prisma, type FrequencyUnit, type PaymentMethod, type Role } from '../../generated/prisma/client.js';
import { hashPassword } from '../../lib/password.js';
import type { Db } from '../client.js';
import { DEFAULT_REMINDER_OFFSETS, ensureDefaultCategories } from '../defaults.js';

/**
 * Demo workspace from the brief: "Kigali Today Ltd" with two platforms and the six
 * listed obligations, plus monthly / weekly / quarterly / 6-monthly / one-time items so
 * every frequency is exercised. Used by `prisma db seed` and the reminder simulation test.
 */

export interface SeedOptions {
  /** Password for every demo user. */
  password: string;
  /** Faster hashing for tests (pre-computed hash). */
  passwordHash?: string;
}

interface DemoObligation {
  key: string;
  platform: 'KT Radio' | 'KigaliToday' | null;
  category: string;
  name: string;
  provider: string;
  icon?: string;
  amountMinor: number;
  currency: string;
  unit: FrequencyUnit;
  interval: number;
  anchorDay?: number;
  startDate: string;
  nextDueDate: string;
  assignee: 'anitha' | 'isaac' | 'nadine' | 'eric' | null;
  department?: 'Technology' | 'Operations';
}

export const DEMO_OBLIGATIONS: readonly DemoObligation[] = [
  // The six from the brief.
  { key: 'ktr-hosting', platform: 'KT Radio', category: 'Hosting & domains', name: 'Hosting', provider: 'DigitalOcean', icon: 'cloud', amountMinor: 13200, currency: 'USD', unit: 'YEAR', interval: 1, startDate: '2024-10-02', nextDueDate: '2027-10-02', assignee: 'nadine', department: 'Technology' },
  { key: 'ktr-domain', platform: 'KT Radio', category: 'Hosting & domains', name: 'Domain', provider: 'Namecheap', icon: 'globe', amountMinor: 18880, currency: 'RWF', unit: 'YEAR', interval: 1, startDate: '2024-02-26', nextDueDate: '2027-02-26', assignee: 'nadine', department: 'Technology' },
  { key: 'ktr-x', platform: 'KT Radio', category: 'Marketing', name: 'X subscription', provider: 'X Premium', icon: 'sparkles', amountMinor: 4800, currency: 'USD', unit: 'YEAR', interval: 1, startDate: '2025-09-16', nextDueDate: '2027-09-16', assignee: 'anitha' },
  { key: 'kt-hosting', platform: 'KigaliToday', category: 'Hosting & domains', name: 'Hosting', provider: 'AWS', icon: 'cloud', amountMinor: 152300, currency: 'USD', unit: 'YEAR', interval: 1, startDate: '2023-10-20', nextDueDate: '2026-10-20', assignee: 'nadine', department: 'Technology' },
  { key: 'kt-domain', platform: 'KigaliToday', category: 'Hosting & domains', name: 'Domain', provider: 'Cloudflare Registrar', icon: 'globe', amountMinor: 2200, currency: 'USD', unit: 'YEAR', interval: 1, startDate: '2024-08-24', nextDueDate: '2027-08-24', assignee: 'nadine', department: 'Technology' },
  { key: 'kt-cloudflare', platform: 'KigaliToday', category: 'Technology & software', name: 'Cloudflare', provider: 'Cloudflare Pro', icon: 'cloud', amountMinor: 24000, currency: 'USD', unit: 'YEAR', interval: 1, startDate: '2024-01-30', nextDueDate: '2026-01-30', assignee: 'anitha' },
  // Extra frequencies.
  { key: 'internet', platform: null, category: 'Communication & internet', name: 'Office internet', provider: 'MTN Rwanda Fibre', amountMinor: 85000, currency: 'RWF', unit: 'MONTH', interval: 1, startDate: '2025-01-05', nextDueDate: '2026-11-05', assignee: 'isaac', department: 'Operations' },
  { key: 'rent', platform: null, category: 'Office', name: 'Office rent', provider: 'Kigali Heights', icon: 'house', amountMinor: 120000, currency: 'USD', unit: 'MONTH', interval: 1, anchorDay: 31, startDate: '2025-01-31', nextDueDate: '2026-11-30', assignee: 'isaac', department: 'Operations' },
  { key: 'cleaning', platform: null, category: 'Office', name: 'Cleaning service', provider: 'CleanPro Kigali', icon: 'sparkles', amountMinor: 25000, currency: 'RWF', unit: 'WEEK', interval: 1, startDate: '2026-01-02', nextDueDate: '2026-11-06', assignee: 'eric', department: 'Operations' },
  { key: 'workspace', platform: null, category: 'Technology & software', name: 'Google Workspace', provider: 'Google', amountMinor: 43200, currency: 'USD', unit: 'MONTH', interval: 3, startDate: '2025-12-15', nextDueDate: '2026-12-15', assignee: 'anitha' },
  { key: 'insurance', platform: null, category: 'Insurance', name: 'Equipment insurance', provider: 'Radiant Insurance', amountMinor: 450000, currency: 'RWF', unit: 'MONTH', interval: 6, startDate: '2026-01-15', nextDueDate: '2027-01-15', assignee: 'isaac' },
  { key: 'redesign', platform: 'KigaliToday', category: 'Marketing', name: 'Website redesign (final instalment)', provider: 'Studio Imbuto', amountMinor: 90000, currency: 'USD', unit: 'ONCE', interval: 1, startDate: '2026-11-20', nextDueDate: '2026-11-20', assignee: 'anitha' },
];

/** Past payments so history, reports and the dashboard have data. */
const DEMO_PAYMENTS: { key: string; cycleDueDate: string; paidOn: string; amountMinor?: number; method: PaymentMethod; reference?: string }[] = [
  { key: 'ktr-hosting', cycleDueDate: '2025-10-02', paidOn: '2025-09-30', method: 'CARD' },
  { key: 'ktr-hosting', cycleDueDate: '2026-10-02', paidOn: '2026-10-01', method: 'CARD', reference: 'DO-88213' },
  { key: 'ktr-domain', cycleDueDate: '2026-02-26', paidOn: '2026-02-20', method: 'MOBILE_MONEY', reference: 'MOMO-55120' },
  { key: 'ktr-x', cycleDueDate: '2026-09-16', paidOn: '2026-09-15', method: 'CARD' },
  { key: 'kt-domain', cycleDueDate: '2026-08-24', paidOn: '2026-08-22', method: 'CARD' },
  { key: 'kt-cloudflare', cycleDueDate: '2025-01-30', paidOn: '2025-01-30', method: 'BANK_TRANSFER', reference: 'TXN-482913' },
  { key: 'kt-hosting', cycleDueDate: '2025-10-20', paidOn: '2025-10-18', method: 'BANK_TRANSFER' },
  { key: 'internet', cycleDueDate: '2026-09-05', paidOn: '2026-09-04', method: 'MOBILE_MONEY' },
  { key: 'internet', cycleDueDate: '2026-10-05', paidOn: '2026-10-05', method: 'MOBILE_MONEY' },
  { key: 'rent', cycleDueDate: '2026-09-30', paidOn: '2026-09-29', method: 'BANK_TRANSFER' },
  { key: 'rent', cycleDueDate: '2026-10-31', paidOn: '2026-10-30', method: 'BANK_TRANSFER' },
  { key: 'cleaning', cycleDueDate: '2026-10-23', paidOn: '2026-10-23', method: 'CASH' },
  { key: 'cleaning', cycleDueDate: '2026-10-30', paidOn: '2026-10-30', method: 'CASH' },
  // Partial payment on the open Google Workspace cycle.
  { key: 'workspace', cycleDueDate: '2026-12-15', paidOn: '2026-10-28', amountMinor: 20000, method: 'CARD' },
];

export const DEMO_USERS = {
  anitha: { name: 'Anitha Uwase', email: 'anitha@kigalitoday.com', role: 'ADMIN' as Role, department: null },
  isaac: { name: 'Isaac Mugisha', email: 'isaac@kigalitoday.com', role: 'FINANCE' as Role, department: null },
  nadine: { name: 'Nadine Keza', email: 'nadine@kigalitoday.com', role: 'DEPARTMENT' as Role, department: 'Technology' },
  eric: { name: 'Eric Nshuti', email: 'eric@kigalitoday.com', role: 'EMPLOYEE' as Role, department: 'Operations' },
} as const;

export type DemoUserKey = keyof typeof DEMO_USERS;

export interface DemoSeedResult {
  organizationId: string;
  userIds: Record<DemoUserKey, string>;
  obligationIds: Record<string, string>;
}

function dayOf(isoDate: string): number {
  return Number(isoDate.slice(8, 10));
}

export async function seedDemo(db: Db, options: SeedOptions): Promise<DemoSeedResult> {
  const categories = await ensureDefaultCategories(db);
  const passwordHash = options.passwordHash ?? (await hashPassword(options.password));

  const org = await db.organization.create({
    data: {
      name: 'Kigali Today Ltd',
      type: 'COMPANY',
      defaultCurrency: 'USD',
      timezone: 'Africa/Kigali',
      reminderHour: 9,
      defaultReminderOffsets: [...DEFAULT_REMINDER_OFFSETS],
      exchangeRates: { create: [{ fromCurrency: 'RWF', rate: new Prisma.Decimal('0.00069') }] },
    },
  });

  const departments = {
    Technology: await db.department.create({ data: { organizationId: org.id, name: 'Technology' } }),
    Operations: await db.department.create({ data: { organizationId: org.id, name: 'Operations' } }),
  };

  const userIds = {} as Record<DemoUserKey, string>;
  for (const [key, u] of Object.entries(DEMO_USERS) as [DemoUserKey, (typeof DEMO_USERS)[DemoUserKey]][]) {
    const user = await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: { name: u.name, email: u.email, passwordHash, emailVerifiedAt: new Date('2026-01-01T00:00:00Z') },
    });
    await db.membership.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        role: u.role,
        departmentId: u.department ? departments[u.department].id : null,
      },
    });
    await db.notificationPreference.create({
      data: { userId: user.id, organizationId: org.id, mutedObligationIds: [] },
    });
    userIds[key] = user.id;
  }

  const platforms = {
    'KT Radio': await db.platform.create({ data: { organizationId: org.id, name: 'KT Radio', color: '#0F5C5C' } }),
    KigaliToday: await db.platform.create({ data: { organizationId: org.id, name: 'KigaliToday', color: '#3B82F6' } }),
  };

  const obligationIds: Record<string, string> = {};
  for (const o of DEMO_OBLIGATIONS) {
    const category = categories.get(o.category);
    if (!category) throw new Error(`Unknown category ${o.category}`);
    const row = await db.obligation.create({
      data: {
        organizationId: org.id,
        platformId: o.platform ? platforms[o.platform].id : null,
        categoryId: category.id,
        departmentId: o.department ? departments[o.department].id : null,
        assigneeUserId: o.assignee ? userIds[o.assignee] : null,
        name: o.name,
        provider: o.provider,
        icon: o.icon ?? null,
        amountMinor: o.amountMinor,
        currency: o.currency,
        frequencyUnit: o.unit,
        frequencyInterval: o.interval,
        anchorDay: o.anchorDay ?? dayOf(o.nextDueDate),
        startDate: o.startDate,
        nextDueDate: o.nextDueDate,
        reminderOffsets: [...DEFAULT_REMINDER_OFFSETS],
        createdById: userIds.anitha,
      },
    });
    obligationIds[o.key] = row.id;
  }

  for (const p of DEMO_PAYMENTS) {
    const o = DEMO_OBLIGATIONS.find((x) => x.key === p.key);
    const obligationId = obligationIds[p.key];
    if (!o || !obligationId) throw new Error(`Unknown obligation ${p.key}`);
    await db.paymentRecord.create({
      data: {
        organizationId: org.id,
        obligationId,
        cycleDueDate: p.cycleDueDate,
        amountMinor: p.amountMinor ?? o.amountMinor,
        currency: o.currency,
        paidOn: p.paidOn,
        method: p.method,
        reference: p.reference ?? null,
        recordedById: o.assignee === 'eric' ? userIds.isaac : userIds.anitha,
      },
    });
  }

  return { organizationId: org.id, userIds, obligationIds };
}
