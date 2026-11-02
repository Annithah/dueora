import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Keychain/Keystore on phones. The web build (used only for previews during
 * development) has no secure store, so it falls back to localStorage.
 */
const web = Platform.OS === 'web';

export const secureStorage = {
  getItemAsync: async (key: string): Promise<string | null> =>
    web ? (globalThis.localStorage?.getItem(key) ?? null) : SecureStore.getItemAsync(key),
  setItemAsync: async (key: string, value: string): Promise<void> => {
    if (web) globalThis.localStorage?.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  },
  deleteItemAsync: async (key: string): Promise<void> => {
    if (web) globalThis.localStorage?.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  },
};
