import { Router } from 'express';

import type { AppContext } from '../context.js';
import { authRouter, meRouter } from '../modules/auth/routes.js';
import { catalogRouter } from '../modules/catalog/routes.js';
import { obligationsRouter } from '../modules/obligations/routes.js';
import { publicRouter, workspacesRouter } from '../modules/workspaces/routes.js';

/** Versioned API: everything lives under /api/v1. */
export function apiRouter(ctx: AppContext): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ name: 'DueOra API', version: 'v1' });
  });

  router.use('/auth', authRouter(ctx));
  router.use('/me', meRouter(ctx));
  router.use('/workspaces', workspacesRouter(ctx));
  router.use('/obligations', obligationsRouter(ctx));
  router.use('/', catalogRouter(ctx));
  router.use('/public', publicRouter(ctx));

  return router;
}
