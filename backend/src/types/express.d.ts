import type { Role } from '../domain/permissions.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth. */
      userId?: string;
      /** Set by requireWorkspace: the caller's membership in the X-Workspace-Id workspace. */
      workspace?: {
        id: string;
        role: Role;
        timezone: string;
      };
    }
  }
}

export {};
