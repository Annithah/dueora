import { Router } from 'express';
import { z } from 'zod';

import type { AppContext } from '../../context.js';
import { Prisma } from '../../generated/prisma/client.js';
import { can } from '../../domain/permissions.js';
import { AppError, badRequest, forbidden, notFound } from '../../http/errors.js';
import { actorOf, orgIdOf, requireAuth, requireOrg, requirePermission, userIdOf } from '../../http/middleware/auth.js';
import { currency, email, id, minutesOfDay, reminderOffsets, timeZone } from '../../http/schemas.js';
import { checkUpload, singleFile } from '../../http/upload.js';
import { parseBody, parseParams, parseQuery } from '../../http/validate.js';
import { publicUser } from '../auth/service.js';

import * as ws from './service.js';

const roleEnum = z.enum(['ADMIN', 'FINANCE', 'DEPARTMENT', 'EMPLOYEE']);

const CreateBody = z.object({
  name: z.string().trim().min(1, 'Enter a workspace name').max(100),
  type: z.enum(['COMPANY', 'PERSONAL']).default('COMPANY'),
  defaultCurrency: currency.default('USD'),
  timezone: timeZone.default('Africa/Kigali'),
});

const UpdateBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    type: z.enum(['COMPANY', 'PERSONAL']),
    defaultCurrency: currency,
    timezone: timeZone,
    reminderHour: z.number().int().min(0).max(23),
    quietHoursStart: minutesOfDay.nullable(),
    quietHoursEnd: minutesOfDay.nullable(),
    defaultReminderOffsets: reminderOffsets,
  })
  .partial()
  .refine(
    (b) => (b.quietHoursStart === undefined) === (b.quietHoursEnd === undefined) && (b.quietHoursStart === null) === (b.quietHoursEnd === null),
    { message: 'Set both quiet-hours start and end (or clear both)' },
  );

const RateBody = z.object({ rate: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)]) });
const DeptBody = z.object({ name: z.string().trim().min(1).max(60) });
const MemberBody = z.object({ role: roleEnum, departmentId: id.nullable() }).partial();
const InviteBody = z.object({ email, role: roleEnum.default('EMPLOYEE'), departmentId: id.nullable().optional() });
const TokenBody = z.object({ token: z.string().min(20).max(200) });
const DeleteBody = z.object({ confirmName: z.string() });

