import type { AppContext } from '../../context.js';
import { roleIn, type Access } from '../../domain/access.js';
import type { Role } from '../../domain/permissions.js';

/**
 * Every member's company access in one workspace (two queries). Used where there is no
 * request — the reminder planner, summaries and event notifications — so recipients
 * follow the same rules as the API: nobody hears about a company they can't see.
 */
export async function workspaceAccess(ctx: AppContext, workspaceId: string): Promise<Map<string, Access>> {
  const [members, grants] = await Promise.all([
    ctx.db.membership.findMany({ where: { workspaceId }, select: { userId: true, role: true, allCompanies: true } }),
    ctx.db.companyAccess.findMany({ where: { workspaceId }, select: { userId: true, companyId: true, role: true } }),
  ]);
  const out = new Map<string, Access>();
  for (const m of members) {
    out.set(m.userId, { workspaceRole: m.role as Role, all: m.role === 'ADMIN' || m.allCompanies, companyRoles: {} });
  }
  for (const g of grants) {
    const a = out.get(g.userId);
    if (a && !a.all) (a.companyRoles as Record<string, Role>)[g.companyId] = g.role as Role;
  }
  return out;
}

/** Members whose role in `companyId` is one of `roles` (all roles when omitted). */
export function membersOfCompany(access: Map<string, Access>, companyId: string, roles?: readonly Role[]): string[] {
  const out: string[] = [];
  for (const [userId, a] of access) {
    const role = roleIn(a, companyId);
    if (role && (!roles || roles.includes(role))) out.push(userId);
  }
  return out;
}
