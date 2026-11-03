import { secureStorage as SecureStore } from '@/lib/secureStorage';
import { create } from 'zustand';

import type { Tokens } from '@/api/client';

const KEYS = {
  refreshToken: 'dueora.refreshToken',
  accessToken: 'dueora.accessToken',
  activeWorkspaceId: 'dueora.activeWorkspaceId',
  onboarded: 'dueora.onboarded',
} as const;

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

interface SessionState {
  status: SessionStatus;
  tokens: Tokens | null;
  activeWorkspaceId: string | null;
  hasOnboarded: boolean;
  /** Read persisted session on app start. */
  hydrate: () => Promise<void>;
  signIn: (tokens: Tokens, activeWorkspaceId?: string | null) => Promise<void>;
  setTokens: (tokens: Tokens) => Promise<void>;
  setActiveWorkspace: (workspaceId: string | null) => Promise<void>;
  markOnboarded: () => Promise<void>;
  signOut: () => Promise<void>;
}

async function save(key: string, value: string | null) {
  if (value === null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
}

/** Tokens live in the device keychain/keystore (expo-secure-store), never in plain storage. */
export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  tokens: null,
  activeWorkspaceId: null,
  hasOnboarded: false,

  hydrate: async () => {
    try {
      const [refreshToken, accessToken, activeWorkspaceId, onboarded] = await Promise.all([
        SecureStore.getItemAsync(KEYS.refreshToken),
        SecureStore.getItemAsync(KEYS.accessToken),
        SecureStore.getItemAsync(KEYS.activeWorkspaceId),
        SecureStore.getItemAsync(KEYS.onboarded),
      ]);
      set({
        tokens: refreshToken ? { refreshToken, accessToken: accessToken ?? '' } : null,
        activeWorkspaceId,
        hasOnboarded: onboarded === '1',
        status: refreshToken ? 'signedIn' : 'signedOut',
      });
    } catch {
      set({ status: 'signedOut' });
    }
  },

  signIn: async (tokens, activeWorkspaceId = null) => {
    await Promise.all([
      save(KEYS.refreshToken, tokens.refreshToken),
      save(KEYS.accessToken, tokens.accessToken),
      activeWorkspaceId ? save(KEYS.activeWorkspaceId, activeWorkspaceId) : Promise.resolve(),
      save(KEYS.onboarded, '1'),
    ]);
    set((s) => ({
      tokens,
      status: 'signedIn',
      hasOnboarded: true,
      activeWorkspaceId: activeWorkspaceId ?? s.activeWorkspaceId,
    }));
  },

  setTokens: async (tokens) => {
    await Promise.all([
      save(KEYS.refreshToken, tokens.refreshToken),
      save(KEYS.accessToken, tokens.accessToken),
    ]);
    set({ tokens });
  },

  setActiveWorkspace: async (workspaceId) => {
    await save(KEYS.activeWorkspaceId, workspaceId);
    set({ activeWorkspaceId: workspaceId });
  },

  markOnboarded: async () => {
    await save(KEYS.onboarded, '1');
    set({ hasOnboarded: true });
  },

  signOut: async () => {
    await Promise.all([
      save(KEYS.refreshToken, null),
      save(KEYS.accessToken, null),
      save(KEYS.activeWorkspaceId, null),
    ]);
    set({ tokens: null, activeWorkspaceId: null, status: 'signedOut' });
  },
}));
