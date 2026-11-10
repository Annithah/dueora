import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { sha256 } from '../src/lib/crypto.js';

import { client, lastCode, login, register } from './helpers/api.js';
import { createTestContext } from './helpers/context.js';

const ctx = createTestContext();
const app = createApp(ctx);

afterAll(async () => {
  await ctx.db.$disconnect();
});

describe('register', () => {
  it('creates the account and returns tokens without any email verification step', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Anitha Uwase', email: '  Anitha@Example.com ', password: 'correct-horse-9' });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toMatch(/^ey/);
    expect(res.body.refreshToken.length).toBeGreaterThan(30);
    expect(res.body.expiresIn).toBe(900);
    expect(res.body.user).toMatchObject({ email: 'anitha@example.com', emailVerified: false, workspaces: [] });
    expect(res.body.user.passwordHash).toBeUndefined();

    expect(ctx.mailer.lastTo('anitha@example.com')).toBeUndefined();
    // Verification exists but is optional (DECISIONS.md D26): it needs a signed-in user and never blocks sign-up.
    expect((await request(app).post('/api/v1/auth/verify-email').send({ code: '123456' })).status).toBe(401);
  });

  it('stores only hashes of passwords and refresh tokens', async () => {
    const s = await register(app, 'Hash Check', 'hash@example.com');
    const user = await ctx.db.user.findUniqueOrThrow({ where: { email: 'hash@example.com' } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    const stored = await ctx.db.refreshToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.tokenHash).toBe(sha256(s.refreshToken));
  });

  it('rejects duplicate emails regardless of case', async () => {
    await register(app, 'Dup', 'dup@example.com');
    const res = await request(app).post('/api/v1/auth/register').send({ name: 'Dup', email: 'DUP@example.com', password: 'correct-horse-9' });
    expect(res.status).toBe(409);
  });

  it('validates input', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ name: '', email: 'nope', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual(['email', 'name', 'password']);
  });
});

describe('reset codes', () => {
  const forgot = (email: string) => request(app).post('/api/v1/auth/password/forgot').send({ email });
  const reset = (email: string, code: string) =>
    request(app).post('/api/v1/auth/password/reset').send({ email, code, newPassword: 'new-password-2' });

  it('works once only', async () => {
    await register(app, 'Once', 'once@example.com');
    await forgot('once@example.com');
    const code = lastCode(ctx, 'once@example.com');
    expect((await reset('once@example.com', code)).status).toBe(204);
    const again = await reset('once@example.com', code);
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_CODE');
  });

  it('throttles resends and locks a code after 5 wrong attempts', async () => {
    await register(app, 'Lock Me', 'lock@example.com');
    await forgot('lock@example.com');
    const sent = ctx.mailer.sent.length;
    expect((await forgot('lock@example.com')).status).toBe(202);
    expect(ctx.mailer.sent.length).toBe(sent); // silently throttled

    ctx.clock.advance(61_000);
    await forgot('lock@example.com');
    const code = lastCode(ctx, 'lock@example.com');
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await reset('lock@example.com', wrong);
    const locked = await reset('lock@example.com', code);
    expect(locked.body.error.code).toBe('CODE_LOCKED');
  });

  it('expires codes after 15 minutes', async () => {
    await register(app, 'Slow', 'slow@example.com');
    await forgot('slow@example.com');
    const code = lastCode(ctx, 'slow@example.com');
    ctx.clock.advance(16 * 60_000);
    const res = await reset('slow@example.com', code);
    expect(res.body.error.code).toBe('INVALID_CODE');
  });
});

