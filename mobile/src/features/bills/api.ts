import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { api } from '@/api';
import { useSelectedCompanyId } from '@/state/companyFilter';
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
  parentId?: string | null;
  parent?: { id: string; name: string } | null;
}

export type AmountType = 'FIXED' | 'VARIABLE';

/** Masked account reference; the plain value only comes from useRevealReference (ADMIN/FINANCE). */
export interface MaskedKey {
  hasKey: true;
  last4: string;
  masked: string;
}

export interface Bill {
  id: string;
  name: string;
  provider: string | null;
  description: string | null;
  /** US dollars, integer cents. For a VARIABLE bill: the estimate. */
  amountCents: number;
  amountType: AmountType;
  /** This cycle's amount (a variable bill's actual once set). */
  cycleAmountCents: number;
  isEstimate: boolean;
  /** { [customFieldId]: value } */
  customValues: Record<string, string | number>;
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
  /** Days the open cycle is past due. */
  daysOverdue: number;
  /** Everything due on or before today, including cycles missed after the open one. */
  outstandingCents: number;
  overdueCents: number;
  overdueCycles: number;
  missedCycles: number;
  accountReference: MaskedKey | null;
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

export interface BillDetail extends Bill {
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

export const BILL_SORTS = [
  { value: 'due_asc', label: 'Due date — soonest first' },
  { value: 'due_desc', label: 'Due date — latest first' },
  { value: 'amount_desc', label: 'Amount — high to low' },
  { value: 'amount_asc', label: 'Amount — low to high' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'recent', label: 'Recently added' },
] as const;
export type BillSort = (typeof BILL_SORTS)[number]['value'];

export interface BillQuery {
  q?: string;
  sort: BillSort;
  statuses?: string[];
  companyIds?: string[];
  categoryIds?: string[];
  frequencies?: string[];
  amountType?: AmountType;
  dueFrom?: string;
  dueTo?: string;
}

export interface BillInput {
  name: string;
  companyId: string;
  categoryId: string;
  provider?: string | null;
  description?: string | null;
  /** Plain key typed by the user; omit to keep the stored one, null to remove it. */
  accountReference?: string | null;
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
  amountType?: AmountType;
  customValues?: Record<string, string | number | null>;
}

export type CycleState = 'PAID' | 'PARTIALLY_PAID' | 'OVERDUE' | 'DUE_TODAY' | 'DUE_SOON' | 'UPCOMING';

/** One cycle of a bill (closed, the open one, a missed one or a future one). */
export interface BillCycle {
  dueDate: string;
  kind: 'closed' | 'current' | 'missed' | 'future';
  expectedCents: number;
  isEstimate: boolean;
  paidCents: number;
  remainingCents: number;
  state: CycleState;
  daysOverdue: number;
}

const useWorkspaceId = () => useSession((s) => s.activeWorkspaceId);
const csv = (v?: string[]) => (v && v.length ? v.join(',') : undefined);

export const billKeys = {
  all: (workspaceId: string | null) => ['bills', workspaceId] as const,
  list: (workspaceId: string | null, q: BillQuery) => ['bills', workspaceId, 'list', q] as const,
  detail: (workspaceId: string | null, id: string) => ['bills', workspaceId, 'detail', id] as const,
};

/**
 * Bills, 10 per page from the server ("load more" / infinite scroll). Without an explicit
 * company filter the list follows the company switcher.
 */
export function useBillList(input: BillQuery) {
  const workspaceId = useWorkspaceId();
  const selected = useSelectedCompanyId();
  const query: BillQuery = input.companyIds?.length || !selected ? input : { ...input, companyIds: [selected] };
  return useInfiniteQuery({
    queryKey: billKeys.list(workspaceId, query),
    queryFn: ({ pageParam }) =>
      api.get<Page<Bill>>('/bills', {
        page: pageParam,
        limit: PAGE_SIZE,
        sort: query.sort,
        q: query.q?.trim() || undefined,
        status: csv(query.statuses),
        companyId: csv(query.companyIds),
        categoryId: csv(query.categoryIds),
        frequency: csv(query.frequencies),
        amountType: query.amountType,
        dueFrom: query.dueFrom,
        dueTo: query.dueTo,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
    enabled: !!workspaceId,
  });
}

export function useBill(id: string | undefined) {
  const workspaceId = useWorkspaceId();
  return useQuery({
    queryKey: billKeys.detail(workspaceId, id ?? ''),
    queryFn: () => api.get<BillDetail>(`/bills/${id}`),
    enabled: !!workspaceId && !!id,
  });
}

/** Everything derived from bills (lists, dashboard, calendar, reports, history, inbox) goes stale together. */
export function invalidateMoney(queryClient: QueryClient, workspaceId: string | null) {
  return Promise.all(
    ['bills', 'dashboard', 'calendar', 'reports', 'payments', 'inbox', 'companies', 'categories'].map((k) =>
      queryClient.invalidateQueries({ queryKey: [k, workspaceId] }),
    ),
  );
}

export function useSaveBill(id?: string) {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: (input: BillInput) =>
      id ? api.patch<Bill>(`/bills/${id}`, input) : api.post<Bill>('/bills', input),
    onSuccess: () => invalidateMoney(queryClient, workspaceId),
  });
}

export function useArchiveBill() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      api.post<Bill>(`/bills/${id}/${archived ? 'archive' : 'unarchive'}`),
    onSuccess: () => invalidateMoney(queryClient, workspaceId),
  });
}

