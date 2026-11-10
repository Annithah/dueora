import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api';
import { useSession } from '@/state/session';

export interface BudgetProgress {
  id: string;
  categoryId: string | null;
  category: { id: string; name: string; icon: string; color: string } | null;
  monthlyLimitCents: number;
  alertAtPercent: number;
  month: string;
  paidCents: number;
  dueCents: number;
  spentCents: number;
  percent: number;
  state: 'OK' | 'WARNING' | 'OVER';
}

const useWorkspaceId = () => useSession((s) => s.activeWorkspaceId);
export const budgetsKey = (workspaceId: string | null) => ['budgets', workspaceId] as const;

/** Budgets with this month's progress (paid + still due). */
export function useBudgets() {
  const workspaceId = useWorkspaceId();
  return useQuery({
    queryKey: budgetsKey(workspaceId),
    queryFn: () => api.get<BudgetProgress[]>('/budgets'),
    enabled: !!workspaceId,
  });
}

export function useSaveBudget() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: (body: { categoryId: string | null; monthlyLimitCents: number; alertAtPercent?: number }) =>
      api.put<BudgetProgress[]>('/budgets', body),
    onSuccess: (data) => queryClient.setQueryData(budgetsKey(workspaceId), data),
  });
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.del(`/budgets/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: budgetsKey(workspaceId) }),
  });
}