describe('login', () => {
  it('logs in with the right password', async () => {
    await register(app, 'Login', 'login@example.com', 'my-secret-pass');
    const s = await login(app, 'LOGIN@example.com', 'my-secret-pass');
    expect(s.accessToken).toBeTruthy();
    const me = await client(app, s).get('/api/v1/me');
    expect(me.body.email).toBe('login@example.com');
  });

  it('gives the same answer for wrong password and unknown email', async () => {
    const wrong = await request(app).post('/api/v1/auth/login').send({ email: 'login@example.com', password: 'nope-nope' });
    const unknown = await request(app).post('/api/v1/auth/login').send({ email: 'ghost@example.com', password: 'nope-nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('rejects missing, malformed and expired access tokens', async () => {
    expect((await request(app).get('/api/v1/me')).status).toBe(401);
    expect((await request(app).get('/api/v1/me').set('Authorization', 'Bearer abc.def.ghi')).status).toBe(401);
    const s = await register(app, 'Expire', 'expire@example.com');
    ctx.clock.advance(15 * 60_000 + 1000);
    expect((await client(app, s).get('/api/v1/me')).status).toBe(401);
  });
});

describe('refresh token rotation', () => {
  it('rotates on every use', async () => {
    const s = await register(app, 'Rotate', 'rotate@example.com');
    const r1 = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(s.refreshToken);
    const r2 = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken });
    expect(r2.status).toBe(200);
  });

  it('revokes the whole family when a rotated token is reused', async () => {
    const s = await register(app, 'Reuse', 'reuse@example.com');
    const r1 = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken });
    // Attacker replays the original token.
    const replay = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken });
    expect(replay.status).toBe(401);
    // The legitimate, newer token is now dead too.
    const victim = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken });
    expect(victim.status).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const s = await register(app, 'Bye', 'bye@example.com');
    expect((await request(app).post('/api/v1/auth/logout').send({ refreshToken: s.refreshToken })).status).toBe(204);
    expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken })).status).toBe(401);
  });

  it('expires refresh tokens after 30 days', async () => {
    const s = await register(app, 'Old', 'old@example.com');
    ctx.clock.advance(31 * 86_400_000);
    expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken })).status).toBe(401);
  });
});

describe('forgot / reset password', () => {
  it('does not reveal whether an email exists', async () => {
    const sentBefore = ctx.mailer.sent.length;
    const res = await request(app).post('/api/v1/auth/password/forgot').send({ email: 'nobody@example.com' });
    expect(res.status).toBe(202);
    expect(ctx.mailer.sent.length).toBe(sentBefore);
  });

  it('resets with the emailed code and signs out every session', async () => {
    const s = await register(app, 'Forgetful', 'forget@example.com', 'old-password-1');
    ctx.clock.advance(61_000);
    expect((await request(app).post('/api/v1/auth/password/forgot').send({ email: 'forget@example.com' })).status).toBe(202);
    const code = lastCode(ctx, 'forget@example.com');
    expect(ctx.mailer.lastTo('forget@example.com')?.subject).toMatch(/password reset code/);

    const reset = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ email: 'forget@example.com', code, newPassword: 'new-password-2' });
    expect(reset.status).toBe(204);

    expect((await request(app).post('/api/v1/auth/login').send({ email: 'forget@example.com', password: 'old-password-1' })).status).toBe(401);
    await login(app, 'forget@example.com', 'new-password-2');
    expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken })).status).toBe(401);
  });

  it('rejects a wrong code', async () => {
    await register(app, 'Wrong', 'wrongcode@example.com');
    ctx.clock.advance(61_000);
    await request(app).post('/api/v1/auth/password/forgot').send({ email: 'wrongcode@example.com' });
    const code = lastCode(ctx, 'wrongcode@example.com');
    const res = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ email: 'wrongcode@example.com', code: code === '123456' ? '654321' : '123456', newPassword: 'new-password-2' });
    expect(res.status).toBe(400);
  });
});

describe('profile', () => {
  it('updates the name and nothing else', async () => {
    const s = await register(app, 'Profile', 'profile@example.com');
    const res = await client(app, s).patch('/api/v1/me').send({ name: 'Profile Person' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Profile Person', email: 'profile@example.com' });
    expect(res.body).not.toHaveProperty('avatarUrl');
    expect((await client(app, s).patch('/api/v1/me').send({ email: 'other@example.com' })).status).toBe(400);
  });

  it('changes the password only with the current one', async () => {
    const s = await register(app, 'Changer', 'changer@example.com', 'first-pass-1');
    const bad = await client(app, s).post('/api/v1/me/password').send({ currentPassword: 'nope', newPassword: 'second-pass-2' });
    expect(bad.body.error.code).toBe('WRONG_PASSWORD');
    const ok = await client(app, s).post('/api/v1/me/password').send({ currentPassword: 'first-pass-1', newPassword: 'second-pass-2' });
    expect(ok.status).toBe(204);
    await login(app, 'changer@example.com', 'second-pass-2');
  });
});
