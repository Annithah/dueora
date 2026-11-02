import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api';
import { meKey, type Role } from '@/features/auth/api';
import { useSession } from '@/state/session';

export interface Workspace {
  id: string;
  name: string;
  type: 'COMPANY' | 'PERSONAL';
  logoUrl: string | null;
  defaultCurrency: string;
  timezone: string;
  reminderHour: number;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  defaultReminderOffsets: number[];
  departments: { id: string; name: string }[];
  exchangeRates: { fromCurrency: string; rate: string }[];
  memberCount: number;
  obligationCount: number;
  myRole?: Role;
}

export interface InvitePreview {
  organization: { name: string; logoUrl: string | null };
  invitedBy: string;
  email: string;
  role: Role;
  expiresAt: string;
}

export const workspaceKey = (orgId: string | null) => ['workspace', orgId] as const;

export function useWorkspace() {
  const orgId = useSession((s) => s.activeOrgId);
  return useQuery({
    queryKey: workspaceKey(orgId),
    queryFn: () => api.get<Workspace>('/workspaces/current'),
    enabled: !!orgId,
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      type: 'COMPANY' | 'PERSONAL';
      defaultCurrency: string;
      timezone: string;
    }) => api.request<Workspace>('/workspaces', { method: 'POST', body, org: false }),
    onSuccess: async (ws) => {
      await useSession.getState().setActiveOrg(ws.id);
      queryClient.setQueryData(workspaceKey(ws.id), ws);
      await queryClient.invalidateQueries({ queryKey: meKey });
    },
  });
}

/** Upload a logo picked with expo-image-picker. */
export function useUploadLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: {
      uri: string;
      mimeType?: string | null;
      fileName?: string | null;
    }) => {
      const form = new FormData();
      // React Native's FormData accepts { uri, name, type } file descriptors.
      form.append('file', {
        uri: file.uri,
        name: file.fileName ?? 'logo.jpg',
        type: file.mimeType ?? 'image/jpeg',
      } as unknown as Blob);
      return api.request<Workspace>('/workspaces/current/logo', { method: 'POST', formData: form });
    },
    onSuccess: (ws) => {
      queryClient.setQueryData(workspaceKey(ws.id), ws);
      void queryClient.invalidateQueries({ queryKey: meKey });
    },
  });
}

export function useSendInvite() {
  return useMutation({
    mutationFn: (body: { email: string; role: Role; departmentId?: string | null }) =>
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
      await useSession.getState().setActiveOrg(ws.id);
      await queryClient.invalidateQueries({ queryKey: meKey });
    },
  });
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  FINANCE: 'Finance Officer',
  DEPARTMENT: 'Department Officer',
  EMPLOYEE: 'Employee',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: 'Full workspace access',
  FINANCE: 'Manage payments and reports',
  DEPARTMENT: 'Manage their department’s payments',
  EMPLOYEE: 'View assigned obligations only',
};
