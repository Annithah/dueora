import express, { Router } from 'express';
import { z } from 'zod';

import type { AppContext } from '../../context.js';
import { requireAuth, requirePermission, requireWorkspace, userIdOf, workspaceIdOf } from '../../http/middleware/auth.js';
import { parseBody, parseQuery } from '../../http/validate.js';
import { workspaceToday } from '../subscriptions/service.js';

import * as svc from './service.js';

const column = z.number().int().min(0).max(200);
const FileBody = z
  .object({
    fileName: z.string().trim().min(1).max(200),
    /** The file's bytes, base64-encoded (≤ 2 MB decoded). */
    contentBase64: z.string().min(4).max(3_000_000),
    mapping: z
      .object(Object.fromEntries(svc.FIELDS.map((f) => [f, column.optional()])) as Record<svc.ImportField, z.ZodOptional<typeof column>>)
      .strict()
      .optional(),
  })
  .strict();

export function importRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth(ctx), requireWorkspace(ctx), requirePermission('import:run'));
  // Spreadsheets arrive as base64 JSON: allow a bigger body on these routes only.
  router.use(express.json({ limit: '3mb' }));

  router.get('/template', async (req, res) => {
    const { format } = parseQuery(req, z.object({ format: z.enum(['csv', 'xlsx']).default('xlsx') }));
    res
      .type(format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .setHeader('Content-Disposition', `attachment; filename="dueora-import-template.${format}"`)
      .send(await svc.template(format));
  });

  /** Parse, map and validate — nothing is saved. */
  router.post('/preview', async (req, res) => {
    const body = parseBody(req, FileBody);
    const rows = await svc.readSheet(body.fileName, body.contentBase64);
    res.json(await svc.buildPreview(ctx, workspaceIdOf(req), rows, body.mapping));
  });

  /** Import the valid rows of the same file with the same mapping. */
  router.post('/commit', async (req, res) => {
    const body = parseBody(req, FileBody);
    const rows = await svc.readSheet(body.fileName, body.contentBase64);
    res.status(201).json(await svc.commitImport(ctx, workspaceIdOf(req), userIdOf(req), workspaceToday(ctx, req), rows, body.mapping));
  });

  return router;
}
