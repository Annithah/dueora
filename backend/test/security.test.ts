/**
 * Route-level security sweep. Walks every route the API registers, so a new route is
 * checked automatically:
 *  1. without a token → 401 (except the deliberately public ones)
 *  2. as a signed-in user of ANOTHER workspace → 404 on every workspace-scoped route
 *  3. auth endpoints are rate limited
 */
import { readFileSync } from 'node:fs';

import type { Router } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { authLimiter } from '../src/http/rateLimits.js';
import { aiRouter } from '../src/ai/routes.js';
import { feedbackRouter } from '../src/modules/account/routes.js';
import { authRouter, meRouter } from '../src/modules/auth/routes.js';
import { budgetsRouter } from '../src/modules/budgets/routes.js';
import { importRouter } from '../src/modules/import/routes.js';
import { catalogRouter } from '../src/modules/catalog/routes.js';
import { companiesRouter } from '../src/modules/companies/routes.js';
import { insightsRouter } from '../src/modules/insights/routes.js';
import { billsRouter } from '../src/modules/bills/routes.js';
import { paymentsRouter } from '../src/modules/payments/routes.js';
import { publicRouter, workspacesRouter } from '../src/modules/workspaces/routes.js';
import { notificationsRouter } from '../src/notifications/routes.js';
import { helpRouter } from '../src/routes/help.js';

import { client, createWorkspace, register, type Session } from './helpers/api.js';
import { createTestContext } from './helpers/context.js';
import { buildFixture, type Fixture } from './helpers/fixture.js';

const ctx = createTestContext({}, { ACCESS_TOKEN_TTL_MINUTES: '100000' });
const app = createApp(ctx);

interface RouteInfo {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  path: string;
}

function routesOf(prefix: string, router: Router): RouteInfo[] {
  const out: RouteInfo[] = [];
  for (const layer of router.stack as { route?: { path: string; methods: Record<string, boolean> } }[]) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
      out.push({ method: method as RouteInfo['method'], path: `${prefix}${layer.route.path === '/' ? '' : layer.route.path}` });
    }
  }
  return out;
}

const ALL: RouteInfo[] = [
  ...routesOf('/api/v1/auth', authRouter(ctx)),
  ...routesOf('/api/v1/me', meRouter(ctx)),
  ...routesOf('/api/v1/workspaces', workspacesRouter(ctx)),
  ...routesOf('/api/v1/bills', billsRouter(ctx)),
  ...routesOf('/api/v1/companies', companiesRouter(ctx)),
  ...routesOf('/api/v1/budgets', budgetsRouter(ctx)),
  ...routesOf('/api/v1/import', importRouter(ctx)),
  ...routesOf('/api/v1/feedback', feedbackRouter(ctx)),
  ...routesOf('/api/v1', catalogRouter(ctx)),
  ...routesOf('/api/v1', paymentsRouter(ctx)),
  ...routesOf('/api/v1', notificationsRouter(ctx)),
  ...routesOf('/api/v1', insightsRouter(ctx)),
  ...routesOf('/api/v1/public', publicRouter(ctx)),
  ...routesOf('/api/v1/help', helpRouter(ctx)),
  ...routesOf('/api/v1/ai', aiRouter(ctx)),
];

/** Routes that work without a token, on purpose. */
const PUBLIC = new Set([
  'post /api/v1/auth/register',
  'post /api/v1/auth/login',
  'post /api/v1/auth/refresh',
  'post /api/v1/auth/logout',
  'post /api/v1/auth/password/forgot',
  'post /api/v1/auth/password/reset',
  'get /api/v1/public/invites/preview',
  // Signed link from email footers; a bad token is a 400 page, never data.
  'get /api/v1/public/unsubscribe',
  'post /api/v1/public/unsubscribe',
  // The FAQ: product help, no customer data.
  'get /api/v1/help/articles',
]);

/** Account-level routes (signed in, but not tied to a workspace). */
const ACCOUNT = new Set([
  'get /api/v1/me',
  'patch /api/v1/me',
  'post /api/v1/me/password',
  'delete /api/v1/me',
  'post /api/v1/auth/logout-all',
  'post /api/v1/auth/verify-email/request',
  'post /api/v1/auth/verify-email',
  'post /api/v1/feedback',
  'get /api/v1/workspaces',
  'post /api/v1/workspaces',
  'post /api/v1/workspaces/accept-invite',
  'post /api/v1/devices',
  'delete /api/v1/devices',
]);

const key = (r: RouteInfo) => `${r.method} ${r.path}`;
let fx: Fixture;
let outsider: Session;
let ids: Record<string, string>;

/** Fill :params with real ids from the fixture workspace (the victim). */
function concrete(path: string): string {
  return path
    .replace(/\/bills\/:id/, `/bills/${ids.bill}`)
    .replace(/\/payments\/:id/, `/payments/${ids.payment}`)
    .replace(/\/companies\/:id/, `/companies/${ids.company}`)
    .replace(/\/categories\/:id/, `/categories/${ids.category}`)
    .replace(/\/members\/:id/, `/members/${ids.member}`)
    .replace(/\/invites\/:id/, `/invites/${ids.invite}`)
    .replace(/\/notifications\/:id/, `/notifications/${ids.notification}`);
}

