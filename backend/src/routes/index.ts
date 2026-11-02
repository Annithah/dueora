import { Router } from 'express';

import type { AppContext } from '../context.js';

/** Versioned API: everything lives under /api/v1. Feature routers are mounted here. */
export function apiRouter(_ctx: AppContext): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ name: 'DueOra API', version: 'v1' });
  });

  return router;
}
