import { create } from 'zustand';

export type ToastTone = 'success' | 'info' | 'warning' | 'error';

export interface ToastMessage {
  id: number;
  title: string;
  message?: string;
  tone: ToastTone;
  /** Optional tap action (e.g. open the payment from a foreground notification). */
  onPress?: () => void;
  durationMs: number;
}

interface ToastState {
  toasts: ToastMessage[];
  show: (
    toast: Omit<ToastMessage, 'id' | 'durationMs' | 'tone'> & {
      tone?: ToastTone;
      durationMs?: number;
    },
  ) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: ({ tone = 'info', durationMs = 4000, ...rest }) => {
    const id = nextId++;
    // Keep at most 3 on screen; newest last.
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, tone, durationMs, ...rest }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Imperative helper usable outside React (e.g. notification handlers). */
export const toast = {
  show: (...args: Parameters<ToastState['show']>) => useToastStore.getState().show(...args),
  success: (title: string, message?: string) =>
    useToastStore.getState().show({ title, message, tone: 'success' }),
  error: (title: string, message?: string) =>
    useToastStore.getState().show({ title, message, tone: 'error' }),
  info: (title: string, message?: string) =>
    useToastStore.getState().show({ title, message, tone: 'info' }),
  dismiss: (id: number) => useToastStore.getState().dismiss(id),
};
