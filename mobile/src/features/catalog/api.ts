import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api';
import type { Role } from '@/features/auth/api';
import { useSession } from '@/state/session';

export interface Platform {
  id: string;
  name: string;
  color: string;
  obligationCount?: number;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
}

export interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: Role;
  department: { id: string; name: string } | null;
  joinedAt: string;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: Role;
  departmentId: string | null;
  expiresAt: string;
}

const useOrg = () => useSession((s) => s.activeOrgId);

export function usePlatforms() {
  const orgId = useOrg();
  return useQuery({
    queryKey: ['platforms', orgId],
    queryFn: () => api.get<Platform[]>('/platforms'),
    enabled: !!orgId,
  });
}

export function useCategories() {
  const orgId = useOrg();
  return useQuery({
    queryKey: ['categories', orgId],
    queryFn: () => api.get<Category[]>('/categories'),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  });
}

export function useMembers() {
  const orgId = useOrg();
  return useQuery({
    queryKey: ['members', orgId],
    queryFn: () => api.get<Member[]>('/workspaces/current/members'),
    enabled: !!orgId,
  });
}

export function useInvites(enabled: boolean) {
  const orgId = useOrg();
  return useQuery({
    queryKey: ['invites', orgId],
    queryFn: () => api.get<PendingInvite[]>('/workspaces/current/invites'),
    enabled: !!orgId && enabled,
  });
}

/** Small helper for create/update/delete calls that refresh one list. */
export function useListMutation<TVars>(listKey: string, fn: (vars: TVars) => Promise<unknown>) {
  const queryClient = useQueryClient();
  const orgId = useOrg();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [listKey, orgId] }),
        queryClient.invalidateQueries({ queryKey: ['workspace', orgId] }),
      ]),
  });
}

export const createPlatform = (body: { name: string; color: string }) =>
  api.post<Platform>('/platforms', body);
export const createCategory = (body: { name: string; icon: string; color: string }) =>
  api.post<Category>('/categories', body);
export const deleteCategory = (id: string) => api.del(`/categories/${id}`);
export const updateMember = ({
  id,
  ...body
}: {
  id: string;
  role?: Role;
  departmentId?: string | null;
}) => api.patch<Member>(`/workspaces/current/members/${id}`, body);
export const removeMember = (id: string) => api.del(`/workspaces/current/members/${id}`);
export const revokeInvite = (id: string) => api.del(`/workspaces/current/invites/${id}`);
export const createDepartment = (name: string) =>
  api.post<{ id: string; name: string }>('/workspaces/current/departments', { name });
