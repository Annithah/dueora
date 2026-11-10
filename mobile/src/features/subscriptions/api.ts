import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { api } from '@/api';
import { useSession } from '@/state/session';
import type { PaymentStatus } from '@/theme';

export type FrequencyUnit = 'WEEK' | 'MONTH' | 'YEAR' | 'ONCE';
export type PaymentMethod = 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CARD' | 'CASH' | 'OTHER';

export interface CompanyRef {
  id: string;
  name: string;
  color: string;
}

export interface CategoryRef {
  id: string;
  name: string;
  icon: string;
  color: string;
}

/** Masked subscription key; the plain value only comes from useRevealKey (ADMIN/FINANCE). */
export interface MaskedKey {
  hasKey: true;
  last4: string;
  masked: string;
}

export interface Subscription {
  id: string;
  name: string;
  provider: string | null;
  description: string | null;
  /** US dollars, integer cents. */
  amountCents: number;
  frequencyUnit: FrequencyUnit;
  frequencyInterval: number;
  frequencyLabel: string;
  anchorDay: number;
  startDate: string;
  nextDueDate: string;
  reminderOffsets: number[];
  autoRenew: boolean;
  isTrial: boolean;
  trialEndsOn: string | null;
  defaultPaymentMethod: PaymentMethod | null;
  status: 'ACTIVE' | 'ARCHIVED' | 'COMPLETED';
  paymentStatus: PaymentStatus;
  daysUntilDue: number;
  cycleLengthDays: number;
  paidCents: number;
  remainingCents: number;
  subscriptionKey: MaskedKey | null;
  company: CompanyRef;
  category: CategoryRef;
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  cycleDueDate: string;
  amountCents: number;
  paidOn: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  createdAt: string;
}

export interface PriceChange {
  id: string;
  oldAmountCents: number;
  newAmountCents: number;
  changedAt: string;
}

export interface SubscriptionDetail extends Subscription {
  muted: boolean;
  /** "YYYY-MM-DD" while the caller has snoozed this cycle's reminders. */
  snoozedUntil: string | null;
  priceHistory: PriceChange[];
  reminders: { offsetDays: number; date: string; sent: boolean }[];
  history: PaymentRecord[];
  historyTotal: number;
}

/** Server-side page: 10 items by default. */
export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export const PAGE_SIZE = 10;

export const SUBSCRIPTION_SORTS = [
  { value: 'due_asc', label: 'Due date — soonest first' },
  { value: 'due_desc', label: 'Due date — latest first' },
  { value: 'amount_desc', label: 'Amount — high to low' },
  { value: 'amount_asc', label: 'Amount — low to high' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'recent', label: 'Recently added' },
] as const;
export type SubscriptionSort = (typeof SUBSCRIPTION_SORTS)[number]['value'];

export interface SubscriptionQuery {
  q?: string;
  sort: SubscriptionSort;
  statuses?: string[];
  companyIds?: string[];
  categoryIds?: string[];
  frequencies?: string[];
  dueFrom?: string;
  dueTo?: string;
}

export interface SubscriptionInput {
  name: string;
  companyId: string;
  categoryId: string;
  provider?: string | null;
  description?: string | null;
  /** Plain key typed by the user; omit to keep the stored one, null to remove it. */
  subscriptionKey?: string | null;
  amountCents: number;
  frequencyUnit: FrequencyUnit;
  frequencyInterval: number;
  startDate: string;
  nextDueDate?: string;
  anchorDay?: number;
  reminderOffsets?: number[];
  autoRenew?: boolean;
  isTrial?: boolean;
  trialEndsOn?: string | null;
  defaultPaymentMethod?: PaymentMethod | null;
}

const useWorkspaceId = () => useSession((s) => s.activeWorkspaceId);
const csv = (v?: string[]) => (v && v.length ? v.join(',') : undefined);

export const subscriptionKeys = {
  all: (workspaceId: string | null) => ['subscriptions', workspaceId] as const,
  list: (workspaceId: string | null, q: SubscriptionQuery) => ['subscriptions', workspaceId, 'list', q] as const,
  detail: (workspaceId: string | null, id: string) => ['subscriptions', workspaceId, 'detail', id] as const,
};

