import type { Express } from 'express';
import request from 'supertest';

import type { TestContext } from './context.js';

export interface Session {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

/** supertest wrapper that adds the bearer token and X-Org-Id header. */
export function client(app: Express, session?: Pick<Session, 'accessToken'> | null, orgId?: string | null) {
  const decorate = (r: request.Test) => {
    if (session) r.set('Authorization', `Bearer ${session.accessToken}`);
    if (orgId) r.set('X-Org-Id', orgId);
    return r;
  };
  const base = request(app);
  return {
    get: (url: string) => decorate(base.get(url)),
    post: (url: string) => decorate(base.post(url)),
    patch: (url: string) => decorate(base.patch(url)),
    put: (url: string) => decorate(base.put(url)),
    delete: (url: string) => decorate(base.delete(url)),
  };
}

export async function register(app: Express, name: string, email: string, password = 'correct-horse-9'): Promise<Session> {
  const res = await request(app).post('/api/v1/auth/register').send({ name, email, password });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { userId: res.body.user.id, email, accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
}

export async function login(app: Express, email: string, password: string): Promise<Session> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { userId: res.body.user.id, email, accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
}

/** Pull the 6-digit code out of the most recent email to `to`. */
export function lastCode(ctx: TestContext, to: string): string {
  const msg = ctx.mailer.lastTo(to);
  const code = msg?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`No code emailed to ${to}`);
  return code;
}

/** Pull the invite token out of the most recent invite email to `to`. */
export function lastInviteToken(ctx: TestContext, to: string): string {
  const msg = [...ctx.mailer.sent].reverse().find((m) => m.to === to && m.tag === 'invite');
  const token = msg?.text.match(/token=([\w%-]+)/)?.[1];
  if (!token) throw new Error(`No invite emailed to ${to}`);
  return decodeURIComponent(token);
}

export async function createWorkspace(app: Express, session: Session, name = 'Acme Ltd'): Promise<string> {
  const res = await client(app, session).post('/api/v1/workspaces').send({ name, defaultCurrency: 'USD', timezone: 'Africa/Kigali' });
  if (res.status !== 201) throw new Error(`createWorkspace failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id as string;
}

/** Invite `email` with `role` into `orgId` and have them accept. Returns the new member's session. */
export async function addMember(
  app: Express,
  ctx: TestContext,
  admin: Session,
  orgId: string,
  name: string,
  email: string,
  role: 'ADMIN' | 'FINANCE' | 'DEPARTMENT' | 'EMPLOYEE',
  departmentId?: string,
): Promise<Session> {
  const inv = await client(app, admin, orgId).post('/api/v1/workspaces/current/invites').send({ email, role, departmentId });
  if (inv.status !== 201) throw new Error(`invite failed: ${inv.status} ${JSON.stringify(inv.body)}`);
  const member = await register(app, name, email);
  const acc = await client(app, member).post('/api/v1/workspaces/accept-invite').send({ token: lastInviteToken(ctx, email) });
  if (acc.status !== 200) throw new Error(`accept failed: ${acc.status} ${JSON.stringify(acc.body)}`);
  return member;
}
