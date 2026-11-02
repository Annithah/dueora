import { randomUUID } from 'node:crypto';

import { Router } from 'express';
import { z } from 'zod';

import type { AppContext } from '../../context.js';
import { canRecordPayment, canViewObligation } from '../../domain/permissions.js';
import { forbidden, notFound } from '../../http/errors.js';
import { actorOf, orgIdOf, requireAuth, requireOrg } from '../../http/middleware/auth.js';
import { amountMinor, currency, id, isoDate, pagination } from '../../http/schemas.js';
import { EXTENSIONS, checkUpload, safeFileName, singleFile, type AllowedMime } from '../../http/upload.js';
import { parseBody, parseParams, parseQuery } from '../../http/validate.js';
import { loadObligation } from '../obligations/service.js';
import { audit } from '../workspaces/service.js';

import * as svc from './service.js';

const method = z.enum(['MOBILE_MONEY', 'BANK_TRANSFER', 'CARD', 'CASH', 'OTHER']);
const text = (max: number) => z.string().trim().max(max).nullable();

const RecordBody = z.object({
  amountMinor: amountMinor.optional(),
  currency: currency.optional(),
  paidOn: isoDate.optional(),
  method,
  reference: text(100).optional(),
  notes: text(2000).optional(),
});

const EditBody = z
  .object({ amountMinor, paidOn: isoDate, method, reference: text(100), notes: text(2000) })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');

const HistoryQuery = pagination.extend({
  q: z.string().trim().max(100).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  categoryId: id.optional(),
  platformId: id.optional(),
  provider: z.string().trim().max(120).optional(),
  obligationId: id.optional(),
  method: method.optional(),
});

const Params = z.object({ id });
const RECEIPT_TYPES: AllowedMime[] = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic'];

export function paymentsRouter(ctx: AppContext): Router {
  const router = Router();
  const guard = [requireAuth(ctx), requireOrg(ctx)];

  // --- Payments ---
  router.post('/obligations/:id/payments', ...guard, async (req, res) => {
    const { id: obligationId } = parseParams(req, Params);
    res.status(201).json(await svc.recordPayment(ctx, req, obligationId, parseBody(req, RecordBody)));
  });

  router.get('/payments', ...guard, async (req, res) => {
    res.json(await svc.history(ctx, req, parseQuery(req, HistoryQuery)));
  });

  router.get('/payments/:id', ...guard, async (req, res) => {
    res.json(await svc.getPayment(ctx, req, parseParams(req, Params).id));
  });

  router.patch('/payments/:id', ...guard, async (req, res) => {
    res.json(await svc.editPayment(ctx, req, parseParams(req, Params).id, parseBody(req, EditBody)));
  });

  router.delete('/payments/:id', ...guard, async (req, res) => {
    res.json(await svc.deletePayment(ctx, req, parseParams(req, Params).id));
  });

  // --- Attachments (receipts on payments, contracts/invoices on obligations) ---
  async function store(req: Parameters<typeof orgIdOf>[0], target: { obligationId: string | null; paymentRecordId: string | null }) {
    const mime = checkUpload(req.file, RECEIPT_TYPES);
    const orgId = orgIdOf(req);
    const key = `orgs/${orgId}/attachments/${randomUUID()}.${EXTENSIONS[mime]}`;
    await ctx.storage.put(key, req.file!.buffer, mime);
    const row = await ctx.db.attachment.create({
      data: {
        organizationId: orgId,
        ...target,
        fileKey: key,
        fileName: safeFileName(req.file!.originalname, EXTENSIONS[mime]),
        mimeType: mime,
        size: req.file!.size,
        uploadedById: actorOf(req).userId,
      },
      select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true },
    });
    await audit(ctx, orgId, actorOf(req).userId, 'attachment.upload', 'Attachment', row.id, target);
    return row;
  }

  router.post('/obligations/:id/attachments', ...guard, singleFile(), async (req, res) => {
    const o = await loadObligation(ctx, req, parseParams(req, Params).id, 'manage');
    res.status(201).json(await store(req, { obligationId: o.id, paymentRecordId: null }));
  });

  router.post('/payments/:id/attachments', ...guard, singleFile(), async (req, res) => {
    const p = await ctx.db.paymentRecord.findFirst({
      where: { id: parseParams(req, Params).id, organizationId: orgIdOf(req) },
      include: { obligation: true },
    });
    const actor = actorOf(req);
    if (!p || !canViewObligation(actor, p.obligation)) throw notFound('Payment');
    if (!canRecordPayment(actor, p.obligation)) throw forbidden();
    res.status(201).json(await store(req, { obligationId: p.obligationId, paymentRecordId: p.id }));
  });

  async function loadAttachment(req: Parameters<typeof orgIdOf>[0]) {
    const a = await ctx.db.attachment.findFirst({
      where: { id: parseParams(req, Params).id, organizationId: orgIdOf(req) },
      include: { obligation: true },
    });
    if (!a || (a.obligation && !canViewObligation(actorOf(req), a.obligation))) throw notFound('Attachment');
    return a;
  }

  router.get('/attachments/:id', ...guard, async (req, res) => {
    const a = await loadAttachment(req);
    const file = await ctx.storage.get(a.fileKey);
    if (!file) throw notFound('File');
    res.setHeader('Content-Type', a.mimeType);
    res.setHeader('Content-Length', String(file.body.length));
    res.setHeader('Content-Disposition', `attachment; filename="${a.fileName.replace(/"/g, '')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(file.body);
  });

  router.delete('/attachments/:id', ...guard, async (req, res) => {
    const a = await loadAttachment(req);
    if (a.obligation && !canRecordPayment(actorOf(req), a.obligation)) throw forbidden();
    await ctx.db.attachment.delete({ where: { id: a.id } });
    await ctx.storage.delete(a.fileKey);
    await audit(ctx, orgIdOf(req), actorOf(req).userId, 'attachment.delete', 'Attachment', a.id, { fileName: a.fileName });
    res.status(204).end();
  });

  return router;
}
