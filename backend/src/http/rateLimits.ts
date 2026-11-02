import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';

import type { AppContext } from '../context.js';

const passThrough: RequestHandler = (_req, _res, next) => next();

/**
 * Stricter limits for credential endpoints (login, register, codes) to slow down
 * password guessing and email bombing. Disabled under NODE_ENV=test unless forced.
 */
export function authLimiter(ctx: AppContext, opts: { limit: number; windowMinutes: number; force?: boolean }): RequestHandler {
  if (ctx.env.NODE_ENV === 'test' && !opts.force) return passThrough;
  return rateLimit({
    windowMs: opts.windowMinutes * 60_000,
    limit: opts.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Key on IP + email so one attacker can't lock everyone out of a shared NAT.
    keyGenerator: (req) => {
      const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
      return `${req.ip ?? 'unknown'}|${email}`;
    },
    message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Please wait a few minutes and try again.' } },
  });
}