export function useDeleteBill() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.del(`/bills/${id}`),
    onSuccess: () => invalidateMoney(queryClient, workspaceId),
  });
}

/**
 * The plain account reference (ADMIN/FINANCE only). Deliberately a mutation, not a query:
 * the value is never written to the TanStack cache, so it isn't persisted to device storage.
 */
export function useRevealReference() {
  return useMutation({
    mutationFn: (id: string) => api.get<{ value: string }>(`/bills/${id}/reference`),
  });
}

export interface RecordResult {
  payment: PaymentRecord;
  bill: Bill;
  cycleCompleted: boolean;
}

export function useRecordPayment(billId: string) {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: (input: {
      amountCents?: number;
      paidOn?: string;
      method?: PaymentMethod;
      reference?: string | null;
      notes?: string | null;
      /** Close the cycle at this amount even if it is less than expected. */
      paidInFull?: boolean;
    }) => api.post<RecordResult>(`/bills/${billId}/payments`, input),
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
export function useSnooze(billId: string) {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: (input: { days: number } | { until: string } | null) =>
      input
        ? api.post<{ snoozedUntil: string }>(`/bills/${billId}/snooze`, input)
        : api.del(`/bills/${billId}/snooze`).then(() => null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: billKeys.detail(workspaceId, billId) }),
  });
}

export const SNOOZE_CHOICES = [
  { days: 1, label: 'Tomorrow' },
  { days: 3, label: 'In 3 days' },
  { days: 7, label: 'Next week' },
] as const;

/** A bill's cycles around today (a year back to a year ahead), with their own amounts. */
export function useBillCycles(billId: string | undefined) {
  const workspaceId = useWorkspaceId();
  return useQuery({
    queryKey: ['bills', workspaceId, 'cycles', billId],
    queryFn: () => api.get<{ cycles: BillCycle[]; today: string }>(`/bills/${billId}/cycles`),
    enabled: !!workspaceId && !!billId,
  });
}

/** Set one cycle's real amount (a variable bill's actual). */
export function useSetCycleAmount(billId: string) {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ dueDate, amountCents }: { dueDate: string; amountCents: number }) =>
      api.request<BillDetail>(`/bills/${billId}/cycles/${dueDate}`, { method: 'PUT', body: { amountCents } }),
    onSuccess: () =>
      Promise.all(['bills', 'dashboard', 'calendar', 'reports', 'views'].map((k) => queryClient.invalidateQueries({ queryKey: [k, workspaceId] }))),
  });
}
