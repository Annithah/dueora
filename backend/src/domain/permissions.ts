/**
 * Role permissions (pure, no I/O).
 *
 * ADMIN    everything
 * FINANCE  manage bills, payments, companies, categories and reports; cannot manage members
 * VIEWER   read-only; receives reminders; sees account references masked only
 */

export type Role = 'ADMIN' | 'FINANCE' | 'VIEWER';

export const ROLES: readonly Role[] = ['ADMIN', 'FINANCE', 'VIEWER'];

export type WorkspaceAction =
  | 'workspace:update'
  | 'workspace:delete'
  | 'members:manage'
  | 'invites:manage'
  | 'companies:manage'
  | 'categories:manage'
  | 'bills:manage'
  | 'accountRefs:reveal'
  | 'payments:record'
  | 'payments:edit'
  | 'reports:view'
  | 'budgets:manage'
  | 'data:export'
  | 'import:run'
  | 'ai:configure'
  | 'audit:view';

const MANAGERS: readonly Role[] = ['ADMIN', 'FINANCE'];

const WORKSPACE_ACTIONS: Record<WorkspaceAction, readonly Role[]> = {
  'workspace:update': ['ADMIN'],
  'workspace:delete': ['ADMIN'],
  'members:manage': ['ADMIN'],
  'invites:manage': ['ADMIN'],
  'companies:manage': MANAGERS,
  'categories:manage': MANAGERS,
  'bills:manage': MANAGERS,
  'accountRefs:reveal': MANAGERS,
  'payments:record': MANAGERS,
  'payments:edit': MANAGERS,
  // Read-only access includes reports (see DECISIONS.md D15).
  'reports:view': ROLES,
  'budgets:manage': MANAGERS,
  'data:export': MANAGERS,
  'import:run': MANAGERS,
  'ai:configure': ['ADMIN'],
  'audit:view': MANAGERS,
};

export function can(role: Role, action: WorkspaceAction): boolean {
  return WORKSPACE_ACTIONS[action].includes(role);
}

export interface Actor {
  userId: string;
  role: Role;
}
