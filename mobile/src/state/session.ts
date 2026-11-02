import { secureStorage as SecureStore } from '@/lib/secureStorage';
import { create } from 'zustand';

import type { Tokens } from '@/api/client';

const KEYS = {
  refreshToken: 'dueora.refreshToken',
  accessToken: 'dueora.accessToken',
  activeOrgId: 'dueora.activeOrgId',
  onboarded: 'dueora.onboarded',
} as const;

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

interface SessionState {
  status: SessionStatus;
  tokens: Tokens | null;
  activeOrgId: string | null;
  hasOnboarded: boolean;
  /** Read persisted session on app start. */
  hydrate: () => Promise<void>;
  signIn: (tokens: Tokens, activeOrgId?: string | null) => Promise<void>;
  setTokens: (tokens: Tokens) => Promise<void>;
  setActiveOrg: (orgId: string | null) => Promise<void>;
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
  activeOrgId: null,
  hasOnboarded: false,

  hydrate: async () => {
    try {
      const [refreshToken, accessToken, activeOrgId, onboarded] = await Promise.all([
        SecureStore.getItemAsync(KEYS.refreshToken),
        SecureStore.getItemAsync(KEYS.accessToken),
        SecureStore.getItemAsync(KEYS.activeOrgId),
        SecureStore.getItemAsync(KEYS.onboarded),
      ]);
      set({
        tokens: refreshToken ? { refreshToken, accessToken: accessToken ?? '' } : null,
        activeOrgId,
        hasOnboarded: onboarded === '1',
        status: refreshToken ? 'signedIn' : 'signedOut',
      });
    } catch {
      set({ status: 'signedOut' });
    }
  },

  signIn: async (tokens, activeOrgId = null) => {
    await Promise.all([
      save(KEYS.refreshToken, tokens.refreshToken),
      save(KEYS.accessToken, tokens.accessToken),
      activeOrgId ? save(KEYS.activeOrgId, activeOrgId) : Promise.resolve(),
      save(KEYS.onboarded, '1'),
    ]);
    set((s) => ({
      tokens,
      status: 'signedIn',
      hasOnboarded: true,
      activeOrgId: activeOrgId ?? s.activeOrgId,
    }));
  },

  setTokens: async (tokens) => {
    await Promise.all([
      save(KEYS.refreshToken, tokens.refreshToken),
      save(KEYS.accessToken, tokens.accessToken),
    ]);
    set({ tokens });
  },

  setActiveOrg: async (orgId) => {
    await save(KEYS.activeOrgId, orgId);
    set({ activeOrgId: orgId });
  },

  markOnboarded: async () => {
    await save(KEYS.onboarded, '1');
    set({ hasOnboarded: true });
  },

  signOut: async () => {
    await Promise.all([
      save(KEYS.refreshToken, null),
      save(KEYS.accessToken, null),
      save(KEYS.activeOrgId, null),
    ]);
    set({ tokens: null, activeOrgId: null, status: 'signedOut' });
  },
}));
