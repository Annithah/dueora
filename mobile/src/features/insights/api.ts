import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { api } from '@/api';
import { API_URL } from '@/api/config';
import { PAGE_SIZE, type Page, type PaymentMethod, type Bill } from '@/features/bills/api';
import { useSession } from '@/state/session';
import type { PaymentStatus } from '@/theme';

/** A USD total (cents) and how many items make it up. */
export interface MoneyBlock {
  amountCents: number;
  count: number;
}

export type BillLite = Pick<
  Bill,
  | 'id'
  | 'name'
  | 'provider'
  | 'company'
  | 'category'
  | 'amountCents'
  | 'remainingCents'
  | 'nextDueDate'
  | 'daysUntilDue'
  | 'paymentStatus'
  | 'frequencyLabel'
>;

export interface Breakdown {
  id: string;
  name: string;
  color: string;
  icon?: string;
  amountCents: number;
  share: number;
}

export interface Dashboard {
  today: string;
  localHour: number;
  summary: {
    overdue: MoneyBlock;
    dueThisWeek: MoneyBlock;
    dueThisMonth: MoneyBlock;
    paidThisMonth: MoneyBlock & { changePercent: number | null };
  };
  needsAttention: BillLite[];
  needsAttentionCount: number;
  next30Days: { date: string; bill: BillLite; amountCents: number; status: PaymentStatus }[];
  spending: { months: { month: string; amountCents: number }[]; paidLast12Months: number; changePercent: number | null };
  byCategory: Breakdown[];
  byCompany: Breakdown[];
  counts: { active: number; total: number; overdue: number; upcoming30: number };
}

export interface CalendarEvent {
  date: string;
  billId: string;
  name: string;
  company: string;
  categoryIcon: string;
  categoryColor: string;
  amountCents: number;
  status: PaymentStatus;
  kind: 'paid' | 'current' | 'future';
}

export interface Report {
  period: 'month' | 'year';
  year: number;
  month?: number;
  from: string;
  to: string;
  totals: { committed: MoneyBlock; paid: MoneyBlock; outstanding: MoneyBlock; overdue: MoneyBlock };
  byCategory: Breakdown[];
  byCompany: Breakdown[];
  months: { month: string; paidCents: number; outstandingCents: number }[];
  forecast: { month: string; amountCents: number }[];
  overdue: BillLite[];
}

export interface HistoryItem {
  id: string;
  billId: string;
  cycleDueDate: string;
  amountCents: number;
  paidOn: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  bill: {
    id: string;
    name: string;
    provider: string | null;
    company: { id: string; name: string; color: string };
    category: { id: string; name: string; icon: string; color: string };
  };
}

export const HISTORY_SORTS = [
  { value: 'paid_desc', label: 'Date paid — newest first' },
  { value: 'paid_asc', label: 'Date paid — oldest first' },
  { value: 'amount_desc', label: 'Amount — high to low' },
  { value: 'amount_asc', label: 'Amount — low to high' },
] as const;
export type HistorySort = (typeof HISTORY_SORTS)[number]['value'];

export interface HistoryQuery {
  q?: string;
  sort: HistorySort;
  from?: string;
  to?: string;
  companyIds?: string[];
  categoryIds?: string[];
  billId?: string;
}

const useWorkspaceId = () => useSession((s) => s.activeWorkspaceId);
const csv = (v?: string[]) => (v && v.length ? v.join(',') : undefined);

export function useDashboard() {
  const workspaceId = useWorkspaceId();
  return useQuery({
    queryKey: ['dashboard', workspaceId],
    queryFn: () => api.get<Dashboard>('/dashboard'),
    enabled: !!workspaceId,
  });
}

export function useCalendar(from: string, to: string) {
  const workspaceId = useWorkspaceId();
  return useQuery({
    queryKey: ['calendar', workspaceId, from, to],
    queryFn: () => api.get<{ events: CalendarEvent[]; today: string }>('/calendar', { from, to }),
    enabled: !!workspaceId,
    placeholderData: (prev) => prev,
  });
}

export function useReport(period: 'month' | 'year', year: number, month?: number) {
  const workspaceId = useWorkspaceId();
  return useQuery({
    queryKey: ['reports', workspaceId, period, year, month],
    queryFn: () => api.get<Report>('/reports', { period, year, month }),
    enabled: !!workspaceId,
  });
}

/** Payment history, 10 per page from the server. */
export function useHistory(query: HistoryQuery) {
  const workspaceId = useWorkspaceId();
  return useInfiniteQuery({
    queryKey: ['payments', workspaceId, query],
    queryFn: ({ pageParam }) =>
      api.get<Page<HistoryItem> & { totalCents: number }>('/payments', {
        page: pageParam,
        limit: PAGE_SIZE,
        sort: query.sort,
        q: query.q?.trim() || undefined,
        from: query.from,
        to: query.to,
        companyId: csv(query.companyIds),
        categoryId: csv(query.categoryIds),
        billId: query.billId,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
    enabled: !!workspaceId,
  });
}

export function useDeletePayment() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.del(`/payments/${id}`),
    onSuccess: () =>
      Promise.all(
        ['bills', 'dashboard', 'calendar', 'reports', 'payments'].map((k) =>
          queryClient.invalidateQueries({ queryKey: [k, workspaceId] }),
        ),
      ),
  });
}

/**
 * Download a protected report export and open the system share sheet.
 * A cheap authenticated call first makes sure the access token is fresh.
 */
export async function downloadAndShare(path: string, fileName: string, mimeType: string): Promise<void> {
  await api.get('/me');
  const { tokens, activeWorkspaceId } = useSession.getState();
  const target = new File(Paths.cache, fileName);
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(`${API_URL}/api/v1${path}`, target, {
    headers: {
      Authorization: `Bearer ${tokens?.accessToken ?? ''}`,
      ...(activeWorkspaceId ? { 'X-Workspace-Id': activeWorkspaceId } : {}),
    },
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName });
  }
}
