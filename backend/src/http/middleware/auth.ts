import type { Request, RequestHandler } from 'express';

import type { AppContext } from '../../context.js';
import { canAnywhere, canIn, canSee, visibleCompanyIds, type Access } from '../../domain/access.js';
import type { Actor, Role, WorkspaceAction } from '../../domain/permissions.js';
import { verifyAccessToken } from '../../modules/auth/tokens.js';
import { AppError, forbidden, notFound, unauthorized } from '../errors.js';

/** Require a valid Bearer access token; sets req.userId. */
export function requireAuth(ctx: AppContext): RequestHandler {
  return async (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    req.userId = await verifyAccessToken(ctx, header.slice(7).trim());
    next();
  };
}

/**
 * Resolve the active workspace from the X-Workspace-Id header and the caller's membership.
 * Non-members get 404 (not 403) so workspace ids can't be probed.
 */
export function requireWorkspace(ctx: AppContext): RequestHandler {
  return async (req, _res, next) => {
    if (!req.userId) throw unauthorized();
    const workspaceId = req.header('x-workspace-id');
    if (!workspaceId) throw new AppError(400, 'WORKSPACE_REQUIRED', 'Choose a workspace (X-Workspace-Id header)');
    const membership = await ctx.db.membership.findUnique({
      where: { userId_workspaceId: { userId: req.userId, workspaceId: workspaceId } },
      include: { workspace: { select: { timezone: true } } },
    });
    if (!membership) throw notFound('Workspace');
    const all = membership.role === 'ADMIN' || membership.allCompanies;
    const rows = all
      ? []
      : await ctx.db.companyAccess.findMany({ where: { userId: req.userId, workspaceId }, select: { companyId: true, role: true } });
    const access: Access = {
      workspaceRole: membership.role,
      all,
      companyRoles: Object.fromEntries(rows.map((r) => [r.companyId, r.role as Role])),
    };
    req.workspace = { id: workspaceId, role: membership.role, timezone: membership.workspace.timezone, access };
    next();
  };
}

/** Guard an org-level action by role. Must run after requireWorkspace. */
export function requirePermission(action: WorkspaceAction): RequestHandler {
  return (req, _res, next) => {
    if (!req.workspace) throw unauthorized();
    if (!canAnywhere(req.workspace.access, action)) throw forbidden();
    next();
  };
}

export function accessOf(req: Request): Access {
  if (!req.workspace) throw unauthorized();
  return req.workspace.access;
}

/** Prisma filter on `companyId` for the companies the caller can see ({} = all of them). */
export function companyScope(req: Request): { companyId?: { in: string[] } } {
  const ids = visibleCompanyIds(accessOf(req));
  return ids ? { companyId: { in: ids } } : {};
}

/** The same filter for the Company table itself (`id`). */
export function companyIdScope(req: Request): { id?: { in: string[] } } {
  const ids = visibleCompanyIds(accessOf(req));
  return ids ? { id: { in: ids } } : {};
}

/** The company must be visible to the caller (404 otherwise, so ids can't be probed). */
export function assertCompanyVisible(req: Request, companyId: string): void {
  if (!canSee(accessOf(req), companyId)) throw notFound('Company');
}

/** The caller must hold `action` in this company: 404 when they can't see it, 403 when they can't act. */
export function assertCan(req: Request, action: WorkspaceAction, companyId: string): void {
  assertCompanyVisible(req, companyId);
  if (!canIn(accessOf(req), action, companyId)) throw forbidden();
}

export function actorOf(req: Request): Actor {
  if (!req.userId || !req.workspace) throw unauthorized();
  return { userId: req.userId, role: req.workspace.role };
}

/** The workspace id for the current request — use in every business query. */
export function workspaceIdOf(req: Request): string {
  if (!req.workspace) throw unauthorized();
  return req.workspace.id;
}

export function userIdOf(req: Request): string {
  if (!req.userId) throw unauthorized();
  return req.userId;
}
