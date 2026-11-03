/**
 * Role permissions (pure, no I/O).
 *
 * ADMIN    everything
 * FINANCE  manage subscriptions, payments, companies, categories and reports; cannot manage members
 * VIEWER   read-only; receives reminders; sees subscription keys masked only
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
  | 'subscriptions:manage'
  | 'subscriptionKeys:reveal'
  | 'payments:record'
  | 'payments:edit'
  | 'reports:view'
  | 'audit:view';

const MANAGERS: readonly Role[] = ['ADMIN', 'FINANCE'];

const WORKSPACE_ACTIONS: Record<WorkspaceAction, readonly Role[]> = {
  'workspace:update': ['ADMIN'],
  'workspace:delete': ['ADMIN'],
  'members:manage': ['ADMIN'],
  'invites:manage': ['ADMIN'],
  'companies:manage': MANAGERS,
  'categories:manage': MANAGERS,
  'subscriptions:manage': MANAGERS,
  'subscriptionKeys:reveal': MANAGERS,
  'payments:record': MANAGERS,
  'payments:edit': MANAGERS,
  // Read-only access includes reports (see DECISIONS.md D15).
  'reports:view': ROLES,
  'audit:view': MANAGERS,
};

export function can(role: Role, action: WorkspaceAction): boolean {
  return WORKSPACE_ACTIONS[action].includes(role);
}

export interface Actor {
  userId: string;
  role: Role;
}
