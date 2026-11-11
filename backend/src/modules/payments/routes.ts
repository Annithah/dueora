import { Router } from 'express';
import { z } from 'zod';

import type { AppContext } from '../../context.js';
import { requireAuth, requirePermission, requireWorkspace } from '../../http/middleware/auth.js';
import { amountCents, id, isoDate, pagination } from '../../http/schemas.js';
import { parseBody, parseParams, parseQuery } from '../../http/validate.js';

import * as svc from './service.js';

const method = z.enum(['MOBILE_MONEY', 'BANK_TRANSFER', 'CARD', 'CASH', 'OTHER']);
const text = (max: number) => z.string().trim().max(max).nullable();

const RecordBody = z
  .object({
    amountCents: amountCents.optional(),
    paidOn: isoDate.optional(),
    /** Defaults to the bill's default payment method (or OTHER). */
    method: method.optional(),
    reference: text(100).optional(),
    notes: text(2000).optional(),
  })
  .strict();

const EditBody = z
  .object({ amountCents, paidOn: isoDate, method, reference: text(100), notes: text(2000) })
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');

const idList = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined))
  .pipe(z.array(id).max(50).optional());

const HistoryQuery = pagination.extend({
  q: z.string().trim().max(100).optional(),
  sort: z.enum(svc.HISTORY_SORTS).default('paid_desc'),
  from: isoDate.optional(),
  to: isoDate.optional(),
  companyId: idList,
  categoryId: idList,
  billId: id.optional(),
  method: method.optional(),
});

const Params = z.object({ id });

export function paymentsRouter(ctx: AppContext): Router {
  const router = Router();
  const guard = [requireAuth(ctx), requireWorkspace(ctx)];

  router.post('/bills/:id/payments', ...guard, requirePermission('payments:record'), async (req, res) => {
    const { id: billId } = parseParams(req, Params);
    res.status(201).json(await svc.recordPayment(ctx, req, billId, parseBody(req, RecordBody)));
  });

  /** GET /payments?page=&limit=10&sort=&q=&from=&to=&companyId=&categoryId= */
  router.get('/payments', ...guard, async (req, res) => {
    const q = parseQuery(req, HistoryQuery);
    res.json(
      await svc.history(ctx, req, {
        q: q.q,
        sort: q.sort,
        from: q.from,
        to: q.to,
        companyIds: q.companyId,
        categoryIds: q.categoryId,
        billId: q.billId,
        method: q.method,
        page: q.page,
        limit: q.limit,
      }),
    );
  });

  router.get('/payments/:id', ...guard, async (req, res) => {
    res.json(await svc.getPayment(ctx, req, parseParams(req, Params).id));
  });

  router.patch('/payments/:id', ...guard, requirePermission('payments:edit'), async (req, res) => {
    res.json(await svc.editPayment(ctx, req, parseParams(req, Params).id, parseBody(req, EditBody)));
  });

  router.delete('/payments/:id', ...guard, requirePermission('payments:edit'), async (req, res) => {
    res.json(await svc.deletePayment(ctx, req, parseParams(req, Params).id));
  });

  return router;
}
