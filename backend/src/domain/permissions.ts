/**
 * Role permissions (pure, no I/O).
 *
 * ADMIN       everything
 * FINANCE     manage obligations, payments, reports; cannot manage members
 * DEPARTMENT  manage obligations in their own department; view everything else
 * EMPLOYEE    view obligations assigned to them; receive reminders
 */

export type Role = 'ADMIN' | 'FINANCE' | 'DEPARTMENT' | 'EMPLOYEE';

export type OrgAction =
  | 'workspace:update'
  | 'workspace:delete'
  | 'members:manage'
  | 'departments:manage'
  | 'invites:manage'
  | 'exchangeRates:manage'
  | 'platforms:manage'
  | 'categories:manage'
  | 'obligations:create'
  | 'obligations:viewAll'
  | 'payments:edit'
  | 'reports:view'
  | 'audit:view';

const ORG_ACTIONS: Record<OrgAction, readonly Role[]> = {
  'workspace:update': ['ADMIN'],
  'workspace:delete': ['ADMIN'],
  'members:manage': ['ADMIN'],
  'departments:manage': ['ADMIN'],
  'invites:manage': ['ADMIN'],
  'exchangeRates:manage': ['ADMIN', 'FINANCE'],
  'platforms:manage': ['ADMIN', 'FINANCE', 'DEPARTMENT'],
  'categories:manage': ['ADMIN', 'FINANCE', 'DEPARTMENT'],
  'obligations:create': ['ADMIN', 'FINANCE', 'DEPARTMENT'],
  'obligations:viewAll': ['ADMIN', 'FINANCE', 'DEPARTMENT'],
  'payments:edit': ['ADMIN', 'FINANCE'],
  'reports:view': ['ADMIN', 'FINANCE'],
  'audit:view': ['ADMIN', 'FINANCE'],
};

export function can(role: Role, action: OrgAction): boolean {
  return ORG_ACTIONS[action].includes(role);
}

export interface Actor {
  userId: string;
  role: Role;
  departmentId: string | null;
}

export interface ObligationRef {
  departmentId: string | null;
  assigneeUserId: string | null;
}

/** May the actor see this obligation (and its payments/attachments)? */
export function canViewObligation(actor: Actor, o: ObligationRef): boolean {
  if (actor.role !== 'EMPLOYEE') return true;
  return o.assigneeUserId === actor.userId;
}

/** May the actor edit, archive, delete, or record payments on this obligation? */
export function canManageObligation(actor: Actor, o: ObligationRef): boolean {
  switch (actor.role) {
    case 'ADMIN':
    case 'FINANCE':
      return true;
    case 'DEPARTMENT':
      return actor.departmentId !== null && o.departmentId === actor.departmentId;
    case 'EMPLOYEE':
      return false;
  }
}

/** Department officers may only create obligations inside their own department. */
export function canCreateObligationIn(actor: Actor, departmentId: string | null): boolean {
  if (actor.role === 'ADMIN' || actor.role === 'FINANCE') return true;
  if (actor.role === 'DEPARTMENT') return actor.departmentId !== null && departmentId === actor.departmentId;
  return false;
}

/** Recording a payment follows manage rights (employees only view). */
export const canRecordPayment = canManageObligation;
