import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { Appearance, Platform } from 'react-native';

import { useThemePreference } from './ThemeProvider';

/**
 * Keeps the native side in step with the in-app theme choice:
 * - Appearance override, so Android's own UI (date picker, alerts, system dialogs) uses the
 *   chosen scheme instead of the phone's. "system" clears the override.
 * - Root view background, so screen transitions and the keyboard gap never flash the
 *   other scheme's colour.
 */
export function useNativeAppearance(canvas: string) {
  const preference = useThemePreference((s) => s.preference);

  useEffect(() => {
    if (Platform.OS === 'web' || typeof Appearance.setColorScheme !== 'function') return;
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  }, [preference]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(canvas).catch(() => undefined);
  }, [canvas]);
}
