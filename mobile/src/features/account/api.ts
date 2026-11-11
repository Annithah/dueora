import { useMutation, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { api } from '@/api';
import { meKey, type Me } from '@/features/auth/api';
import { unregisterDevice } from '@/features/notifications/push';
import { useSession } from '@/state/session';

export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

/** Delete my account (password + the word DELETE). Signs out locally afterwards. */
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (password: string) =>
      api.request<{ deletedWorkspaces: number; leftWorkspaces: number }>('/me', {
        method: 'DELETE',
        body: { password, confirm: 'DELETE' },
        org: false,
      }),
    onSuccess: async () => {
      await useSession.getState().signOut();
      queryClient.clear();
    },
  });
}

/** Sign out on every phone (revokes all sessions, deactivates push tokens). */
export function useLogoutEverywhere() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.request('/auth/logout-all', { method: 'POST', org: false });
      await unregisterDevice();
    },
    onSuccess: async () => {
      await useSession.getState().signOut();
      queryClient.clear();
    },
  });
}

export function useRequestEmailCode() {
  return useMutation({
    mutationFn: () => api.request<{ sent: boolean }>('/auth/verify-email/request', { method: 'POST', org: false }),
  });
}

export function useVerifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.request<Me>('/auth/verify-email', { method: 'POST', body: { code }, org: false }),
    onSuccess: (me) => queryClient.setQueryData(meKey, me),
  });
}

export function useSetLocale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (locale: Me['locale']) => api.request<Me>('/me', { method: 'PATCH', body: { locale }, org: false }),
    onSuccess: (me) => queryClient.setQueryData(meKey, me),
  });
}

export function useSendFeedback() {
  return useMutation({
    mutationFn: (message: string) =>
      api.post<{ received: boolean }>('/feedback', { message, appVersion: APP_VERSION, platform: Platform.OS }),
  });
}

export interface ImportPreviewRow {
  line: number;
  values: Record<string, string>;
  parsed: {
    company: string;
    category: string;
    categoryGuessed: boolean;
    name: string;
    provider: string | null;
    amountCents: number | null;
    frequencyUnit: string | null;
    frequencyInterval: number;
    nextDueDate: string | null;
  };
  errors: string[];
  warnings: string[];
}

export const IMPORT_FIELDS = [
  { key: 'company', label: 'Company' },
  { key: 'category', label: 'Category' },
  { key: 'name', label: 'Bill name', required: true },
  { key: 'provider', label: 'Provider' },
  { key: 'amount', label: 'Amount (USD)', required: true },
  { key: 'frequency', label: 'Frequency', required: true },
  { key: 'nextDueDate', label: 'Next due date', required: true },
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number]['key'];
export type ImportMapping = Partial<Record<ImportField, number>>;

export interface ImportPreview {
  headers: string[];
  mapping: ImportMapping;
  missingColumns: ImportField[];
  truncated: boolean;
  total: number;
  valid: number;
  rows: ImportPreviewRow[];
}

export interface ImportFile {
  fileName: string;
  contentBase64: string;
}

export function useImportPreview() {
  return useMutation({
    mutationFn: (body: ImportFile & { mapping?: ImportMapping }) => api.post<ImportPreview>('/import/preview', body),
  });
}

export function useImportCommit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ImportFile & { mapping?: ImportMapping }) =>
      api.post<{ imported: number; skipped: number; createdCompanies: number; createdCategories: number }>('/import/commit', body),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
