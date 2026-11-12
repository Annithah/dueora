import { Router } from 'express';
import { z } from 'zod';

import type { AppContext } from '../../context.js';
import { requireAuth, requirePermission, requireWorkspace } from '../../http/middleware/auth.js';
import { amountCents, id, reminderOffsets } from '../../http/schemas.js';
import { parseBody, parseParams, parseQuery } from '../../http/validate.js';

import * as svc from './service.js';

export const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a #RRGGBB colour');
const fields = {
  name: z.string().trim().min(1, 'Enter a company name').max(60),
  shortName: z.string().trim().max(4).nullable(),
  color,
  description: z.string().trim().max(500).nullable(),
  reminderOffsets: reminderOffsets.nullable(),
  reminderHour: z.number().int().min(0).max(23).nullable(),
  monthlyBudgetCents: amountCents.nullable(),
};
export const CompanyBody = z
  .object({ ...fields, color: color.default('#0F5C5C') })
  .partial({ shortName: true, description: true, reminderOffsets: true, reminderHour: true, monthlyBudgetCents: true });
const CompanyPatch = z
  .object(fields)
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');
const Query = z.object({ includeArchived: z.enum(['true', 'false']).optional() });
const Params = z.object({ id });

export function companiesRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth(ctx), requireWorkspace(ctx));
  const admin = requirePermission('companies:manage');

  /** The companies the caller can see (archived ones only when asked). */
  router.get('/', async (req, res) => {
    res.json(await svc.listCompanies(ctx, req, parseQuery(req, Query).includeArchived === 'true'));
  });

  router.get('/:id', async (req, res) => {
    res.json(await svc.companyDetail(ctx, req, parseParams(req, Params).id));
  });

  router.post('/', admin, async (req, res) => {
    const c = await svc.createCompany(ctx, req, parseBody(req, CompanyBody.strict()));
    res.status(201).json(svc.companyView(c, { myRole: 'ADMIN' }));
  });

  router.patch('/:id', admin, async (req, res) => {
    res.json(await svc.updateCompany(ctx, req, parseParams(req, Params).id, parseBody(req, CompanyPatch)));
  });

  router.post('/:id/archive', admin, async (req, res) => {
    res.json(await svc.setCompanyArchived(ctx, req, parseParams(req, Params).id, true));
  });

  router.post('/:id/unarchive', admin, async (req, res) => {
    res.json(await svc.setCompanyArchived(ctx, req, parseParams(req, Params).id, false));
  });

  /** Only a company without bills; otherwise 409 HAS_BILLS (archive it instead). */
  router.delete('/:id', admin, async (req, res) => {
    await svc.deleteCompany(ctx, req, parseParams(req, Params).id);
    res.status(204).end();
  });

  return router;
}
