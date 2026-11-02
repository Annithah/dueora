import { Router } from 'express';
import { z } from 'zod';

import type { AppContext } from '../../context.js';
import { AppError, notFound } from '../../http/errors.js';
import { orgIdOf, requireAuth, requireOrg, requirePermission, userIdOf } from '../../http/middleware/auth.js';
import { id } from '../../http/schemas.js';
import { parseBody, parseParams } from '../../http/validate.js';
import { audit } from '../workspaces/service.js';

const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a #RRGGBB colour');
const PlatformBody = z.object({ name: z.string().trim().min(1).max(60), color: color.default('#0F5C5C') });
const CategoryBody = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.string().regex(/^[a-z][a-z0-9-]{0,29}$/),
  color,
});
const Params = z.object({ id });

/** Platforms (projects/groups such as "KT Radio") and categories. */
export function catalogRouter(ctx: AppContext): Router {
  const router = Router();
  // Mounted at the API root, so scope auth to this router's own paths only.
  router.use(['/platforms', '/categories'], requireAuth(ctx), requireOrg(ctx));

  // --- Platforms ---
  router.get('/platforms', async (req, res) => {
    const rows = await ctx.db.platform.findMany({
      where: { organizationId: orgIdOf(req) },
      orderBy: { name: 'asc' },
      include: { _count: { select: { obligations: { where: { status: { not: 'ARCHIVED' } } } } } },
    });
    res.json(rows.map((p) => ({ id: p.id, name: p.name, color: p.color, obligationCount: p._count.obligations })));
  });

  router.post('/platforms', requirePermission('platforms:manage'), async (req, res) => {
    const body = parseBody(req, PlatformBody);
    const p = await ctx.db.platform.create({ data: { ...body, organizationId: orgIdOf(req) } });
    await audit(ctx, orgIdOf(req), userIdOf(req), 'platform.create', 'Platform', p.id, { name: p.name });
    res.status(201).json({ id: p.id, name: p.name, color: p.color, obligationCount: 0 });
  });

  router.patch('/platforms/:id', requirePermission('platforms:manage'), async (req, res) => {
    const { id: pid } = parseParams(req, Params);
    const body = parseBody(req, PlatformBody.partial());
    const r = await ctx.db.platform.updateMany({ where: { id: pid, organizationId: orgIdOf(req) }, data: body });
    if (r.count === 0) throw notFound('Platform');
    const p = await ctx.db.platform.findUniqueOrThrow({ where: { id: pid } });
    res.json({ id: p.id, name: p.name, color: p.color });
  });

  router.delete('/platforms/:id', requirePermission('platforms:manage'), async (req, res) => {
    const { id: pid } = parseParams(req, Params);
    // Obligations keep existing; they just lose the grouping (onDelete: SetNull).
    const r = await ctx.db.platform.deleteMany({ where: { id: pid, organizationId: orgIdOf(req) } });
    if (r.count === 0) throw notFound('Platform');
    await audit(ctx, orgIdOf(req), userIdOf(req), 'platform.delete', 'Platform', pid);
    res.status(204).end();
  });

  // --- Categories (built-in defaults + this workspace's custom ones) ---
  router.get('/categories', async (req, res) => {
    const rows = await ctx.db.category.findMany({
      where: { OR: [{ organizationId: null }, { organizationId: orgIdOf(req) }] },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    res.json(rows.map((c) => ({ id: c.id, name: c.name, icon: c.icon, color: c.color, isDefault: c.isDefault })));
  });

  router.post('/categories', requirePermission('categories:manage'), async (req, res) => {
    const body = parseBody(req, CategoryBody);
    const clash = await ctx.db.category.findFirst({
      where: { name: body.name, OR: [{ organizationId: null }, { organizationId: orgIdOf(req) }] },
    });
    if (clash) throw new AppError(409, 'CONFLICT', 'A category with this name already exists');
    const c = await ctx.db.category.create({ data: { ...body, organizationId: orgIdOf(req), isDefault: false } });
    res.status(201).json({ id: c.id, name: c.name, icon: c.icon, color: c.color, isDefault: false });
  });

  router.patch('/categories/:id', requirePermission('categories:manage'), async (req, res) => {
    const { id: cid } = parseParams(req, Params);
    const body = parseBody(req, CategoryBody.partial());
    // Built-in categories (organizationId = null) are never matched here, so they can't be edited.
    const r = await ctx.db.category.updateMany({ where: { id: cid, organizationId: orgIdOf(req) }, data: body });
    if (r.count === 0) throw notFound('Category');
    const c = await ctx.db.category.findUniqueOrThrow({ where: { id: cid } });
    res.json({ id: c.id, name: c.name, icon: c.icon, color: c.color, isDefault: false });
  });

  router.delete('/categories/:id', requirePermission('categories:manage'), async (req, res) => {
    const { id: cid } = parseParams(req, Params);
    const c = await ctx.db.category.findFirst({ where: { id: cid, organizationId: orgIdOf(req) } });
    if (!c) throw notFound('Category');
    const used = await ctx.db.obligation.count({ where: { categoryId: cid } });
    if (used > 0) throw new AppError(409, 'CATEGORY_IN_USE', `Move its ${used} payment(s) to another category first`);
    await ctx.db.category.delete({ where: { id: cid } });
    res.status(204).end();
  });

  return router;
}
