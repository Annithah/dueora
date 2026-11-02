import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api';
import { useSession } from '@/state/session';

export type NotificationType =
  'REMINDER' | 'DUE_TODAY' | 'OVERDUE' | 'PAYMENT_RECORDED' | 'DIGEST' | 'SYSTEM';

export interface InboxItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  obligationId: string | null;
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
  digestEnabled: boolean;
  mutedObligationIds: string[];
}

export const inboxKey = (orgId: string | null) => ['inbox', orgId] as const;
export const prefsKey = (orgId: string | null) => ['notification-prefs', orgId] as const;

export function useInbox() {
  const orgId = useSession((s) => s.activeOrgId);
  return useQuery({
    queryKey: inboxKey(orgId),
    queryFn: () => api.get<Inbox>('/notifications', { pageSize: 100 }),
    enabled: !!orgId,
    refetchInterval: 60_000,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  const orgId = useSession((s) => s.activeOrgId);
  return useMutation({
    mutationFn: (id: string | 'all') =>
      id === 'all' ? api.post('/notifications/read-all') : api.post(`/notifications/${id}/read`),
    onMutate: (id) => {
      // Optimistic: clear the badge immediately.
      queryClient.setQueryData<Inbox>(inboxKey(orgId), (old) => {
        if (!old) return old;
        const now = new Date().toISOString();
        const items = old.items.map((n) =>
          id === 'all' || n.id === id ? { ...n, readAt: n.readAt ?? now } : n,
        );
        return { ...old, items, unreadCount: items.filter((n) => !n.readAt).length };
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: inboxKey(orgId) }),
  });
}

export function usePrefs() {
  const orgId = useSession((s) => s.activeOrgId);
  return useQuery({
    queryKey: prefsKey(orgId),
    queryFn: () => api.get<NotificationPrefs>('/notifications/preferences'),
    enabled: !!orgId,
  });
}

export function useUpdatePrefs() {
  const queryClient = useQueryClient();
  const orgId = useSession((s) => s.activeOrgId);
  return useMutation({
    mutationFn: (patch: Partial<NotificationPrefs>) =>
      api.patch<NotificationPrefs>('/notifications/preferences', patch),
    onSuccess: (prefs) => queryClient.setQueryData(prefsKey(orgId), prefs),
  });
}

export function useMute() {
  const queryClient = useQueryClient();
  const orgId = useSession((s) => s.activeOrgId);
  return useMutation({
    mutationFn: ({ obligationId, muted }: { obligationId: string; muted: boolean }) =>
      api.post<NotificationPrefs>(`/obligations/${obligationId}/${muted ? 'mute' : 'unmute'}`),
    onSuccess: (prefs) => queryClient.setQueryData(prefsKey(orgId), prefs),
  });
}

export function useSendTest() {
  return useMutation({
    mutationFn: () =>
      api.post<{ queued: boolean; channel: 'PUSH' | 'EMAIL'; devices: number }>(
        '/notifications/test',
      ),
  });
}
