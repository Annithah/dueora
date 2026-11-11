import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api';
import type { Role } from '@/features/auth/api';
import { useSession } from '@/state/session';

export interface Company {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  billCount: number;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
  billCount?: number;
}

export interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
}

const useWorkspaceId = () => useSession((s) => s.activeWorkspaceId);

/** Companies in the active workspace (archived ones only when asked, e.g. in settings). */
export function useCompanies(options: { includeArchived?: boolean } = {}) {
  const workspaceId = useWorkspaceId();
  return useQuery({
    queryKey: ['companies', workspaceId, options.includeArchived ?? false],
    queryFn: () =>
      api.get<Company[]>('/companies', { includeArchived: options.includeArchived ? 'true' : undefined }),
    enabled: !!workspaceId,
  });
}

export function useCategories() {
  const workspaceId = useWorkspaceId();
  return useQuery({
    queryKey: ['categories', workspaceId],
    queryFn: () => api.get<Category[]>('/categories'),
    enabled: !!workspaceId,
    staleTime: 5 * 60_000,
  });
}

export function useMembers() {
  const workspaceId = useWorkspaceId();
  return useQuery({
    queryKey: ['members', workspaceId],
    queryFn: () => api.get<Member[]>('/workspaces/current/members'),
    enabled: !!workspaceId,
  });
}

export function useInvites(enabled: boolean) {
  const workspaceId = useWorkspaceId();
  return useQuery({
    queryKey: ['invites', workspaceId],
    queryFn: () => api.get<PendingInvite[]>('/workspaces/current/invites'),
    enabled: !!workspaceId && enabled,
  });
}

/** Create/update/delete calls that refresh one list (and the workspace summary). */
export function useListMutation<TVars, TResult = unknown>(listKey: string, fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [listKey, workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['bills', workspaceId] }),
      ]),
  });
}

export const createCompany = (body: { name: string; color?: string }) => api.post<Company>('/companies', body);
export const updateCompany = ({ id, ...body }: { id: string; name?: string; color?: string }) =>
  api.patch<Company>(`/companies/${id}`, body);
/** Deletes an unused company; one with bills is archived instead (history kept). */
export const deleteCompany = (id: string) => api.del<{ deleted: boolean; archived: boolean }>(`/companies/${id}`);
export const unarchiveCompany = (id: string) => api.post<Company>(`/companies/${id}/unarchive`);

export const createCategory = (body: { name: string; icon: string; color: string }) =>
  api.post<Category>('/categories', body);
export const deleteCategory = (id: string) => api.del(`/categories/${id}`);

export const updateMember = ({ id, role }: { id: string; role: Role }) =>
  api.patch<Member>(`/workspaces/current/members/${id}`, { role });
export const removeMember = (id: string) => api.del(`/workspaces/current/members/${id}`);
export const revokeInvite = (id: string) => api.del(`/workspaces/current/invites/${id}`);
