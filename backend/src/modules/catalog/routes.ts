import { Router } from 'express';
import { z } from 'zod';

import type { AppContext } from '../../context.js';
import { AppError, notFound } from '../../http/errors.js';
import { requireAuth, requirePermission, requireWorkspace, userIdOf, workspaceIdOf } from '../../http/middleware/auth.js';
import { id } from '../../http/schemas.js';
import { parseBody, parseParams } from '../../http/validate.js';
import { audit } from '../workspaces/service.js';

const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a #RRGGBB colour');
const name = z.string().trim().min(1, 'Enter a name').max(60);
const CategoryBody = z.object({ name, icon: z.string().regex(/^[a-z][a-z0-9-]{0,29}$/), color });
const Params = z.object({ id });

/** Categories inside the active workspace (companies: modules/companies). */
export function catalogRouter(ctx: AppContext): Router {
  const router = Router();
  // Mounted at the API root, so scope auth to this router's own paths only.
  router.use(['/categories'], requireAuth(ctx), requireWorkspace(ctx));

  // --- Categories (built-in defaults + this workspace's custom ones) ---
  router.get('/categories', async (req, res) => {
    const workspaceId = workspaceIdOf(req);
    const rows = await ctx.db.category.findMany({
      where: { OR: [{ workspaceId: null }, { workspaceId }] },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { bills: { where: { workspaceId, status: { not: 'ARCHIVED' } } } } } },
    });
    res.json(
      rows.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        isDefault: c.isDefault,
        billCount: c._count.bills,
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
    res.status(201).json({ id: c.id, name: c.name, icon: c.icon, color: c.color, isDefault: false, billCount: 0 });
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
    const used = await ctx.db.bill.count({ where: { categoryId } });
    if (used > 0) throw new AppError(409, 'CATEGORY_IN_USE', `Move its ${used} bill(s) to another category first`);
    await ctx.db.category.delete({ where: { id: categoryId } });
    res.status(204).end();
  });

  return router;
}
