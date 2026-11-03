import { Router } from 'express';
import { z } from 'zod';

import type { AppContext } from '../../context.js';
import { requireAuth, userIdOf } from '../../http/middleware/auth.js';
import { authLimiter } from '../../http/rateLimits.js';
import { email } from '../../http/schemas.js';
import { parseBody } from '../../http/validate.js';

import * as auth from './service.js';
import { revokeRefreshToken, rotateRefreshToken } from './tokens.js';

const password = z.string().min(8, 'Use at least 8 characters').max(128);
const code = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code');

const RegisterBody = z.object({ name: z.string().trim().min(1, 'Enter your name').max(100), email, password });
const LoginBody = z.object({ email, password: z.string().min(1).max(128) });
const RefreshBody = z.object({ refreshToken: z.string().min(20).max(200) });
const CodeBody = z.object({ code });
const ForgotBody = z.object({ email });
const ResetBody = z.object({ email, code, newPassword: password });
const ProfileBody = z.object({ name: z.string().trim().min(1, 'Enter your name').max(100) }).strict();
const ChangePasswordBody = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password });

export function authRouter(ctx: AppContext): Router {
  const router = Router();
  const credentialLimit = authLimiter(ctx, { limit: 10, windowMinutes: 15 });
  const codeLimit = authLimiter(ctx, { limit: 10, windowMinutes: 15 });

  router.post('/register', authLimiter(ctx, { limit: 5, windowMinutes: 60 }), async (req, res) => {
    const body = parseBody(req, RegisterBody);
    res.status(201).json(await auth.register(ctx, body, req.get('user-agent')));
  });

  router.post('/login', credentialLimit, async (req, res) => {
    res.json(await auth.login(ctx, parseBody(req, LoginBody), req.get('user-agent')));
  });

  router.post('/refresh', authLimiter(ctx, { limit: 60, windowMinutes: 15 }), async (req, res) => {
    const { refreshToken } = parseBody(req, RefreshBody);
    res.json(await rotateRefreshToken(ctx, refreshToken, req.get('user-agent')));
  });

  router.post('/logout', async (req, res) => {
    const { refreshToken } = parseBody(req, RefreshBody);
    await revokeRefreshToken(ctx, refreshToken);
    res.status(204).end();
  });

  router.post('/verify-email/request', requireAuth(ctx), codeLimit, async (req, res) => {
    await auth.requestEmailVerification(ctx, userIdOf(req));
    res.status(202).json({ sent: true });
  });

  router.post('/verify-email', requireAuth(ctx), codeLimit, async (req, res) => {
    await auth.verifyEmail(ctx, userIdOf(req), parseBody(req, CodeBody).code);
    res.json(await auth.publicUser(ctx, userIdOf(req)));
  });

  router.post('/password/forgot', authLimiter(ctx, { limit: 5, windowMinutes: 15 }), async (req, res) => {
    await auth.requestPasswordReset(ctx, parseBody(req, ForgotBody).email);
    res.status(202).json({ sent: true });
  });

  router.post('/password/reset', codeLimit, async (req, res) => {
    await auth.resetPassword(ctx, parseBody(req, ResetBody));
    res.status(204).end();
  });

  return router;
}

export function meRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth(ctx));

  router.get('/', async (req, res) => {
    res.json(await auth.publicUser(ctx, userIdOf(req)));
  });

  router.patch('/', async (req, res) => {
    const body = parseBody(req, ProfileBody);
    await ctx.db.user.update({ where: { id: userIdOf(req) }, data: body });
    res.json(await auth.publicUser(ctx, userIdOf(req)));
  });

  router.post('/password', authLimiter(ctx, { limit: 10, windowMinutes: 15 }), async (req, res) => {
    await auth.changePassword(ctx, userIdOf(req), parseBody(req, ChangePasswordBody));
    res.status(204).end();
  });

  return router;
}
