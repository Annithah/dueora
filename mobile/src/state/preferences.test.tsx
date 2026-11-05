import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import AppearanceSettings from '@/app/(app)/settings/appearance';
import { ThemeProvider, useTheme, useThemePreference } from '@/theme';

import { usePreferences } from './preferences';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => ({ router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() } }));

function SchemeProbe() {
  return <Text testID="scheme">{useTheme().scheme}</Text>;
}

async function freshStart(stored?: unknown) {
  await AsyncStorage.clear();
  if (stored !== undefined) await AsyncStorage.setItem('dueora.preferences', JSON.stringify(stored));
  usePreferences.setState({ theme: 'light', biometricLock: false, hydrated: false });
  useThemePreference.setState({ preference: 'light' });
  await usePreferences.getState().hydrate();
}

describe('theme preference', () => {
  it('opens in light mode on first launch', async () => {
    await freshStart();
    expect(usePreferences.getState().theme).toBe('light');
    expect(useThemePreference.getState().preference).toBe('light');
  });

  it('remembers the saved choice after a restart', async () => {
    await freshStart({ theme: 'dark', biometricLock: true });
    expect(usePreferences.getState().theme).toBe('dark');
    expect(useThemePreference.getState().preference).toBe('dark');
    expect(usePreferences.getState().biometricLock).toBe(true);
  });

  it('falls back to light when the stored value is unknown', async () => {
    await freshStart({ theme: 'sepia' });
    expect(usePreferences.getState().theme).toBe('light');
  });

  it('applies a choice from Appearance instantly and saves it on the device', async () => {
    await freshStart();
    await render(
      <ThemeProvider>
        <SchemeProbe />
        <AppearanceSettings />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('scheme').props.children).toBe('light');
    expect(screen.getByRole('radio', { name: /^Light/ }).props.accessibilityState).toEqual({ checked: true });

    await fireEvent.press(screen.getByRole('radio', { name: /^Dark/ }));
    expect(screen.getByTestId('scheme').props.children).toBe('dark');
    expect(screen.getByRole('radio', { name: /^Dark/ }).props.accessibilityState).toEqual({ checked: true });
    // Persisting is fire-and-forget; let it settle.
    await new Promise((r) => setTimeout(r, 0));
    expect(JSON.parse((await AsyncStorage.getItem('dueora.preferences')) ?? '{}')).toMatchObject({ theme: 'dark' });
  });
});
