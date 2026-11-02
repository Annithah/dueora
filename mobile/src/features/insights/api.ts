import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { api } from '@/api';
import { API_URL } from '@/api/config';
import type { Obligation, Page, PaymentMethod } from '@/features/obligations/api';
import { useSession } from '@/state/session';
import type { PaymentStatus } from '@/theme';

export interface MoneyBlock {
  count: number;
  totals: { currency: string; amountMinor: number }[];
  converted: { currency: string; amountMinor: number };
}

export type ObligationLite = Pick<
  Obligation,
  | 'id'
  | 'name'
  | 'provider'
  | 'icon'
  | 'platform'
  | 'category'
  | 'amountMinor'
  | 'remainingMinor'
  | 'currency'
  | 'nextDueDate'
  | 'daysUntilDue'
  | 'paymentStatus'
  | 'frequencyLabel'
>;

export interface Dashboard {
  today: string;
  localHour: number;
  defaultCurrency: string;
  missingRates: string[];
  summary: {
    overdue: MoneyBlock;
    dueThisWeek: MoneyBlock;
    dueThisMonth: MoneyBlock;
    paidThisMonth: MoneyBlock & { changePercent: number | null };
  };
  needsAttention: ObligationLite[];
  needsAttentionCount: number;
  next30Days: {
    date: string;
    obligation: ObligationLite;
    amountMinor: number;
    status: PaymentStatus;
  }[];
  spending: {
    months: { month: string; amountMinor: number }[];
    paidLast12Months: number;
    changePercent: number | null;
  };
  byCategory: {
    id: string;
    name: string;
    color: string;
    icon: string;
    amountMinor: number;
    share: number;
  }[];
  counts: { active: number; overdue: number; upcoming30: number };
}

export interface CalendarEvent {
  date: string;
  obligationId: string;
  name: string;
  provider: string;
  icon: string;
  platform: string | null;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  kind: 'paid' | 'current' | 'future';
}

export interface Report {
  period: 'month' | 'year';
  year: number;
  month?: number;
  from: string;
  to: string;
  defaultCurrency: string;
  totals: { committed: MoneyBlock; paid: MoneyBlock; outstanding: MoneyBlock; overdue: MoneyBlock };
  byCategory: {
    id: string;
    name: string;
    color: string;
    icon: string;
    amountMinor: number;
    share: number;
  }[];
  months: { month: string; paidMinor: number; outstandingMinor: number }[];
  forecast: { month: string; amountMinor: number }[];
  overdue: ObligationLite[];
  missingRates: string[];
}

export interface HistoryItem {
  id: string;
  obligationId: string;
  cycleDueDate: string;
  amountMinor: number;
  currency: string;
  paidOn: string;
  method: PaymentMethod;
  reference: string | null;
  recordedBy: { id: string; name: string };
  obligation: {
    id: string;
    name: string;
    provider: string;
    icon: string;
    platform: { id: string; name: string } | null;
    category: { id: string; name: string };
  };
}

export interface HistoryFilters {
  q?: string;
  from?: string;
  to?: string;
  categoryId?: string;
  platformId?: string;
  obligationId?: string;
}

const useOrg = () => useSession((s) => s.activeOrgId);

export function useDashboard() {
  const orgId = useOrg();
  return useQuery({
    queryKey: ['dashboard', orgId],
    queryFn: () => api.get<Dashboard>('/dashboard'),
    enabled: !!orgId,
  });
}

export function useCalendar(from: string, to: string) {
  const orgId = useOrg();
  return useQuery({
    queryKey: ['calendar', orgId, from, to],
    queryFn: () => api.get<{ events: CalendarEvent[]; today: string }>('/calendar', { from, to }),
    enabled: !!orgId,
    placeholderData: (prev) => prev,
  });
}

export function useReport(period: 'month' | 'year', year: number, month?: number) {
  const orgId = useOrg();
  return useQuery({
    queryKey: ['reports', orgId, period, year, month],
    queryFn: () => api.get<Report>('/reports', { period, year, month }),
    enabled: !!orgId,
  });
}

export function useHistory(filters: HistoryFilters) {
  const orgId = useOrg();
  return useQuery({
    queryKey: ['payments', orgId, filters],
    queryFn: () =>
      api.get<Page<HistoryItem> & { totals: { currency: string; amountMinor: number }[] }>(
        '/payments',
        { ...filters, pageSize: 100 },
      ),
    enabled: !!orgId,
  });
}

export function useDeletePayment() {
  const queryClient = useQueryClient();
  const orgId = useOrg();
  return useMutation({
    mutationFn: (id: string) => api.del(`/payments/${id}`),
    onSuccess: () =>
      Promise.all(
        ['obligations', 'dashboard', 'calendar', 'reports', 'payments'].map((k) =>
          queryClient.invalidateQueries({ queryKey: [k, orgId] }),
        ),
      ),
  });
}

/**
 * Download a protected file (report export, receipt) and open the system share sheet.
 * A cheap authenticated call first makes sure the access token is fresh.
 */
export async function downloadAndShare(
  path: string,
  fileName: string,
  mimeType: string,
): Promise<void> {
  await api.get('/me');
  const { tokens, activeOrgId } = useSession.getState();
  const target = new File(Paths.cache, fileName);
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(`${API_URL}/api/v1${path}`, target, {
    headers: {
      Authorization: `Bearer ${tokens?.accessToken ?? ''}`,
      ...(activeOrgId ? { 'X-Org-Id': activeOrgId } : {}),
    },
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName });
  }
}
