import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { useThemePreference, type ThemePreference } from '@/theme';

const KEY = 'dueora.preferences';

interface Prefs {
  theme: ThemePreference;
  biometricLock: boolean;
}

interface PreferencesState extends Prefs {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setTheme: (theme: ThemePreference) => void;
  setBiometricLock: (on: boolean) => void;
}

function persist(p: Prefs) {
  AsyncStorage.setItem(KEY, JSON.stringify(p)).catch(() => undefined);
}

/** Device-level preferences (not tied to an account): appearance and biometric lock. */
export const usePreferences = create<PreferencesState>((set, get) => ({
  theme: 'system',
  biometricLock: false,
  hydrated: false,
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const saved = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
      const theme = saved.theme ?? 'system';
      useThemePreference.getState().setPreference(theme);
      set({ theme, biometricLock: !!saved.biometricLock, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  setTheme: (theme) => {
    useThemePreference.getState().setPreference(theme);
    set({ theme });
    persist({ theme, biometricLock: get().biometricLock });
  },
  setBiometricLock: (biometricLock) => {
    set({ biometricLock });
    persist({ theme: get().theme, biometricLock });
  },
}));
