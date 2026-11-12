import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api';
import { useSession } from '@/state/session';

export type NotificationType =
  | 'REMINDER'
  | 'DUE_TODAY'
  | 'OVERDUE'
  | 'PAYMENT_RECORDED'
  | 'DIGEST'
  | 'TRIAL_ENDING'
  | 'AUTO_RENEW_NOTICE'
  | 'PRICE_CHANGE'
  | 'BUDGET_ALERT'
  | 'WEEKLY_DIGEST'
  | 'MONTHLY_SUMMARY'
  | 'TEAM'
  | 'SYSTEM';

export interface InboxItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  billId: string | null;
  cycleDueDate: string | null;
  offsetDays: number | null;
  readAt: string | null;
  createdAt: string;
}

export interface Inbox {
  items: InboxItem[];
  total: number;
  unreadCount: number;
}

export interface NotificationPrefs {
  pushEnabled: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  digestEnabled: boolean;
  weeklySummary: boolean;
  monthlySummary: boolean;
  budgetAlerts: boolean;
  teamActivity: boolean;
  mutedBillIds: string[];
  /** Per company: false turns that kind off (missing = on). */
  companies: Record<string, CompanyNotificationPrefs>;
}

export type CompanyNotificationKind = 'reminders' | 'events' | 'summaries';
export type CompanyNotificationPrefs = Partial<Record<CompanyNotificationKind, boolean>>;

export const inboxKey = (workspaceId: string | null) => ['inbox', workspaceId] as const;
export const prefsKey = (workspaceId: string | null) =>
  ['notification-prefs', workspaceId] as const;

export function useInbox() {
  const workspaceId = useSession((s) => s.activeWorkspaceId);
  return useQuery({
    queryKey: inboxKey(workspaceId),
    queryFn: () => api.get<Inbox>('/notifications', { pageSize: 100 }),
    enabled: !!workspaceId,
    refetchInterval: 60_000,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  const workspaceId = useSession((s) => s.activeWorkspaceId);
  return useMutation({
    mutationFn: (id: string | 'all') =>
      id === 'all' ? api.post('/notifications/read-all') : api.post(`/notifications/${id}/read`),
    onMutate: (id) => {
      // Optimistic: clear the badge immediately.
      queryClient.setQueryData<Inbox>(inboxKey(workspaceId), (old) => {
        if (!old) return old;
        const now = new Date().toISOString();
        const items = old.items.map((n) =>
          id === 'all' || n.id === id ? { ...n, readAt: n.readAt ?? now } : n,
        );
        return { ...old, items, unreadCount: items.filter((n) => !n.readAt).length };
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: inboxKey(workspaceId) }),
  });
}

export function usePrefs() {
  const workspaceId = useSession((s) => s.activeWorkspaceId);
  return useQuery({
    queryKey: prefsKey(workspaceId),
    queryFn: () => api.get<NotificationPrefs>('/notifications/preferences'),
    enabled: !!workspaceId,
  });
}

export function useUpdatePrefs() {
  const queryClient = useQueryClient();
  const workspaceId = useSession((s) => s.activeWorkspaceId);
  return useMutation({
    mutationFn: (patch: Partial<NotificationPrefs>) =>
      api.patch<NotificationPrefs>('/notifications/preferences', patch),
    onSuccess: (prefs) => queryClient.setQueryData(prefsKey(workspaceId), prefs),
  });
}

export function useMute() {
  const queryClient = useQueryClient();
  const workspaceId = useSession((s) => s.activeWorkspaceId);
  return useMutation({
    mutationFn: ({ billId, muted }: { billId: string; muted: boolean }) =>
      api.post<NotificationPrefs>(`/bills/${billId}/${muted ? 'mute' : 'unmute'}`),
    onSuccess: (prefs) => {
      queryClient.setQueryData(prefsKey(workspaceId), prefs);
      return queryClient.invalidateQueries({ queryKey: ['bills', workspaceId] });
    },
  });
}

export function useSendTest() {
  return useMutation({
    mutationFn: () =>
      api.post<{
        queued: boolean;
        channel: 'PUSH' | 'EMAIL';
        channels: ('PUSH' | 'EMAIL' | 'IN_APP')[];
        devices: number;
      }>('/notifications/test'),
  });
}
