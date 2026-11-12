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

export type FrequencyUnitValue = 'WEEK' | 'MONTH' | 'YEAR' | 'ONCE';
export type AmountTypeValue = 'FIXED' | 'VARIABLE';
export type PaymentMethodValue = 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CARD' | 'CASH' | 'OTHER';

export interface CategoryDefaults {
  frequencyUnit: FrequencyUnitValue | null;
  frequencyInterval: number | null;
  amountType: AmountTypeValue | null;
  reminderOffsets: number[] | null;
  paymentMethod: PaymentMethodValue | null;
}

/** A category of one company; `parentId` is set for a sub-category (one level). */
export interface Category {
  id: string;
  companyId: string;
  parentId: string | null;
  parent: { id: string; name: string } | null;
  name: string;
  icon: string;
  color: string;
  description: string | null;
  sortOrder: number;
  defaults: CategoryDefaults;
  archived: boolean;
  billCount: number;
}

export interface CategorySuggestion {
  name: string;
  icon: string;
  color: string;
  children: string[];
}

export type CustomFieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'DROPDOWN';

export interface CustomField {
  id: string;
  companyId: string;
  name: string;
  type: CustomFieldType;
  options: string[] | null;
  /** null = every bill of the company. */
  categoryIds: string[] | null;
  required: boolean;
  sortOrder: number;
}

/** How a new company's categories start. */
export type CategoryStart =
  | { mode: 'empty' }
  | { mode: 'suggestions'; names?: string[]; withSubcategories?: boolean }
  | { mode: 'copy'; fromCompanyId: string };

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

/** Categories of every company the user can see, or of one company. */
export function useCategories(options: { companyId?: string; includeArchived?: boolean } = {}) {
  const workspaceId = useWorkspaceId();
  return useQuery({
    queryKey: ['categories', workspaceId, options.companyId ?? 'all', options.includeArchived ?? false],
    queryFn: () =>
      api.get<Category[]>('/categories', {
        companyId: options.companyId,
        includeArchived: options.includeArchived ? 'true' : undefined,
      }),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
}

export function useCategorySuggestions() {
  return useQuery({
    queryKey: ['category-suggestions'],
    queryFn: () => api.get<CategorySuggestion[]>('/categories/suggestions'),
    staleTime: 24 * 60 * 60_000,
  });
}

export function useCustomFields(companyId: string | undefined) {
  const workspaceId = useWorkspaceId();
  return useQuery({
    queryKey: ['custom-fields', workspaceId, companyId],
    queryFn: () => api.get<CustomField[]>('/custom-fields', { companyId }),
    enabled: !!workspaceId && !!companyId,
  });
}

/** Top-level categories followed by their sub-categories (for pickers and lists). */
export function categoryTree(list: readonly Category[]): { category: Category; depth: 0 | 1 }[] {
  const top = list.filter((c) => !c.parentId || !list.some((p) => p.id === c.parentId));
  return top.flatMap((t) => [
    { category: t, depth: 0 as const },
    ...list.filter((c) => c.parentId === t.id).map((c) => ({ category: c, depth: 1 as const })),
  ]);
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

export const createCompany = (body: CompanyFields & { categoryStart?: CategoryStart }) => api.post<Company>('/companies', body);
export const updateCompany = ({ id, ...body }: Partial<CompanyFields> & { id: string }) =>
  api.patch<Company>(`/companies/${id}`, body);
/** Only a company without bills; one with bills is refused (409 HAS_BILLS) — archive it instead. */
export const deleteCompany = (id: string) => api.del(`/companies/${id}`);
export const archiveCompany = (id: string) => api.post<Company>(`/companies/${id}/archive`);
export const unarchiveCompany = (id: string) => api.post<Company>(`/companies/${id}/unarchive`);

export interface CategoryFields {
  name: string;
  icon?: string;
  color?: string;
  parentId?: string | null;
  description?: string | null;
  defaultFrequencyUnit?: FrequencyUnitValue | null;
  defaultFrequencyInterval?: number | null;
  defaultAmountType?: AmountTypeValue | null;
  defaultReminderOffsets?: number[] | null;
  defaultPaymentMethod?: PaymentMethodValue | null;
}

export const createCategory = (body: CategoryFields & { companyId: string; subcategories?: string[] }) =>
  api.post<Category>('/categories', body);
export const updateCategory = ({ id, ...body }: Partial<CategoryFields> & { id: string }) =>
  api.patch<Category>(`/categories/${id}`, body);
export const archiveCategory = (id: string) => api.post<Category>(`/categories/${id}/archive`);
export const unarchiveCategory = (id: string) => api.post<Category>(`/categories/${id}/unarchive`);
export const mergeCategory = ({ id, intoId }: { id: string; intoId: string }) => api.post(`/categories/${id}/merge`, { intoId });
export const reorderCategories = (body: { companyId: string; ids: string[] }) => api.post('/categories/reorder', body);
/** A category with bills needs `moveToId` (the server answers 409 CATEGORY_IN_USE otherwise). */
export const deleteCategory = (id: string, moveToId?: string) =>
  api.request(`/categories/${id}`, { method: 'DELETE', query: { moveToId } });

export const createCustomField = ({ companyId, ...body }: Omit<CustomField, 'id' | 'sortOrder'>) =>
  api.request<CustomField>('/custom-fields', { method: 'POST', query: { companyId }, body });
export const updateCustomField = ({ id, ...body }: Partial<Omit<CustomField, 'companyId' | 'sortOrder'>> & { id: string }) =>
  api.patch<CustomField>(`/custom-fields/${id}`, body);
export const deleteCustomField = (id: string) => api.del(`/custom-fields/${id}`);

export const updateMember = ({ id, ...body }: { id: string; role: Role } & Partial<CompanyAccessInput>) =>
  api.patch<Member>(`/workspaces/current/members/${id}`, body);
export const removeMember = (id: string) => api.del(`/workspaces/current/members/${id}`);
export const revokeInvite = (id: string) => api.del(`/workspaces/current/invites/${id}`);
