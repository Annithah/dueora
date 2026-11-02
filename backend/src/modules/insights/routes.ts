import { Router } from 'express';
import { z } from 'zod';

import type { AppContext } from '../../context.js';
import { daysBetween, todayIn } from '../../domain/schedule.js';
import { badRequest } from '../../http/errors.js';
import { requireAuth, requireOrg, requirePermission } from '../../http/middleware/auth.js';
import { isoDate } from '../../http/schemas.js';
import { parseQuery } from '../../http/validate.js';

import { reportFileName, reportPdf, reportXlsx } from './export.js';
import * as svc from './service.js';

const ReportQuery = z
  .object({
    period: z.enum(['month', 'year']).default('month'),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
  });

const CalendarQuery = z.object({ from: isoDate, to: isoDate });

export function insightsRouter(ctx: AppContext): Router {
  const router = Router();
  const guard = [requireAuth(ctx), requireOrg(ctx)];

  /** One aggregated call for the whole Home screen. */
  router.get('/dashboard', ...guard, async (req, res) => {
    res.json(await svc.dashboard(ctx, req));
  });

  router.get('/calendar', ...guard, async (req, res) => {
    const { from, to } = parseQuery(req, CalendarQuery);
    if (to < from) throw badRequest('`to` must be on or after `from`');
    if (daysBetween(from, to) > 400) throw badRequest('Ask for at most 400 days at a time');
    res.json(await svc.calendar(ctx, req, from, to));
  });

  const resolvePeriod = (q: z.infer<typeof ReportQuery>, timezone: string) => {
    const today = todayIn(ctx.clock.now(), timezone);
    return { period: q.period, year: q.year ?? Number(today.slice(0, 4)), month: q.period === 'month' ? (q.month ?? Number(today.slice(5, 7))) : undefined };
  };

  router.get('/reports', ...guard, requirePermission('reports:view'), async (req, res) => {
    const p = resolvePeriod(parseQuery(req, ReportQuery), req.org!.timezone);
    res.json(await svc.report(ctx, req, p.period, p.year, p.month));
  });

  router.get('/reports/export', ...guard, requirePermission('reports:view'), async (req, res) => {
    const format = z.enum(['pdf', 'xlsx']).parse(req.query.format);
    const p = resolvePeriod(parseQuery(req, ReportQuery), req.org!.timezone);
    const r = await svc.report(ctx, req, p.period, p.year, p.month);
    const body = format === 'pdf' ? await reportPdf(r) : await reportXlsx(r);
    res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${reportFileName(r, format)}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(body);
  });

  return router;
}
