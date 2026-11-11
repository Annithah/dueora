import { Router } from 'express';
import { z } from 'zod';

import type { AppContext } from '../../context.js';
import { requireAuth, requirePermission, requireWorkspace, workspaceIdOf } from '../../http/middleware/auth.js';
import { amountCents, id } from '../../http/schemas.js';
import { parseBody, parseParams } from '../../http/validate.js';
import { workspaceToday } from '../bills/service.js';

import * as svc from './service.js';

const BudgetBody = z
  .object({
    categoryId: id.nullable().default(null),
    monthlyLimitCents: amountCents,
    alertAtPercent: z.number().int().min(10).max(100).optional(),
  })
  .strict();

export function budgetsRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth(ctx), requireWorkspace(ctx));
  const manage = requirePermission('budgets:manage');

  /** Every budget with this month's progress (paid + still due). */
  router.get('/', async (req, res) => {
    res.json(await svc.budgetProgress(ctx, workspaceIdOf(req), workspaceToday(ctx, req)));
  });

  /** Create or replace the budget for the workspace (categoryId null) or one category. */
  router.put('/', manage, async (req, res) => {
    await svc.upsertBudget(ctx, workspaceIdOf(req), parseBody(req, BudgetBody));
    await svc.checkBudgetAlerts(ctx, workspaceIdOf(req), workspaceToday(ctx, req));
    res.json(await svc.budgetProgress(ctx, workspaceIdOf(req), workspaceToday(ctx, req)));
  });

  router.delete('/:id', manage, async (req, res) => {
    await svc.deleteBudget(ctx, workspaceIdOf(req), parseParams(req, z.object({ id })).id);
    res.status(204).end();
  });

  return router;
}
