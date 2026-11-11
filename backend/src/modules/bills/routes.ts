import { Router } from 'express';
import { z } from 'zod';

import type { AppContext } from '../../context.js';
import { badRequest } from '../../http/errors.js';
import { requireAuth, requirePermission, requireWorkspace } from '../../http/middleware/auth.js';
import { amountCents, csvEnum, id, isoDate, pagination, reminderOffsets } from '../../http/schemas.js';
import { parseBody, parseParams, parseQuery } from '../../http/validate.js';

import * as svc from './service.js';

const STATUSES = ['UPCOMING', 'DUE_SOON', 'DUE_TODAY', 'OVERDUE', 'PARTIALLY_PAID', 'PAID', 'ARCHIVED'] as const;
const UNITS = ['WEEK', 'MONTH', 'YEAR', 'ONCE'] as const;
export const METHODS = ['MOBILE_MONEY', 'BANK_TRANSFER', 'CARD', 'CASH', 'OTHER'] as const;
const optionalText = (max: number) => z.string().trim().max(max).nullable();

const fields = {
  name: z.string().trim().min(1, 'Enter a name').max(120),
  companyId: id,
  categoryId: id,
  provider: optionalText(120),
  description: optionalText(2000),
  accountReference: optionalText(500),
  amountCents,
  frequencyUnit: z.enum(UNITS),
  frequencyInterval: z.number().int().min(1).max(120),
  anchorDay: z.number().int().min(1).max(31),
  startDate: isoDate,
  nextDueDate: isoDate,
  reminderOffsets,
  autoRenew: z.boolean(),
  isTrial: z.boolean(),
  trialEndsOn: isoDate.nullable(),
  defaultPaymentMethod: z.enum(METHODS).nullable(),
};

const CreateBody = z
  .object({
    ...fields,
    provider: fields.provider.optional(),
    description: fields.description.optional(),
    accountReference: fields.accountReference.optional(),
    frequencyInterval: fields.frequencyInterval.default(1),
    anchorDay: fields.anchorDay.optional(),
    startDate: fields.startDate.optional(),
    nextDueDate: fields.nextDueDate.optional(),
    reminderOffsets: fields.reminderOffsets.optional(),
    autoRenew: fields.autoRenew.optional(),
    isTrial: fields.isTrial.optional(),
    trialEndsOn: fields.trialEndsOn.optional(),
    defaultPaymentMethod: fields.defaultPaymentMethod.optional(),
  })
  .strict()
  .refine((b) => !b.isTrial || !!b.trialEndsOn, { message: 'When does the free trial end?', path: ['trialEndsOn'] })
  .refine((b) => !b.nextDueDate || !b.startDate || b.nextDueDate >= b.startDate, {
    message: 'The next due date cannot be before the start date',
    path: ['nextDueDate'],
  });

const UpdateBody = z
  .object(fields)
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');

const idList = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined))
  .pipe(z.array(id).max(50).optional());

const ListQuery = pagination.extend({
  q: z.string().trim().max(100).optional(),
  sort: z.enum(svc.SORTS).default('due_asc'),
  status: csvEnum(STATUSES),
  companyId: idList,
  categoryId: idList,
  frequency: csvEnum(UNITS),
  dueFrom: isoDate.optional(),
  dueTo: isoDate.optional(),
});

const Params = z.object({ id });

const SnoozeBody = z
  .object({ days: z.number().int().min(1).max(60).optional(), until: isoDate.optional() })
  .strict()
  .refine((b) => (b.days === undefined) !== (b.until === undefined), 'Send either days or until');

export function billsRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth(ctx), requireWorkspace(ctx));
  const manage = requirePermission('bills:manage');

  /** GET /bills?page=&limit=10&sort=&q=&status=&companyId=&categoryId=&frequency=&dueFrom=&dueTo= */
  router.get('/', async (req, res) => {
    const q = parseQuery(req, ListQuery);
    res.json(
      await svc.listBills(ctx, req, {
        q: q.q,
        sort: q.sort,
        statuses: q.status,
        companyIds: q.companyId,
        categoryIds: q.categoryId,
        frequencies: q.frequency,
        dueFrom: q.dueFrom,
        dueTo: q.dueTo,
        page: q.page,
        limit: q.limit,
      }),
    );
  });

  router.post('/', manage, async (req, res) => {
    res.status(201).json(await svc.createBill(ctx, req, parseBody(req, CreateBody)));
  });

  router.get('/:id', async (req, res) => {
    res.json(await svc.billDetail(ctx, req, parseParams(req, Params).id));
  });

  /** The plain account reference — ADMIN and FINANCE only; VIEWER only ever sees the masked value. */
  router.get('/:id/reference', requirePermission('accountRefs:reveal'), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await svc.revealReference(ctx, req, parseParams(req, Params).id));
  });

  router.patch('/:id', manage, async (req, res) => {
    const body = parseBody(req, UpdateBody);
    if (body.frequencyUnit === 'ONCE' && body.frequencyInterval && body.frequencyInterval > 1) {
      throw badRequest('One-time bills have no interval');
    }
    res.json(await svc.updateBill(ctx, req, parseParams(req, Params).id, body));
  });

  router.post('/:id/archive', manage, async (req, res) => {
    res.json(await svc.setArchived(ctx, req, parseParams(req, Params).id, true));
  });

  router.post('/:id/unarchive', manage, async (req, res) => {
    res.json(await svc.setArchived(ctx, req, parseParams(req, Params).id, false));
  });

  /** Snooze reminders for this cycle (any role; only affects the caller). */
  router.post('/:id/snooze', async (req, res) => {
    const body = parseBody(req, SnoozeBody);
    res.json(await svc.snooze(ctx, req, parseParams(req, Params).id, body));
  });

  router.delete('/:id/snooze', async (req, res) => {
    await svc.unsnooze(ctx, req, parseParams(req, Params).id);
    res.status(204).end();
  });

  router.delete('/:id', manage, async (req, res) => {
    await svc.deleteBill(ctx, req, parseParams(req, Params).id);
    res.status(204).end();
  });

  return router;
}
