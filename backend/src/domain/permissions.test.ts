import { describe, expect, it } from 'vitest';

import { can, ROLES, type Role, type WorkspaceAction } from './permissions.js';

const matrix: Record<WorkspaceAction, Role[]> = {
  'workspace:update': ['ADMIN'],
  'workspace:delete': ['ADMIN'],
  'members:manage': ['ADMIN'],
  'invites:manage': ['ADMIN'],
  'companies:manage': ['ADMIN'],
  'categories:manage': ['ADMIN', 'FINANCE'],
  'bills:manage': ['ADMIN', 'FINANCE'],
  'accountRefs:reveal': ['ADMIN', 'FINANCE'],
  'payments:record': ['ADMIN', 'FINANCE'],
  'payments:edit': ['ADMIN', 'FINANCE'],
  'reports:view': ['ADMIN', 'FINANCE', 'VIEWER'],
  'budgets:manage': ['ADMIN', 'FINANCE'],
  'data:export': ['ADMIN', 'FINANCE'],
  'import:run': ['ADMIN', 'FINANCE'],
  'ai:configure': ['ADMIN'],
  'audit:view': ['ADMIN', 'FINANCE'],
};

describe('role permissions', () => {
  for (const [action, allowed] of Object.entries(matrix) as [WorkspaceAction, Role[]][]) {
    it(`${action}: ${allowed.join(', ')}`, () => {
      for (const role of ROLES) expect(can(role, action)).toBe(allowed.includes(role));
    });
  }

  it('VIEWER is read-only: no manage, record, edit or reveal rights', () => {
    const writes = (Object.keys(matrix) as WorkspaceAction[]).filter((a) => a !== 'reports:view');
    for (const action of writes) expect(can('VIEWER', action)).toBe(false);
  });

  it('FINANCE cannot manage members, invites or the workspace', () => {
    for (const action of ['members:manage', 'invites:manage', 'workspace:update', 'workspace:delete'] as const) {
      expect(can('FINANCE', action)).toBe(false);
    }
  });
});
