import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api';
import { meKey, type Me, type Role } from '@/features/auth/api';
import { todayInTimeZone } from '@/lib/dates';
import { useSession } from '@/state/session';

export interface Workspace {
  id: string;
  name: string;
  type: 'COMPANY' | 'PERSONAL';
  timezone: string;
  reminderHour: number;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  defaultReminderOffsets: number[];
  memberCount: number;
  billCount: number;
  companyCount: number;
  myRole?: Role;
  /** What the caller can see: every company, or these with their role in each. */
  myAccess?: { allCompanies: boolean; companies: { companyId: string; role: Role }[] };
}

export interface InvitePreview {
  workspace: { name: string };
  invitedBy: string;
  email: string;
  role: Role;
  expiresAt: string;
}

export const workspaceKey = (workspaceId: string | null) => ['workspace', workspaceId] as const;

export function useWorkspace() {
  const workspaceId = useSession((s) => s.activeWorkspaceId);
  return useQuery({
    queryKey: workspaceKey(workspaceId),
    queryFn: () => api.get<Workspace>('/workspaces/current'),
    enabled: !!workspaceId,
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      type: 'COMPANY' | 'PERSONAL';
      timezone: string;
      firstCompanyName?: string;
    }) => api.request<Workspace>('/workspaces', { method: 'POST', body, org: false }),
    onSuccess: async (ws) => {
      await useSession.getState().setActiveWorkspace(ws.id);
      queryClient.setQueryData(workspaceKey(ws.id), ws);
      await queryClient.invalidateQueries({ queryKey: meKey });
    },
  });
}

export function useSendInvite() {
  return useMutation({
    mutationFn: (body: { email: string; role: Role; allCompanies?: boolean; companies?: { companyId: string; role: 'FINANCE' | 'VIEWER' }[] }) =>
      api.post<{ id: string; email: string }>('/workspaces/current/invites', body),
  });
}

export function useInvitePreview(token: string | undefined) {
  return useQuery({
    queryKey: ['invite-preview', token],
    queryFn: () =>
      api.request<InvitePreview>('/public/invites/preview', {
        query: { token },
        auth: false,
        org: false,
      }),
    enabled: !!token,
    retry: false,
  });
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      api.request<Workspace>('/workspaces/accept-invite', {
        method: 'POST',
        body: { token },
        org: false,
      }),
    onSuccess: async (ws) => {
      await useSession.getState().setActiveWorkspace(ws.id);
      await queryClient.invalidateQueries({ queryKey: meKey });
    },
  });
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  FINANCE: 'Finance',
  VIEWER: 'Viewer',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: 'Everything, including team and workspace settings',
  FINANCE: 'Manage bills, payments and reports in their companies',
  VIEWER: 'Read-only, receives reminders',
};

/** What each role can do in the app (mirrors backend/src/domain/permissions.ts). */
export function permissionsFor(role: Role | undefined) {
  const manager = role === 'ADMIN' || role === 'FINANCE';
  return {
    manageBills: manager,
    recordPayments: manager,
    editPayments: manager,
    // Creating, editing and archiving companies is for admins (backend permissions.ts).
    manageCompanies: role === 'ADMIN',
    manageCategories: manager,
    revealKeys: manager,
    manageTeam: role === 'ADMIN',
    manageWorkspace: role === 'ADMIN',
  };
}

/** The active workspace as listed on /me (available instantly, no extra request). */
export function useActiveWorkspaceSummary() {
  const workspaceId = useSession((s) => s.activeWorkspaceId);
  const me = useQuery({ queryKey: meKey, queryFn: () => api.get<Me>('/me') });
  return me.data?.workspaces.find((w) => w.id === workspaceId);
}

/** What the signed-in user may do in the active workspace. */
export function usePermissions() {
  const summary = useActiveWorkspaceSummary();
  return { role: summary?.role, ...permissionsFor(summary?.role) };
}

/** "Today" (YYYY-MM-DD) in the workspace timezone — due dates are always workspace-local. */
export function useWorkspaceToday(): string {
  const timezone = useActiveWorkspaceSummary()?.timezone;
  return todayInTimeZone(timezone);
}
