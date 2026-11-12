/**
 * Company access (pure, no I/O) — Finalize brief Part 2.
 *
 * - A workspace ADMIN sees and manages every company.
 * - Any other member either has access to ALL companies (current and future) with their
 *   membership role, or to a chosen list of companies, each with its own role
 *   (FINANCE or VIEWER) stored in CompanyAccess.
 *
 * Every business query is scoped with `visibleCompanyIds`, and every change to a bill,
 * payment or category is checked with `canIn` against the bill's own company.
 */
import { can, type Role, type WorkspaceAction } from './permissions.js';

export interface Access {
  /** Membership role in the workspace (ADMIN, or the default role for "all companies"). */
  workspaceRole: Role;
  /** True for admins and for members given access to all companies. */
  all: boolean;
  /** companyId → role, used only when `all` is false. */
  companyRoles: Readonly<Record<string, Role>>;
}

/** Actions decided per company. Everything else is decided by the workspace role alone. */
export const COMPANY_ACTIONS: ReadonlySet<WorkspaceAction> = new Set<WorkspaceAction>([
  'bills:manage',
  'accountRefs:reveal',
  'payments:record',
  'payments:edit',
  'categories:manage',
  'reports:view',
  'budgets:manage',
  'data:export',
  'import:run',
  'audit:view',
]);

/** The caller's role for one company, or null when they can't see it at all. */
export function roleIn(a: Access, companyId: string): Role | null {
  if (a.workspaceRole === 'ADMIN') return 'ADMIN';
  if (a.all) return a.workspaceRole;
  return a.companyRoles[companyId] ?? null;
}

export function canIn(a: Access, action: WorkspaceAction, companyId: string): boolean {
  const role = roleIn(a, companyId);
  return role !== null && can(role, action);
}

/** May the caller do this anywhere (used by route guards; services then check the company)? */
export function canAnywhere(a: Access, action: WorkspaceAction): boolean {
  if (!COMPANY_ACTIONS.has(action) || a.all || a.workspaceRole === 'ADMIN') return can(a.workspaceRole, action);
  return Object.values(a.companyRoles).some((role) => can(role, action));
}

/** null = every company in the workspace; otherwise the only company ids the caller may see. */
export function visibleCompanyIds(a: Access): string[] | null {
  return a.all || a.workspaceRole === 'ADMIN' ? null : Object.keys(a.companyRoles);
}

export function canSee(a: Access, companyId: string): boolean {
  return roleIn(a, companyId) !== null;
}

/** Highest role across the member's companies — what /me shows as "your role". */
export function strongestRole(roles: Iterable<Role>): Role {
  let best: Role = 'VIEWER';
  for (const r of roles) {
    if (r === 'ADMIN') return 'ADMIN';
    if (r === 'FINANCE') best = 'FINANCE';
  }
  return best;
}
