import { Router } from 'express';
import { z } from 'zod';

import type { AppContext } from '../../context.js';
import { requireAuth, requirePermission, requireWorkspace } from '../../http/middleware/auth.js';
import { id, reminderOffsets } from '../../http/schemas.js';
import { parseBody, parseParams, parseQuery } from '../../http/validate.js';
import * as fields from '../categories/customFields.js';
import * as svc from '../categories/service.js';

const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a #RRGGBB colour');
const name = z.string().trim().min(1, 'Enter a name').max(60);
const icon = z.string().regex(/^[a-z][a-z0-9-]{0,29}$/);
const defaults = {
  defaultFrequencyUnit: z.enum(['WEEK', 'MONTH', 'YEAR', 'ONCE']).nullable(),
  defaultFrequencyInterval: z.number().int().min(1).max(120).nullable(),
  defaultAmountType: z.enum(['FIXED', 'VARIABLE']).nullable(),
  defaultReminderOffsets: reminderOffsets.nullable(),
  defaultPaymentMethod: z.enum(['MOBILE_MONEY', 'BANK_TRANSFER', 'CARD', 'CASH', 'OTHER']).nullable(),
};
const editable = {
  name,
  icon,
  color,
  parentId: id.nullable(),
  description: z.string().trim().max(300).nullable(),
  ...defaults,
};
const CategoryBody = z
  .object({ companyId: id, ...editable, subcategories: z.array(name).max(30) })
  .partial()
  .required({ companyId: true, name: true })
  .strict();
const CategoryPatch = z
  .object(editable)
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');
const ListQuery = z.object({ companyId: id.optional(), includeArchived: z.enum(['true', 'false']).optional() });
const ReorderBody = z.object({ companyId: id, ids: z.array(id).min(1).max(200) });
const MergeBody = z.object({ intoId: id });
const DeleteQuery = z.object({ moveToId: id.optional() });
const Params = z.object({ id });

const fieldShape = {
  name: z.string().trim().min(1, 'Enter a field name').max(40),
  type: z.enum(['TEXT', 'NUMBER', 'DATE', 'DROPDOWN']),
  options: z.array(z.string().trim().min(1).max(60)).max(30).nullable(),
  categoryIds: z.array(id).max(100).nullable(),
  required: z.boolean(),
};
const FieldBody = z.object(fieldShape).partial({ options: true, categoryIds: true, required: true }).strict();
const FieldPatch = z
  .object(fieldShape)
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');

/** Categories (per company) and company custom fields. */
export function catalogRouter(ctx: AppContext): Router {
  const router = Router();
  // Mounted at the API root, so scope auth to this router's own paths only.
  router.use(['/categories', '/custom-fields'], requireAuth(ctx), requireWorkspace(ctx));
  // Route guards: "may do this in at least one company"; services check the category's company.
  const manage = requirePermission('categories:manage');

  // --- Categories ---
  /** The visible companies' categories (one company with ?companyId=). */
  router.get('/categories', async (req, res) => {
    const q = parseQuery(req, ListQuery);
    res.json(await svc.listCategories(ctx, req, { companyId: q.companyId, includeArchived: q.includeArchived === 'true' }));
  });

  /** Names to pick from when creating a company or a category (config/categorySuggestions.ts). */
  router.get('/categories/suggestions', (_req, res) => {
    res.json(svc.suggestions());
  });

  router.post('/categories', manage, async (req, res) => {
    res.status(201).json(await svc.createCategory(ctx, req, parseBody(req, CategoryBody)));
  });

  router.post('/categories/reorder', manage, async (req, res) => {
    const body = parseBody(req, ReorderBody);
    await svc.reorderCategories(ctx, req, body.companyId, body.ids);
    res.status(204).end();
  });

  router.patch('/categories/:id', manage, async (req, res) => {
    res.json(await svc.updateCategory(ctx, req, parseParams(req, Params).id, parseBody(req, CategoryPatch)));
  });

  router.post('/categories/:id/archive', manage, async (req, res) => {
    res.json(await svc.setCategoryArchived(ctx, req, parseParams(req, Params).id, true));
  });

  router.post('/categories/:id/unarchive', manage, async (req, res) => {
    res.json(await svc.setCategoryArchived(ctx, req, parseParams(req, Params).id, false));
  });

  /** Move its bills, sub-categories and budget into another category, then delete it. */
  router.post('/categories/:id/merge', manage, async (req, res) => {
    res.json(await svc.mergeCategory(ctx, req, parseParams(req, Params).id, parseBody(req, MergeBody).intoId));
  });

  /** A category with bills needs ?moveToId= (409 CATEGORY_IN_USE otherwise). */
  router.delete('/categories/:id', manage, async (req, res) => {
    await svc.deleteCategory(ctx, req, parseParams(req, Params).id, parseQuery(req, DeleteQuery).moveToId);
    res.status(204).end();
  });

  // --- Custom fields (per company) ---
  router.get('/custom-fields', async (req, res) => {
    res.json(await fields.listFields(ctx, req, parseQuery(req, z.object({ companyId: id })).companyId));
  });

  router.post('/custom-fields', manage, async (req, res) => {
    const { companyId } = parseQuery(req, z.object({ companyId: id }));
    res.status(201).json(await fields.createField(ctx, req, companyId, parseBody(req, FieldBody)));
  });

  router.patch('/custom-fields/:id', manage, async (req, res) => {
    res.json(await fields.updateField(ctx, req, parseParams(req, Params).id, parseBody(req, FieldPatch)));
  });

  router.delete('/custom-fields/:id', manage, async (req, res) => {
    await fields.deleteField(ctx, req, parseParams(req, Params).id);
    res.status(204).end();
  });

  return router;
}
