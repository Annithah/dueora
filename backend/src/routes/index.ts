import { Router } from 'express';

import { aiRouter } from '../ai/routes.js';
import type { AppContext } from '../context.js';
import { feedbackRouter } from '../modules/account/routes.js';
import { authRouter, meRouter } from '../modules/auth/routes.js';
import { budgetsRouter } from '../modules/budgets/routes.js';
import { importRouter } from '../modules/import/routes.js';
import { catalogRouter } from '../modules/catalog/routes.js';
import { companiesRouter } from '../modules/companies/routes.js';
import { insightsRouter } from '../modules/insights/routes.js';
import { billsRouter } from '../modules/bills/routes.js';
import { paymentsRouter } from '../modules/payments/routes.js';
import { publicRouter, workspacesRouter } from '../modules/workspaces/routes.js';
import { notificationsRouter } from '../notifications/routes.js';

import { helpRouter } from './help.js';

/** Versioned API: everything lives under /api/v1. */
export function apiRouter(ctx: AppContext): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ name: 'DueOra API', version: 'v1' });
  });

  router.use('/auth', authRouter(ctx));
  router.use('/me', meRouter(ctx));
  router.use('/workspaces', workspacesRouter(ctx));
  router.use('/bills', billsRouter(ctx));
  router.use('/companies', companiesRouter(ctx));
  router.use('/budgets', budgetsRouter(ctx));
  router.use('/import', importRouter(ctx));
  router.use('/feedback', feedbackRouter(ctx));
  router.use('/', catalogRouter(ctx));
  router.use('/', paymentsRouter(ctx));
  router.use('/', notificationsRouter(ctx));
  router.use('/', insightsRouter(ctx));
  router.use('/public', publicRouter(ctx));
  router.use('/help', helpRouter(ctx));
  router.use('/ai', aiRouter(ctx));

  return router;
}
