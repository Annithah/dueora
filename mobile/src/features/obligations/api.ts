import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api } from '@/api';
import { useSession } from '@/state/session';
import type { PaymentStatus } from '@/theme';

export type FrequencyUnit = 'WEEK' | 'MONTH' | 'YEAR' | 'ONCE';
export type PaymentMethod = 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CARD' | 'CASH' | 'OTHER';

export interface Obligation {
  id: string;
  name: string;
  provider: string;
  description: string | null;
  icon: string;
  amountMinor: number;
  currency: string;
  frequencyUnit: FrequencyUnit;
  frequencyInterval: number;
  frequencyLabel: string;
  anchorDay: number;
  startDate: string;
  nextDueDate: string;
  reminderOffsets: number[];
  status: 'ACTIVE' | 'ARCHIVED' | 'COMPLETED';
  paymentStatus: PaymentStatus;
  daysUntilDue: number;
  cycleLengthDays: number;
  paidMinor: number;
  remainingMinor: number;
  platform: { id: string; name: string; color: string } | null;
  category: { id: string; name: string; icon: string; color: string };
  department: { id: string; name: string } | null;
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
}

export interface AttachmentInfo {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface PaymentRecord {
  id: string;
  obligationId: string;
  cycleDueDate: string;
  amountMinor: number;
  currency: string;
  paidOn: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  recordedBy: { id: string; name: string };
  attachments: AttachmentInfo[];
  createdAt: string;
}

export interface ObligationDetail extends Obligation {
  reminders: { offsetDays: number; date: string; sent: boolean }[];
  history: PaymentRecord[];
  attachments: (AttachmentInfo & { createdAt: string })[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ObligationFilters {
  q?: string;
  status?: string;
  platformId?: string;
  assignedToMe?: boolean;
}

export interface ObligationInput {
  name: string;
  provider: string;
  description?: string | null;
  icon?: string | null;
  amountMinor: number;
  currency: string;
  frequencyUnit: FrequencyUnit;
  frequencyInterval: number;
  startDate: string;
  nextDueDate?: string;
  anchorDay?: number;
  reminderOffsets?: number[];
  platformId?: string | null;
  categoryId: string;
  departmentId?: string | null;
  assigneeUserId?: string | null;
}

const useOrg = () => useSession((s) => s.activeOrgId);

export const obligationKeys = {
  all: (orgId: string | null) => ['obligations', orgId] as const,
  list: (orgId: string | null, f: ObligationFilters) => ['obligations', orgId, 'list', f] as const,
  detail: (orgId: string | null, id: string) => ['obligations', orgId, 'detail', id] as const,
};

export function useObligations(filters: ObligationFilters) {
  const orgId = useOrg();
  return useQuery({
    queryKey: obligationKeys.list(orgId, filters),
    queryFn: () =>
      api.get<Page<Obligation>>('/obligations', {
        q: filters.q,
        status: filters.status,
        platformId: filters.platformId,
        assignedToMe: filters.assignedToMe ? 'true' : undefined,
        pageSize: 200,
      }),
    enabled: !!orgId,
  });
}

export function useObligation(id: string | undefined) {
  const orgId = useOrg();
  return useQuery({
    queryKey: obligationKeys.detail(orgId, id ?? ''),
    queryFn: () => api.get<ObligationDetail>(`/obligations/${id}`),
    enabled: !!orgId && !!id,
  });
}

/** Everything derived from obligations (lists, dashboard, calendar, reports, inbox) goes stale together. */
export function invalidateMoney(queryClient: QueryClient, orgId: string | null) {
  return Promise.all(
    ['obligations', 'dashboard', 'calendar', 'reports', 'payments', 'inbox'].map((k) =>
      queryClient.invalidateQueries({ queryKey: [k, orgId] }),
    ),
  );
}

export function useSaveObligation(id?: string) {
  const queryClient = useQueryClient();
  const orgId = useOrg();
  return useMutation({
    mutationFn: (input: ObligationInput) =>
      id
        ? api.patch<Obligation>(`/obligations/${id}`, input)
        : api.post<Obligation>('/obligations', input),
    onSuccess: () => invalidateMoney(queryClient, orgId),
  });
}

export function useArchiveObligation() {
  const queryClient = useQueryClient();
  const orgId = useOrg();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      api.post<Obligation>(`/obligations/${id}/${archived ? 'archive' : 'unarchive'}`),
    onSuccess: () => invalidateMoney(queryClient, orgId),
  });
}

export function useDeleteObligation() {
  const queryClient = useQueryClient();
  const orgId = useOrg();
  return useMutation({
    mutationFn: (id: string) => api.del(`/obligations/${id}`),
    onSuccess: () => invalidateMoney(queryClient, orgId),
  });
}

export interface RecordResult {
  payment: PaymentRecord;
  obligation: Obligation;
  cycleCompleted: boolean;
}

export function useRecordPayment(obligationId: string) {
  const queryClient = useQueryClient();
  const orgId = useOrg();
  return useMutation({
    mutationFn: (input: {
      amountMinor?: number;
      paidOn?: string;
      method: PaymentMethod;
      reference?: string | null;
      notes?: string | null;
    }) => api.post<RecordResult>(`/obligations/${obligationId}/payments`, input),
    onSuccess: () => invalidateMoney(queryClient, orgId),
  });
}

export interface UploadableFile {
  uri: string;
  name: string;
  mimeType: string;
}

/** Upload a receipt (payment) or contract (obligation). */
export function uploadAttachment(
  target: { paymentId?: string; obligationId?: string },
  file: UploadableFile,
) {
  const form = new FormData();
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  const path = target.paymentId
    ? `/payments/${target.paymentId}/attachments`
    : `/obligations/${target.obligationId}/attachments`;
  return api.request<AttachmentInfo>(path, { method: 'POST', formData: form });
}

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  MOBILE_MONEY: 'Mobile money',
  BANK_TRANSFER: 'Bank transfer',
  CARD: 'Card',
  CASH: 'Cash',
  OTHER: 'Other',
};
