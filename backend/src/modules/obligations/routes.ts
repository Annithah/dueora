import { Router } from 'express';
import { z } from 'zod';

import type { AppContext } from '../../context.js';
import { AppError } from '../../http/errors.js';
import { requireAuth, requireOrg, requirePermission } from '../../http/middleware/auth.js';
import { amountMinor, currency, id, isoDate, pagination, reminderOffsets } from '../../http/schemas.js';
import { parseBody, parseParams, parseQuery } from '../../http/validate.js';

import * as svc from './service.js';

const STATUSES = ['UPCOMING', 'DUE_SOON', 'DUE_TODAY', 'OVERDUE', 'PARTIALLY_PAID', 'PAID', 'ARCHIVED'] as const;

const fields = {
  name: z.string().trim().min(1, 'Enter a name').max(120),
  provider: z.string().trim().min(1, 'Enter the provider').max(120),
  description: z.string().trim().max(2000).nullable(),
  icon: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,29}$/)
    .nullable(),
  amountMinor,
  currency,
  frequencyUnit: z.enum(['WEEK', 'MONTH', 'YEAR', 'ONCE']),
  frequencyInterval: z.number().int().min(1).max(120),
  anchorDay: z.number().int().min(1).max(31),
  startDate: isoDate,
  nextDueDate: isoDate,
  reminderOffsets,
  platformId: id.nullable(),
  categoryId: id,
  departmentId: id.nullable(),
  assigneeUserId: id.nullable(),
};

const CreateBody = z
  .object({
    ...fields,
    description: fields.description.optional(),
    icon: fields.icon.optional(),
    frequencyInterval: fields.frequencyInterval.default(1),
    anchorDay: fields.anchorDay.optional(),
    nextDueDate: fields.nextDueDate.optional(),
    reminderOffsets: fields.reminderOffsets.optional(),
    platformId: fields.platformId.optional(),
    departmentId: fields.departmentId.optional(),
    assigneeUserId: fields.assigneeUserId.optional(),
  })
  .refine((b) => !b.nextDueDate || b.nextDueDate >= b.startDate, {
    message: 'The next due date cannot be before the start date',
    path: ['nextDueDate'],
  });

const UpdateBody = z.object(fields).partial().refine((b) => Object.keys(b).length > 0, 'Nothing to update');

const ListQuery = pagination.extend({
  q: z.string().trim().max(100).optional(),
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim().toUpperCase()) : undefined))
    .pipe(z.array(z.enum(STATUSES)).optional()),
  platformId: id.optional(),
  categoryId: id.optional(),
  departmentId: id.optional(),
  assignedToMe: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

const Params = z.object({ id });

export function obligationsRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth(ctx), requireOrg(ctx));

  router.get('/', async (req, res) => {
    const q = parseQuery(req, ListQuery);
    res.json(await svc.listObligations(ctx, req, { ...q, statuses: q.status }));
  });

  router.post('/', requirePermission('obligations:create'), async (req, res) => {
    res.status(201).json(await svc.createObligation(ctx, req, parseBody(req, CreateBody)));
  });

  router.get('/:id', async (req, res) => {
    res.json(await svc.obligationDetail(ctx, req, parseParams(req, Params).id));
  });

  router.patch('/:id', async (req, res) => {
    const body = parseBody(req, UpdateBody);
    if (body.frequencyUnit === 'ONCE' && body.frequencyInterval && body.frequencyInterval > 1) {
      throw new AppError(400, 'BAD_REQUEST', 'One-time payments have no interval');
    }
    res.json(await svc.updateObligation(ctx, req, parseParams(req, Params).id, body));
  });

  router.post('/:id/archive', async (req, res) => {
    res.json(await svc.setArchived(ctx, req, parseParams(req, Params).id, true));
  });

  router.post('/:id/unarchive', async (req, res) => {
    res.json(await svc.setArchived(ctx, req, parseParams(req, Params).id, false));
  });

  router.delete('/:id', async (req, res) => {
    await svc.deleteObligation(ctx, req, parseParams(req, Params).id);
    res.status(204).end();
  });

  return router;
}
