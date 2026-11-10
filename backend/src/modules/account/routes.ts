import { Router } from 'express';
import { z } from 'zod';

import type { AppContext } from '../../context.js';
import { requireAuth, userIdOf } from '../../http/middleware/auth.js';
import { authLimiter } from '../../http/rateLimits.js';
import { parseBody } from '../../http/validate.js';

const FeedbackBody = z
  .object({
    message: z.string().trim().min(3, 'Tell us a little more').max(4000),
    appVersion: z.string().trim().max(40).optional(),
    platform: z.string().trim().max(20).optional(),
  })
  .strict();

/** POST /feedback — "Send feedback" from Help & feedback, stored for the team to read. */
export function feedbackRouter(ctx: AppContext): Router {
  const router = Router();
  router.post('/', requireAuth(ctx), authLimiter(ctx, { limit: 10, windowMinutes: 60 }), async (req, res) => {
    const body = parseBody(req, FeedbackBody);
    const workspaceId = req.header('x-workspace-id') ?? null;
    const member = workspaceId
      ? await ctx.db.membership.findUnique({ where: { userId_workspaceId: { userId: userIdOf(req), workspaceId } } })
      : null;
    await ctx.db.feedback.create({
      data: { ...body, userId: userIdOf(req), workspaceId: member ? workspaceId : null, createdAt: ctx.clock.now() },
    });
    res.status(201).json({ received: true });
  });
  return router;
}