export function workspacesRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth(ctx));
  const org = requireOrg(ctx);

  // --- Collection (no workspace selected yet) ---
  router.get('/', async (req, res) => {
    res.json((await publicUser(ctx, userIdOf(req))).workspaces);
  });

  router.post('/', async (req, res) => {
    res.status(201).json(await ws.createWorkspace(ctx, userIdOf(req), parseBody(req, CreateBody)));
  });

  // --- Current workspace (X-Org-Id) ---
  router.get('/current', org, async (req, res) => {
    res.json({ ...(await ws.getWorkspace(ctx, orgIdOf(req))), myRole: req.org?.role });
  });

  router.patch('/current', org, requirePermission('workspace:update'), async (req, res) => {
    const body = parseBody(req, UpdateBody);
    await ctx.db.organization.update({ where: { id: orgIdOf(req) }, data: body });
    await ws.audit(ctx, orgIdOf(req), userIdOf(req), 'workspace.update', 'Organization', orgIdOf(req), body);
    res.json(await ws.getWorkspace(ctx, orgIdOf(req)));
  });

  router.delete('/current', org, requirePermission('workspace:delete'), async (req, res) => {
    const { confirmName } = parseBody(req, DeleteBody);
    const current = await ctx.db.organization.findUniqueOrThrow({ where: { id: orgIdOf(req) } });
    if (confirmName.trim() !== current.name) throw badRequest('Type the workspace name exactly to confirm');
    const files = await ctx.db.attachment.findMany({ where: { organizationId: current.id }, select: { fileKey: true } });
    await ctx.db.organization.delete({ where: { id: current.id } });
    await Promise.allSettled([...files.map((f) => ctx.storage.delete(f.fileKey)), ctx.storage.delete(`logos/${current.id}`)]);
    res.status(204).end();
  });

  router.post('/current/logo', org, requirePermission('workspace:update'), singleFile(), async (req, res) => {
    const mime = checkUpload(req.file, ['image/png', 'image/jpeg', 'image/webp']);
    const orgId = orgIdOf(req);
    await ctx.storage.put(`logos/${orgId}`, req.file!.buffer, mime);
    const logoUrl = `${ctx.env.API_BASE_URL}/api/v1/public/logos/${orgId}?v=${ctx.clock.now().getTime()}`;
    await ctx.db.organization.update({ where: { id: orgId }, data: { logoUrl } });
    res.json(await ws.getWorkspace(ctx, orgId));
  });

  router.delete('/current/logo', org, requirePermission('workspace:update'), async (req, res) => {
    await ctx.storage.delete(`logos/${orgIdOf(req)}`);
    await ctx.db.organization.update({ where: { id: orgIdOf(req) }, data: { logoUrl: null } });
    res.json(await ws.getWorkspace(ctx, orgIdOf(req)));
  });

  router.put('/current/exchange-rates/:currency', org, requirePermission('exchangeRates:manage'), async (req, res) => {
    const from = currency.parse(req.params.currency);
    if (from === req.org?.defaultCurrency) throw badRequest('No rate needed for the default currency');
    const { rate } = parseBody(req, RateBody);
    const decimal = new Prisma.Decimal(rate);
    await ctx.db.exchangeRate.upsert({
      where: { organizationId_fromCurrency: { organizationId: orgIdOf(req), fromCurrency: from } },
      update: { rate: decimal },
      create: { organizationId: orgIdOf(req), fromCurrency: from, rate: decimal },
    });
    res.json(await ws.getWorkspace(ctx, orgIdOf(req)));
  });

  router.delete('/current/exchange-rates/:currency', org, requirePermission('exchangeRates:manage'), async (req, res) => {
    await ctx.db.exchangeRate.deleteMany({ where: { organizationId: orgIdOf(req), fromCurrency: currency.parse(req.params.currency) } });
    res.json(await ws.getWorkspace(ctx, orgIdOf(req)));
  });

  // --- Departments ---
  router.get('/current/departments', org, async (req, res) => {
    res.json(await ctx.db.department.findMany({ where: { organizationId: orgIdOf(req) }, orderBy: { name: 'asc' }, select: { id: true, name: true } }));
  });

  router.post('/current/departments', org, requirePermission('departments:manage'), async (req, res) => {
    const { name } = parseBody(req, DeptBody);
    const dept = await ctx.db.department.create({ data: { organizationId: orgIdOf(req), name }, select: { id: true, name: true } });
    res.status(201).json(dept);
  });

  router.patch('/current/departments/:id', org, requirePermission('departments:manage'), async (req, res) => {
    const { id: deptId } = parseParams(req, z.object({ id }));
    const { name } = parseBody(req, DeptBody);
    const r = await ctx.db.department.updateMany({ where: { id: deptId, organizationId: orgIdOf(req) }, data: { name } });
    if (r.count === 0) throw notFound('Department');
    res.json({ id: deptId, name });
  });

  router.delete('/current/departments/:id', org, requirePermission('departments:manage'), async (req, res) => {
    const { id: deptId } = parseParams(req, z.object({ id }));
    const officers = await ctx.db.membership.count({ where: { organizationId: orgIdOf(req), departmentId: deptId, role: 'DEPARTMENT' } });
    if (officers > 0) throw new AppError(409, 'DEPARTMENT_IN_USE', 'Move its department officers first');
    const r = await ctx.db.department.deleteMany({ where: { id: deptId, organizationId: orgIdOf(req) } });
    if (r.count === 0) throw notFound('Department');
    res.status(204).end();
  });

  // --- Members ---
  router.get('/current/members', org, async (req, res) => {
    res.json(await ws.listMembers(ctx, orgIdOf(req)));
  });

  router.patch('/current/members/:id', org, requirePermission('members:manage'), async (req, res) => {
    const { id: membershipId } = parseParams(req, z.object({ id }));
    res.json(await ws.updateMember(ctx, orgIdOf(req), userIdOf(req), membershipId, parseBody(req, MemberBody)));
  });

  router.delete('/current/members/:id', org, async (req, res) => {
    const { id: membershipId } = parseParams(req, z.object({ id }));
    const target = await ctx.db.membership.findFirst({ where: { id: membershipId, organizationId: orgIdOf(req) } });
    // Anyone may leave; removing someone else needs members:manage.
    if (target?.userId !== userIdOf(req) && !can(actorOf(req).role, 'members:manage')) throw forbidden();
    await ws.removeMember(ctx, orgIdOf(req), userIdOf(req), membershipId);
    res.status(204).end();
  });

  // --- Invites (admin side) ---
  router.get('/current/invites', org, requirePermission('invites:manage'), async (req, res) => {
    res.json(await ws.listInvites(ctx, orgIdOf(req)));
  });

  router.post('/current/invites', org, requirePermission('invites:manage'), async (req, res) => {
    res.status(201).json(await ws.createInvite(ctx, orgIdOf(req), userIdOf(req), parseBody(req, InviteBody)));
  });

  router.delete('/current/invites/:id', org, requirePermission('invites:manage'), async (req, res) => {
    const { id: inviteId } = parseParams(req, z.object({ id }));
    await ws.revokeInvite(ctx, orgIdOf(req), userIdOf(req), inviteId);
    res.status(204).end();
  });

  // --- Invites (invitee side) ---
  router.post('/accept-invite', async (req, res) => {
    const { token } = parseBody(req, TokenBody);
    res.json(await ws.acceptInvite(ctx, userIdOf(req), token));
  });

  return router;
}

/** Unauthenticated routes: invite preview and workspace logos (used in emails and the app header). */
export function publicRouter(ctx: AppContext): Router {
  const router = Router();

  router.get('/invites/preview', async (req, res) => {
    const { token } = parseQuery(req, z.object({ token: z.string().min(20).max(200) }));
    res.json(await ws.previewInvite(ctx, token));
  });

  router.get('/logos/:orgId', async (req, res) => {
    const { orgId } = parseParams(req, z.object({ orgId: id }));
    const file = await ctx.storage.get(`logos/${orgId}`);
    if (!file) throw notFound('Logo');
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.body);
  });

  return router;
}
