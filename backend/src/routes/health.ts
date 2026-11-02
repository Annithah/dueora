import { Router } from 'express';

import type { AppContext } from '../context.js';
import { API_VERSION, APP_NAME } from '../meta.js';

export function healthRouter(ctx: AppContext): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    let database: 'ok' | 'error' = 'ok';
    try {
      await ctx.db.$queryRawUnsafe('SELECT 1');
    } catch (err) {
      ctx.logger.error({ err }, 'Health check: database unreachable');
      database = 'error';
    }
    res.status(database === 'ok' ? 200 : 503).json({
      status: database === 'ok' ? 'ok' : 'degraded',
      service: APP_NAME,
      apiVersion: API_VERSION,
      database,
      time: ctx.clock.now().toISOString(),
    });
  });

  return router;
}
