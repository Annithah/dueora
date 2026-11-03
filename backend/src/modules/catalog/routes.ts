import { Router } from 'express';
import { z } from 'zod';

import type { AppContext } from '../../context.js';
import { AppError, notFound } from '../../http/errors.js';
import { requireAuth, requirePermission, requireWorkspace, userIdOf, workspaceIdOf } from '../../http/middleware/auth.js';
import { id } from '../../http/schemas.js';
import { parseBody, parseParams, parseQuery } from '../../http/validate.js';
import { audit } from '../workspaces/service.js';

const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a #RRGGBB colour');
const name = z.string().trim().min(1, 'Enter a name').max(60);
const CompanyBody = z.object({ name, color: color.default('#0F5C5C') });
const CompanyPatch = z.object({ name, color }).partial().strict();
const CategoryBody = z.object({ name, icon: z.string().regex(/^[a-z][a-z0-9-]{0,29}$/), color });
const CompanyQuery = z.object({ includeArchived: z.enum(['true', 'false']).optional() });
const Params = z.object({ id });

const isUniqueViolation = (err: unknown) => (err as { code?: string } | null)?.code === 'P2002';

/** Companies (e.g. "KT Radio", "KigaliToday") and categories inside the active workspace. */
export function catalogRouter(ctx: AppContext): Router {
  const router = Router();
  // Mounted at the API root, so scope auth to this router's own paths only.
  router.use(['/companies', '/categories'], requireAuth(ctx), requireWorkspace(ctx));

  const companyView = (c: { id: string; name: string; color: string; archivedAt: Date | null }, count = 0) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    archived: c.archivedAt !== null,
    subscriptionCount: count,
  });

  async function findCompany(workspaceId: string, companyId: string) {
    const c = await ctx.db.company.findFirst({ where: { id: companyId, workspaceId } });
    if (!c) throw notFound('Company');
    return c;
  }

  // --- Companies ---
  router.get('/companies', async (req, res) => {
    const { includeArchived } = parseQuery(req, CompanyQuery);
    const rows = await ctx.db.company.findMany({
      where: { workspaceId: workspaceIdOf(req), ...(includeArchived === 'true' ? {} : { archivedAt: null }) },
      orderBy: { name: 'asc' },
      include: { _count: { select: { subscriptions: { where: { status: { not: 'ARCHIVED' } } } } } },
    });
    res.json(rows.map((c) => companyView(c, c._count.subscriptions)));
  });

  router.post('/companies', requirePermission('companies:manage'), async (req, res) => {
    const body = parseBody(req, CompanyBody);
    const workspaceId = workspaceIdOf(req);
    try {
      const c = await ctx.db.company.create({ data: { ...body, workspaceId } });
      await audit(ctx, workspaceId, userIdOf(req), 'company.create', 'Company', c.id, { name: c.name });
      res.status(201).json(companyView(c));
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError(409, 'CONFLICT', 'A company with this name already exists');
      throw err;
    }
  });

  router.patch('/companies/:id', requirePermission('companies:manage'), async (req, res) => {
    const { id: companyId } = parseParams(req, Params);
    const body = parseBody(req, CompanyPatch);
    const workspaceId = workspaceIdOf(req);
    await findCompany(workspaceId, companyId);
    try {
      const c = await ctx.db.company.update({ where: { id: companyId }, data: body });
      await audit(ctx, workspaceId, userIdOf(req), 'company.update', 'Company', c.id, { fields: Object.keys(body) });
      res.json(companyView(c));
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError(409, 'CONFLICT', 'A company with this name already exists');
      throw err;
    }
  });

  /** Deletes an unused company; a company with subscriptions is archived instead so history is kept. */
  router.delete('/companies/:id', requirePermission('companies:manage'), async (req, res) => {
    const { id: companyId } = parseParams(req, Params);
    const workspaceId = workspaceIdOf(req);
    const c = await findCompany(workspaceId, companyId);
    const used = await ctx.db.subscription.count({ where: { companyId, workspaceId } });
    if (used === 0) {
      await ctx.db.company.delete({ where: { id: c.id } });
      await audit(ctx, workspaceId, userIdOf(req), 'company.delete', 'Company', c.id, { name: c.name });
      res.json({ deleted: true, archived: false });
      return;
    }
    await ctx.db.company.update({ where: { id: c.id }, data: { archivedAt: ctx.clock.now() } });
    await audit(ctx, workspaceId, userIdOf(req), 'company.archive', 'Company', c.id, { name: c.name });
    res.json({ deleted: false, archived: true });
  });

  router.post('/companies/:id/unarchive', requirePermission('companies:manage'), async (req, res) => {
    const { id: companyId } = parseParams(req, Params);
    await findCompany(workspaceIdOf(req), companyId);
    const c = await ctx.db.company.update({ where: { id: companyId }, data: { archivedAt: null } });
    res.json(companyView(c));
  });

  // --- Categories (built-in defaults + this workspace's custom ones) ---
  router.get('/categories', async (req, res) => {
    const workspaceId = workspaceIdOf(req);
    const rows = await ctx.db.category.findMany({
      where: { OR: [{ workspaceId: null }, { workspaceId }] },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { subscriptions: { where: { workspaceId, status: { not: 'ARCHIVED' } } } } } },
    });
    res.json(
      rows.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        isDefault: c.isDefault,
        subscriptionCount: c._count.subscriptions,
      })),
    );
  });

  router.post('/categories', requirePermission('categories:manage'), async (req, res) => {
    const body = parseBody(req, CategoryBody);
    const workspaceId = workspaceIdOf(req);
    const clash = await ctx.db.category.findFirst({ where: { name: body.name, OR: [{ workspaceId: null }, { workspaceId }] } });
    if (clash) throw new AppError(409, 'CONFLICT', 'A category with this name already exists');
    const c = await ctx.db.category.create({ data: { ...body, workspaceId, isDefault: false } });
    await audit(ctx, workspaceId, userIdOf(req), 'category.create', 'Category', c.id, { name: c.name });
    res.status(201).json({ id: c.id, name: c.name, icon: c.icon, color: c.color, isDefault: false, subscriptionCount: 0 });
  });

  router.patch('/categories/:id', requirePermission('categories:manage'), async (req, res) => {
    const { id: categoryId } = parseParams(req, Params);
    const body = parseBody(req, CategoryBody.partial());
    // Built-in categories (workspaceId = null) are never matched here, so they can't be edited.
    const r = await ctx.db.category.updateMany({ where: { id: categoryId, workspaceId: workspaceIdOf(req) }, data: body });
    if (r.count === 0) throw notFound('Category');
    const c = await ctx.db.category.findUniqueOrThrow({ where: { id: categoryId } });
    res.json({ id: c.id, name: c.name, icon: c.icon, color: c.color, isDefault: false });
  });

  router.delete('/categories/:id', requirePermission('categories:manage'), async (req, res) => {
    const { id: categoryId } = parseParams(req, Params);
    const c = await ctx.db.category.findFirst({ where: { id: categoryId, workspaceId: workspaceIdOf(req) } });
    if (!c) throw notFound('Category');
    const used = await ctx.db.subscription.count({ where: { categoryId } });
    if (used > 0) throw new AppError(409, 'CATEGORY_IN_USE', `Move its ${used} subscription(s) to another category first`);
    await ctx.db.category.delete({ where: { id: categoryId } });
    res.status(204).end();
  });

  return router;
}
