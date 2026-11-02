import { create } from 'zustand';

/** Invite token from a deep link opened while signed out; accepted right after sign-in. */
export const usePendingInvite = create<{
  token: string | null;
  set: (token: string | null) => void;
}>((set) => ({
  token: null,
  set: (token) => set({ token }),
}));
