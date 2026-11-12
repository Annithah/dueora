import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetch as expoFetch } from 'expo/fetch';

import { ApiError, api } from '@/api';
import { API_URL } from '@/api/config';
import { useSession } from '@/state/session';

import { createSseParser, createUtf8Decoder } from './sse';

export type AiCard =
  | {
      type: 'bills';
      title: string;
      items: {
        id: string;
        name: string;
        company: string;
        amountCents: number;
        nextDueDate: string;
        status: string;
      }[];
    }
  | { type: 'total'; label: string; amountCents: number; detail?: string }
  | {
      type: 'action';
      id: string;
      kind: string;
      summary: string;
      status: 'pending' | 'confirmed' | 'cancelled' | 'failed';
      result?: string;
    };

export interface AiMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  text: string;
  cards: AiCard[];
  rating: 1 | -1 | null;
  createdAt: string;
}

export interface AiStatus {
  enabled: boolean;
  available: boolean;
  canChange: boolean;
  messagesLeftThisHour: number;
}

export const RESTING = 'DueOra AI is resting right now — please try again in a moment.';

const useWorkspaceId = () => useSession((s) => s.activeWorkspaceId);

export function useAiStatus() {
  const workspaceId = useWorkspaceId();
  return useQuery({
    queryKey: ['ai-status', workspaceId],
    queryFn: () => api.get<AiStatus>('/ai/status'),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
}

export function useConversations() {
  const workspaceId = useWorkspaceId();
  return useQuery({
    queryKey: ['ai-conversations', workspaceId],
    queryFn: () => api.get<{ id: string; title: string; updatedAt: string }[]>('/ai/conversations'),
    enabled: !!workspaceId,
  });
}

export function fetchConversation(id: string) {
  return api.get<{ id: string; title: string; messages: AiMessage[] }>(`/ai/conversations/${id}`);
}

export function useInsight() {
  const workspaceId = useWorkspaceId();
  return useQuery({
    queryKey: ['ai-insight', workspaceId],
    queryFn: () => api.get<{ text: string | null; source: string }>('/ai/insight'),
    enabled: !!workspaceId,
    staleTime: 30 * 60_000,
    retry: false,
  });
}

export function useMemory() {
  const workspaceId = useWorkspaceId();
  return useQuery({
    queryKey: ['ai-memory', workspaceId],
    queryFn: () => api.get<{ id: string; text: string; createdAt: string }[]>('/ai/memory'),
    enabled: !!workspaceId,
  });
}

export function useMemoryMutations() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['ai-memory', workspaceId] });
  return {
    add: useMutation({
      mutationFn: (text: string) => api.post('/ai/memory', { text }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.del(`/ai/memory/${id}`),
      onSuccess: refresh,
    }),
  };
}

export function useResolveAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      messageId,
      actionId,
      decision,
    }: {
      messageId: string;
      actionId: string;
      decision: 'confirm' | 'cancel';
    }) => api.post<AiCard>(`/ai/messages/${messageId}/actions/${actionId}/${decision}`),
    // A confirmed action changes real data: refresh everything.
    onSuccess: (card) =>
      card.type === 'action' && card.status === 'confirmed'
        ? queryClient.invalidateQueries()
        : undefined,
  });
}

export function useRateMessage() {
  return useMutation({
    mutationFn: ({
      messageId,
      rating,
      comment,
    }: {
      messageId: string;
      rating: 1 | -1;
      comment?: string;
    }) =>
      api.post(`/ai/messages/${messageId}/feedback`, { rating, ...(comment ? { comment } : {}) }),
  });
}

export async function suggestCategory(name: string, provider?: string, companyId?: string) {
  const r = await api.post<{
    suggestion: { categoryId: string | null; categoryName: string; source: string } | null;
  }>('/ai/suggest-category', { name, provider, companyId });
  return r.suggestion;
}

export interface StreamHandlers {
  onMeta?: (conversationId: string) => void;
  onDelta: (text: string) => void;
}

type StreamDone = { messageId: string; conversationId: string; text: string; cards: AiCard[] };

/**
 * Send a message and stream the reply (server-sent events over expo/fetch). Resolves with the
 * saved assistant message. Throws ApiError for refusals (AI off, rate limit) and RESTING failures.
 */
export async function streamChat(
  body: { conversationId?: string; message: string },
  h: StreamHandlers,
) {
  await api.get('/ai/status'); // refreshes the access token if needed
  const { tokens, activeWorkspaceId } = useSession.getState();
  let res: Awaited<ReturnType<typeof expoFetch>>;
  try {
    res = await expoFetch(`${API_URL}/api/v1/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${tokens?.accessToken ?? ''}`,
        ...(activeWorkspaceId ? { 'X-Workspace-Id': activeWorkspaceId } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'You’re offline. DueOra AI needs a connection.');
  }
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      res.status,
      json?.error?.code ?? 'AI_ERROR',
      json?.error?.message ?? RESTING,
    );
  }
  const reader = res.body?.getReader();
  if (!reader) throw new ApiError(500, 'AI_ERROR', RESTING);
  const decode = createUtf8Decoder();
  const parse = createSseParser();
  let done: StreamDone | null = null;
  for (;;) {
    const chunk = await reader.read();
    const events = parse(chunk.value ? decode(chunk.value, chunk.done) : '');
    for (const e of events) {
      const d = e.data as Record<string, unknown>;
      if (e.event === 'meta') h.onMeta?.(String(d.conversationId));
      else if (e.event === 'delta') h.onDelta(String(d.text ?? ''));
      else if (e.event === 'done') done = d as unknown as StreamDone;
      else if (e.event === 'error')
        throw new ApiError(503, String(d.code ?? 'AI_UNAVAILABLE'), String(d.message ?? RESTING));
    }
    if (chunk.done) break;
  }
  if (!done) throw new ApiError(503, 'AI_UNAVAILABLE', RESTING);
  return done;
}
