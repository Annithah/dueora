import { describe, expect, it } from 'vitest';

import {
  can,
  canCreateObligationIn,
  canManageObligation,
  canViewObligation,
  type Actor,
  type OrgAction,
  type Role,
} from './permissions.js';

const ROLES: Role[] = ['ADMIN', 'FINANCE', 'DEPARTMENT', 'EMPLOYEE'];

const matrix: Record<OrgAction, Role[]> = {
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

describe('can()', () => {
  for (const [action, allowed] of Object.entries(matrix) as [OrgAction, Role[]][]) {
    it.each(ROLES)(`${action} for %s`, (role) => {
      expect(can(role, action)).toBe(allowed.includes(role));
    });
  }

  it('finance cannot manage members', () => {
    expect(can('FINANCE', 'members:manage')).toBe(false);
    expect(can('FINANCE', 'invites:manage')).toBe(false);
  });
});

const actor = (role: Role, departmentId: string | null = null): Actor => ({ userId: 'u1', role, departmentId });

describe('obligation-level rules', () => {
  const techOwnedByOther = { departmentId: 'tech', assigneeUserId: 'u2' };
  const assignedToMe = { departmentId: 'ops', assigneeUserId: 'u1' };

  it('admins and finance manage everything', () => {
    expect(canManageObligation(actor('ADMIN'), techOwnedByOther)).toBe(true);
    expect(canManageObligation(actor('FINANCE'), techOwnedByOther)).toBe(true);
  });

  it('department officers manage only their department but view all', () => {
    expect(canManageObligation(actor('DEPARTMENT', 'tech'), techOwnedByOther)).toBe(true);
    expect(canManageObligation(actor('DEPARTMENT', 'ops'), techOwnedByOther)).toBe(false);
    expect(canManageObligation(actor('DEPARTMENT', null), { departmentId: null, assigneeUserId: null })).toBe(false);
    expect(canViewObligation(actor('DEPARTMENT', 'ops'), techOwnedByOther)).toBe(true);
  });

  it('employees view only what is assigned to them and manage nothing', () => {
    expect(canViewObligation(actor('EMPLOYEE'), assignedToMe)).toBe(true);
    expect(canViewObligation(actor('EMPLOYEE'), techOwnedByOther)).toBe(false);
    expect(canManageObligation(actor('EMPLOYEE'), assignedToMe)).toBe(false);
  });

  it('department officers create only inside their department', () => {
    expect(canCreateObligationIn(actor('DEPARTMENT', 'tech'), 'tech')).toBe(true);
    expect(canCreateObligationIn(actor('DEPARTMENT', 'tech'), 'ops')).toBe(false);
    expect(canCreateObligationIn(actor('DEPARTMENT', 'tech'), null)).toBe(false);
    expect(canCreateObligationIn(actor('FINANCE'), null)).toBe(true);
    expect(canCreateObligationIn(actor('EMPLOYEE'), null)).toBe(false);
  });
});