beforeAll(async () => {
  ctx.clock.set('2026-11-02T07:00:00Z');
  fx = await buildFixture(app, ctx);
  const a = fx.as('admin');
  const pay = await a.post(`/api/v1/bills/${fx.billIds.internet}/payments`).send({ method: 'CASH' });
  const cat = await a.post('/api/v1/categories').send({ name: 'Victim cat', icon: 'tag', color: '#111111' });
  const inv = await a.post('/api/v1/workspaces/current/invites').send({ email: 'someone@fixture.test', role: 'VIEWER' });
  const members = await a.get('/api/v1/workspaces/current/members');
  await a.post('/api/v1/notifications/test');
  const note = await ctx.db.notification.findFirstOrThrow({ where: { workspaceId: fx.workspaceId } });
  ids = {
    bill: fx.billIds.internet,
    payment: pay.body.payment.id,
    company: fx.companies.beta,
    category: cat.body.id,
    invite: inv.body.id,
    member: members.body.find((m: { role: string }) => m.role === 'VIEWER').id,
    notification: note.id,
  };
  outsider = await register(app, 'Outsider', 'outsider@security.test');
  await createWorkspace(app, outsider, 'Outsider Co');
});

afterAll(async () => {
  await ctx.db.$disconnect();
});

describe('route inventory', () => {
  it('sweeps every router mounted in src/routes/index.ts', () => {
    const mounted = [...readFileSync('src/routes/index.ts', 'utf8').matchAll(/router\.use\('[^']*', (\w+)\(ctx\)\)/g)].map((m) => m[1]!);
    const self = readFileSync('test/security.test.ts', 'utf8');
    expect(mounted.length).toBeGreaterThan(8);
    for (const name of mounted) expect(self, `${name} is mounted but not swept`).toContain(`${name}(ctx)),`);
  });

  it('finds every route', () => {
    expect(ALL.length).toBeGreaterThan(50);
    const unknown = [...PUBLIC, ...ACCOUNT].filter((k) => !ALL.some((r) => key(r) === k));
    expect(unknown).toEqual([]);
  });
});

describe('authentication is required everywhere except public routes', () => {
  it.each(ALL.filter((r) => !PUBLIC.has(key(r))).map((r) => [key(r), r] as const))('%s → 401 without a token', async (_k, r) => {
    const res = await request(app)[r.method](concrete(r.path)).send({});
    expect(res.status).toBe(401);
  });

  it.each(ALL.filter((r) => !PUBLIC.has(key(r))).map((r) => [key(r), r] as const))('%s → 401 with a forged token', async (_k, r) => {
    const res = await request(app)[r.method](concrete(r.path)).set('Authorization', 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.').send({});
    expect(res.status).toBe(401);
  });
});

describe("another workspace's data is never reachable", () => {
  const scoped = ALL.filter((r) => !PUBLIC.has(key(r)) && !ACCOUNT.has(key(r)));

  it.each(scoped.map((r) => [key(r), r] as const))('%s → 404 for an outsider using the victim workspace id', async (_k, r) => {
    const res = await client(app, outsider, fx.workspaceId)[r.method](concrete(r.path)).send({});
    expect(res.status).toBe(404);
  });

  it('left every victim record untouched', async () => {
    expect(await ctx.db.bill.findUnique({ where: { id: ids.bill } })).not.toBeNull();
    expect(await ctx.db.paymentRecord.findUnique({ where: { id: ids.payment } })).not.toBeNull();
    expect(await ctx.db.company.findUnique({ where: { id: ids.company } })).not.toBeNull();
    expect(await ctx.db.category.findUnique({ where: { id: ids.category } })).not.toBeNull();
    expect(await ctx.db.membership.findUnique({ where: { id: ids.member } })).not.toBeNull();
    expect((await ctx.db.workspace.findUniqueOrThrow({ where: { id: fx.workspaceId } })).name).toBe('Fixture Media');
  });
});

describe('hardening', () => {
  it('rate limits credential endpoints', async () => {
    const express = (await import('express')).default;
    const limited = express();
    limited.use(express.json());
    limited.post('/login', authLimiter(ctx, { limit: 10, windowMinutes: 15, force: true }), (_req, res) => {
      res.status(401).json({});
    });
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await request(limited).post('/login').send({ email: 'a@b.co', password: 'x' })).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    // A different email from the same IP has its own budget.
    expect((await request(limited).post('/login').send({ email: 'c@d.co', password: 'x' })).status).toBe(401);
  });

  it('rejects oversized JSON bodies', async () => {
    const res = await request(app).post('/api/v1/auth/login').set('content-type', 'application/json').send(`{"email":"${'a'.repeat(1_100_000)}"}`);
    expect(res.status).toBe(413);
  });

  it('never leaks stack traces or internals', async () => {
    const res = await request(app).get('/api/v1/bills/x').set('Authorization', 'Bearer nope');
    expect(JSON.stringify(res.body)).not.toMatch(/at \w+ \(|node_modules|prisma/i);
  });

  it('sends security headers', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['content-security-policy']).toBeDefined();
  });
});