/** Subscriptions, 10 per page from the server ("load more" / infinite scroll). */
export function useSubscriptionList(query: SubscriptionQuery) {
  const workspaceId = useWorkspaceId();
  return useInfiniteQuery({
    queryKey: subscriptionKeys.list(workspaceId, query),
    queryFn: ({ pageParam }) =>
      api.get<Page<Subscription>>('/subscriptions', {
        page: pageParam,
        limit: PAGE_SIZE,
        sort: query.sort,
        q: query.q?.trim() || undefined,
        status: csv(query.statuses),
        companyId: csv(query.companyIds),
        categoryId: csv(query.categoryIds),
        frequency: csv(query.frequencies),
        dueFrom: query.dueFrom,
        dueTo: query.dueTo,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
    enabled: !!workspaceId,
  });
}

export function useSubscription(id: string | undefined) {
  const workspaceId = useWorkspaceId();
  return useQuery({
    queryKey: subscriptionKeys.detail(workspaceId, id ?? ''),
    queryFn: () => api.get<SubscriptionDetail>(`/subscriptions/${id}`),
    enabled: !!workspaceId && !!id,
  });
}

/** Everything derived from subscriptions (lists, dashboard, calendar, reports, history, inbox) goes stale together. */
export function invalidateMoney(queryClient: QueryClient, workspaceId: string | null) {
  return Promise.all(
    ['subscriptions', 'dashboard', 'calendar', 'reports', 'payments', 'inbox', 'companies', 'categories'].map((k) =>
      queryClient.invalidateQueries({ queryKey: [k, workspaceId] }),
    ),
  );
}

export function useSaveSubscription(id?: string) {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: (input: SubscriptionInput) =>
      id ? api.patch<Subscription>(`/subscriptions/${id}`, input) : api.post<Subscription>('/subscriptions', input),
    onSuccess: () => invalidateMoney(queryClient, workspaceId),
  });
}

export function useArchiveSubscription() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      api.post<Subscription>(`/subscriptions/${id}/${archived ? 'archive' : 'unarchive'}`),
    onSuccess: () => invalidateMoney(queryClient, workspaceId),
  });
}

export function useDeleteSubscription() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.del(`/subscriptions/${id}`),
    onSuccess: () => invalidateMoney(queryClient, workspaceId),
  });
}

/**
 * The plain subscription key (ADMIN/FINANCE only). Deliberately a mutation, not a query:
 * the value is never written to the TanStack cache, so it isn't persisted to device storage.
 */
export function useRevealKey() {
  return useMutation({
    mutationFn: (id: string) => api.get<{ value: string }>(`/subscriptions/${id}/key`),
  });
}

export interface RecordResult {
  payment: PaymentRecord;
  subscription: Subscription;
  cycleCompleted: boolean;
}

export function useRecordPayment(subscriptionId: string) {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: (input: {
      amountCents?: number;
      paidOn?: string;
      method?: PaymentMethod;
      reference?: string | null;
      notes?: string | null;
    }) => api.post<RecordResult>(`/subscriptions/${subscriptionId}/payments`, input),
    onSuccess: () => invalidateMoney(queryClient, workspaceId),
  });
}

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  MOBILE_MONEY: 'Mobile money',
  BANK_TRANSFER: 'Bank transfer',
  CARD: 'Card',
  CASH: 'Cash',
  OTHER: 'Other',
};

export const STATUS_FILTERS = [
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'DUE_TODAY', label: 'Due today' },
  { value: 'DUE_SOON', label: 'Due soon' },
  { value: 'PARTIALLY_PAID', label: 'Partially paid' },
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'PAID', label: 'Paid' },
  { value: 'ARCHIVED', label: 'Archived' },
] as const;

export const FREQUENCY_FILTERS = [
  { value: 'WEEK', label: 'Weekly' },
  { value: 'MONTH', label: 'Monthly / quarterly' },
  { value: 'YEAR', label: 'Yearly' },
  { value: 'ONCE', label: 'One-time' },
] as const;

/** Snooze this cycle's reminders for me: { days } (1, 3, 7) or { until: 'YYYY-MM-DD' }. */
export function useSnooze(subscriptionId: string) {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: (input: { days: number } | { until: string } | null) =>
      input
        ? api.post<{ snoozedUntil: string }>(`/subscriptions/${subscriptionId}/snooze`, input)
        : api.del(`/subscriptions/${subscriptionId}/snooze`).then(() => null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: subscriptionKeys.detail(workspaceId, subscriptionId) }),
  });
}

export const SNOOZE_CHOICES = [
  { days: 1, label: 'Tomorrow' },
  { days: 3, label: 'In 3 days' },
  { days: 7, label: 'Next week' },
] as const;
