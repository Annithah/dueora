import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ThemeProvider } from '@/theme';

/** Render inside the app theme (light by default). */
export async function renderWithTheme(
  ui: ReactElement,
  { scheme = 'light', ...options }: RenderOptions & { scheme?: 'light' | 'dark' } = {},
) {
  return await render(<ThemeProvider forceScheme={scheme}>{ui}</ThemeProvider>, options);
}
