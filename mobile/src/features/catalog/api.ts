import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api';
import type { Role } from '@/features/auth/api';
import { useSession } from '@/state/session';

export interface Company {
  id: string;
  name: string;
  /** Initials for chips and avatars (derived from the name when not set). */
  shortName: string;
  color: string;
  description: string | null;
  /** Default reminder offsets for new bills; null = the workspace default. */
  reminderOffsets: number[] | null;
  /** Local hour for reminders; null = the workspace reminder hour. */
  reminderHour: number | null;
  monthlyBudgetCents: number | null;
  archived: boolean;
  billCount: number;
  /** The caller's role in this company (null if unknown). */
  myRole: Role | null;
}

export interface CompanyMember {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  allCompanies: boolean;
}

export interface CompanyDetail extends Company {
  members: CompanyMember[];
}

/** One company a restricted member can see, with their role there. */
export interface CompanyGrant {
  companyId: string;
  role: 'FINANCE' | 'VIEWER';
}

/** "All companies" or a chosen list (admins always see all). */
export interface CompanyAccessInput {
  allCompanies: boolean;
  companies: CompanyGrant[];
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
  allCompanies: boolean;
  companies: CompanyGrant[];
  joinedAt: string;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: Role;
  allCompanies: boolean;
  companies: CompanyGrant[];
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

export function useCompany(id: string | undefined) {
  const workspaceId = useWorkspaceId();
  return useQuery({
    queryKey: ['companies', workspaceId, 'detail', id],
    queryFn: () => api.get<CompanyDetail>(`/companies/${id}`),
    enabled: !!workspaceId && !!id,
  });
}

/** The caller's role in one company, from the companies list (undefined while loading). */
export function useCompanyRole(companyId: string | undefined): Role | null | undefined {
  const companies = useCompanies({ includeArchived: true });
  if (!companyId || !companies.data) return undefined;
  return companies.data.find((c) => c.id === companyId)?.myRole ?? null;
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

export interface CompanyFields {
  name: string;
  shortName?: string | null;
  color?: string;
  description?: string | null;
  reminderOffsets?: number[] | null;
  reminderHour?: number | null;
  monthlyBudgetCents?: number | null;
}

export const createCompany = (body: CompanyFields) => api.post<Company>('/companies', body);
export const updateCompany = ({ id, ...body }: Partial<CompanyFields> & { id: string }) =>
  api.patch<Company>(`/companies/${id}`, body);
/** Only a company without bills; one with bills is refused (409 HAS_BILLS) — archive it instead. */
export const deleteCompany = (id: string) => api.del(`/companies/${id}`);
export const archiveCompany = (id: string) => api.post<Company>(`/companies/${id}/archive`);
export const unarchiveCompany = (id: string) => api.post<Company>(`/companies/${id}/unarchive`);

export const createCategory = (body: { name: string; icon: string; color: string }) =>
  api.post<Category>('/categories', body);
export const deleteCategory = (id: string) => api.del(`/categories/${id}`);

export const updateMember = ({ id, ...body }: { id: string; role: Role } & Partial<CompanyAccessInput>) =>
  api.patch<Member>(`/workspaces/current/members/${id}`, body);
export const removeMember = (id: string) => api.del(`/workspaces/current/members/${id}`);
export const revokeInvite = (id: string) => api.del(`/workspaces/current/invites/${id}`);
