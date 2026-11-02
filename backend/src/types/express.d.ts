import type { Role } from '../domain/permissions.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth. */
      userId?: string;
      /** Set by requireOrg: the caller's membership in the X-Org-Id workspace. */
      org?: {
        id: string;
        role: Role;
        departmentId: string | null;
        timezone: string;
        defaultCurrency: string;
      };
    }
  }
}

export {};
