import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api, type Tokens } from '@/api';
import { useSession } from '@/state/session';

export type Role = 'ADMIN' | 'FINANCE' | 'DEPARTMENT' | 'EMPLOYEE';

export interface WorkspaceSummary {
  id: string;
  name: string;
  type: 'COMPANY' | 'PERSONAL';
  logoUrl: string | null;
  defaultCurrency: string;
  timezone: string;
  role: Role;
  departmentId: string | null;
}

export interface Me {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  workspaces: WorkspaceSummary[];
}

interface AuthResponse extends Tokens {
  expiresIn: number;
  user: Me;
}

export const meKey = ['me'] as const;

export function useMe(enabled = true) {
  return useQuery({ queryKey: meKey, queryFn: () => api.get<Me>('/me'), enabled });
}

/** Store tokens, cache the profile, and pick a workspace. */
async function completeSignIn(queryClient: QueryClient, res: AuthResponse) {
  queryClient.setQueryData(meKey, res.user);
  const session = useSession.getState();
  const keep = res.user.workspaces.some((w) => w.id === session.activeOrgId)
    ? session.activeOrgId
    : null;
  await session.signIn(
    { accessToken: res.accessToken, refreshToken: res.refreshToken },
    keep ?? res.user.workspaces[0]?.id ?? null,
  );
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api.request<AuthResponse>('/auth/login', { method: 'POST', body, auth: false, org: false }),
    onSuccess: (res) => completeSignIn(queryClient, res),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; email: string; password: string }) =>
      api.request<AuthResponse>('/auth/register', {
        method: 'POST',
        body,
        auth: false,
        org: false,
      }),
    onSuccess: (res) => completeSignIn(queryClient, res),
  });
}

export function useVerifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      api.request<Me>('/auth/verify-email', { method: 'POST', body: { code }, org: false }),
    onSuccess: (me) => queryClient.setQueryData(meKey, me),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: () =>
      api.request<{ sent: boolean }>('/auth/verify-email/request', { method: 'POST', org: false }),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) =>
      api.request<{ sent: boolean }>('/auth/password/forgot', {
        method: 'POST',
        body: { email },
        auth: false,
        org: false,
      }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (body: { email: string; code: string; newPassword: string }) =>
      api.request<void>('/auth/password/reset', { method: 'POST', body, auth: false, org: false }),
  });
}

/** Revoke the refresh token server-side (best effort), then clear everything locally. */
export async function signOut(queryClient: QueryClient) {
  const tokens = useSession.getState().tokens;
  if (tokens?.refreshToken) {
    try {
      await api.request('/auth/logout', {
        method: 'POST',
        body: { refreshToken: tokens.refreshToken },
        auth: false,
        org: false,
      });
    } catch {
      // Offline: local sign-out still happens; the token expires on its own.
    }
  }
  await useSession.getState().signOut();
  queryClient.clear();
}
