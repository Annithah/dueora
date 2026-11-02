import type { Request, RequestHandler } from 'express';

import type { AppContext } from '../../context.js';
import { can, type Actor, type OrgAction } from '../../domain/permissions.js';
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
 * Resolve the active workspace from the X-Org-Id header and the caller's membership.
 * Non-members get 404 (not 403) so workspace ids can't be probed.
 */
export function requireOrg(ctx: AppContext): RequestHandler {
  return async (req, _res, next) => {
    if (!req.userId) throw unauthorized();
    const orgId = req.header('x-org-id');
    if (!orgId) throw new AppError(400, 'ORG_REQUIRED', 'Choose a workspace (X-Org-Id header)');
    const membership = await ctx.db.membership.findUnique({
      where: { userId_organizationId: { userId: req.userId, organizationId: orgId } },
      include: { organization: { select: { timezone: true, defaultCurrency: true } } },
    });
    if (!membership) throw notFound('Workspace');
    req.org = {
      id: orgId,
      role: membership.role,
      departmentId: membership.departmentId,
      timezone: membership.organization.timezone,
      defaultCurrency: membership.organization.defaultCurrency,
    };
    next();
  };
}

/** Guard an org-level action by role. Must run after requireOrg. */
export function requirePermission(action: OrgAction): RequestHandler {
  return (req, _res, next) => {
    if (!req.org) throw unauthorized();
    if (!can(req.org.role, action)) throw forbidden();
    next();
  };
}

export function actorOf(req: Request): Actor {
  if (!req.userId || !req.org) throw unauthorized();
  return { userId: req.userId, role: req.org.role, departmentId: req.org.departmentId };
}

/** The organization id for the current request — use in every business query. */
export function orgIdOf(req: Request): string {
  if (!req.org) throw unauthorized();
  return req.org.id;
}

export function userIdOf(req: Request): string {
  if (!req.userId) throw unauthorized();
  return req.userId;
}
