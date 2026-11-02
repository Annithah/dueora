import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { create } from 'zustand';

import { darkColors, lightColors, type ColorScheme } from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemePreferenceState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

/** The user's appearance choice (persisted by the app's storage layer). */
export const useThemePreference = create<ThemePreferenceState>((set) => ({
  preference: 'system',
  setPreference: (preference) => set({ preference }),
}));

export interface Theme {
  scheme: 'light' | 'dark';
  colors: ColorScheme;
}

const ThemeContext = createContext<Theme>({ scheme: 'light', colors: lightColors });

export function ThemeProvider({
  children,
  forceScheme,
}: {
  children: ReactNode;
  /** Test/preview override. */
  forceScheme?: 'light' | 'dark';
}) {
  const system = useColorScheme();
  const preference = useThemePreference((s) => s.preference);
  const scheme =
    forceScheme ?? (preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference);

  const value = useMemo<Theme>(
    () => ({ scheme, colors: scheme === 'dark' ? darkColors : lightColors }),
    [scheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
