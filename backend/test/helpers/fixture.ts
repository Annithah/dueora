/**
 * TEST-ONLY fixtures. They are created through the public API inside each test file's
 * own throw-away SQLite database (see helpers/context.ts) and never touch a development
 * or production database. The app itself ships no demo data.
 */
import type { Express } from 'express';

import { addMember, client, register, type Session } from './api.js';
import type { TestContext } from './context.js';

export const USERS = {
  admin: { name: 'Ada Admin', email: 'ada@fixture.test' },
  finance: { name: 'Finn Finance', email: 'finn@fixture.test' },
  viewer: { name: 'Vera Viewer', email: 'vera@fixture.test' },
} as const;
export type UserKey = keyof typeof USERS;

/**
 * Subscriptions as seen on 2 Nov 2026 (09:00 Kigali). Keys are stable handles for tests.
 * `paid` adds a partial payment for the open cycle.
 */
export const SUBSCRIPTIONS = [
  { key: 'internet', name: 'Internet', company: 'alpha', category: 'Communication & internet', amountCents: 12_000, unit: 'MONTH', interval: 1, due: '2026-11-05' },
  { key: 'cleaning', name: 'Cleaning', company: 'alpha', category: 'Office & rent', amountCents: 4_000, unit: 'WEEK', interval: 1, due: '2026-11-06' },
  { key: 'rent', name: 'Office rent', company: 'alpha', category: 'Office & rent', amountCents: 80_000, unit: 'MONTH', interval: 1, due: '2026-11-30', anchorDay: 31 },
  { key: 'workspace', name: 'Google Workspace', company: 'alpha', category: 'Technology & software', amountCents: 43_200, unit: 'MONTH', interval: 3, due: '2026-12-15', paid: 20_000 },
  { key: 'redesign', name: 'Website redesign', company: 'alpha', category: 'Marketing', amountCents: 150_000, unit: 'ONCE', interval: 1, due: '2027-01-20' },
  { key: 'insurance', name: 'Insurance', company: 'alpha', category: 'Insurance', amountCents: 90_000, unit: 'YEAR', interval: 1, due: '2027-01-10' },
  { key: 'alpha-domain', name: 'Domain', company: 'alpha', category: 'Hosting & domains', amountCents: 1_300, unit: 'YEAR', interval: 1, due: '2027-03-10' },
  { key: 'alpha-hosting', name: 'Hosting', company: 'alpha', category: 'Hosting & domains', amountCents: 152_300, unit: 'YEAR', interval: 1, due: '2026-10-20' },
  { key: 'alpha-cdn', name: 'Cloudflare', company: 'alpha', category: 'Hosting & domains', amountCents: 24_000, unit: 'YEAR', interval: 1, due: '2026-01-30' },
  { key: 'beta-x', name: 'X subscription', company: 'beta', category: 'Social media', amountCents: 800, unit: 'MONTH', interval: 1, due: '2026-11-20' },
  { key: 'beta-hosting', name: 'Hosting', company: 'beta', category: 'Hosting & domains', amountCents: 13_200, unit: 'YEAR', interval: 1, due: '2027-10-02' },
  { key: 'beta-domain', name: 'Domain renewal', company: 'beta', category: 'Hosting & domains', amountCents: 1_300, unit: 'YEAR', interval: 1, due: '2027-02-26' },
] as const;
export type SubscriptionKey = (typeof SUBSCRIPTIONS)[number]['key'];

export interface Fixture {
  workspaceId: string;
  companies: { alpha: string; beta: string };
  categories: Record<string, string>;
  sessions: Record<UserKey, Session>;
  userIds: Record<UserKey, string>;
  subscriptionIds: Record<SubscriptionKey, string>;
  as: (who: UserKey) => ReturnType<typeof client>;
}

/** Admin + workspace + companies, then FINANCE and VIEWER members, then the subscriptions. */
export async function buildFixture(app: Express, ctx: TestContext, opts: { subscriptions?: boolean } = {}): Promise<Fixture> {
  const admin = await register(app, USERS.admin.name, USERS.admin.email);
  const created = await client(app, admin)
    .post('/api/v1/workspaces')
    .send({ name: 'Fixture Media', type: 'COMPANY', timezone: 'Africa/Kigali', firstCompanyName: 'Alpha News' });
  if (created.status !== 201) throw new Error(`workspace: ${created.status} ${JSON.stringify(created.body)}`);
  const workspaceId = created.body.id as string;
  const as0 = client(app, admin, workspaceId);

  const companiesRes = await as0.get('/api/v1/companies');
  const alpha = companiesRes.body[0].id as string;
  const beta = (await as0.post('/api/v1/companies').send({ name: 'Beta Radio', color: '#3B82F6' })).body.id as string;
  const cats = await as0.get('/api/v1/categories');
  const categories = Object.fromEntries((cats.body as { name: string; id: string }[]).map((c) => [c.name, c.id]));

  const finance = await addMember(app, ctx, admin, workspaceId, USERS.finance.name, USERS.finance.email, 'FINANCE');
  const viewer = await addMember(app, ctx, admin, workspaceId, USERS.viewer.name, USERS.viewer.email, 'VIEWER');
  const sessions = { admin, finance, viewer };
  const as = (who: UserKey) => client(app, sessions[who], workspaceId);

  const subscriptionIds = {} as Record<SubscriptionKey, string>;
  if (opts.subscriptions !== false) {
    for (const s of SUBSCRIPTIONS) {
      const res = await as('admin')
        .post('/api/v1/subscriptions')
        .send({
          name: s.name,
          companyId: s.company === 'alpha' ? alpha : beta,
          categoryId: categories[s.category],
          amountCents: s.amountCents,
          frequencyUnit: s.unit,
          frequencyInterval: s.interval,
          startDate: s.due,
          nextDueDate: s.due,
          ...('anchorDay' in s ? { anchorDay: s.anchorDay } : {}),
        });
      if (res.status !== 201) throw new Error(`subscription ${s.key}: ${res.status} ${JSON.stringify(res.body)}`);
      subscriptionIds[s.key] = res.body.id;
      if ('paid' in s) {
        const pay = await as('finance')
          .post(`/api/v1/subscriptions/${res.body.id}/payments`)
          .send({ amountCents: s.paid, paidOn: '2026-10-20', method: 'BANK_TRANSFER' });
        if (pay.status !== 201) throw new Error(`payment ${s.key}: ${pay.status} ${JSON.stringify(pay.body)}`);
      }
    }
  }

  return {
    workspaceId,
    companies: { alpha, beta },
    categories,
    sessions,
    userIds: { admin: admin.userId, finance: finance.userId, viewer: viewer.userId },
    subscriptionIds,
    as,
  };
}
