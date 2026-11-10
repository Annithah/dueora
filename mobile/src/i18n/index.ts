import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n, { changeLanguage } from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { create } from 'zustand';

import { en } from './en';
import { fr } from './fr';
import { rw } from './rw';

export type Locale = 'en' | 'fr' | 'rw';
export const LOCALES: readonly Locale[] = ['en', 'fr', 'rw'];
const KEY = 'dueora.locale';

/** First launch follows the phone if it's French or Kinyarwanda; otherwise English. */
function deviceLocale(): Locale {
  try {
    const code = getLocales()[0]?.languageCode ?? 'en';
    return (LOCALES as readonly string[]).includes(code) ? (code as Locale) : 'en';
  } catch {
    return 'en';
  }
}

// eslint-disable-next-line import/no-named-as-default-member -- i18next's documented setup
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr }, rw: { translation: rw } },
  lng: deviceLocale(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

interface LocaleState {
  locale: Locale;
  hydrate: () => Promise<void>;
  setLocale: (l: Locale) => void;
}

/** The chosen language, saved on the device and applied instantly. */
export const useLocale = create<LocaleState>((set) => ({
  locale: i18n.language as Locale,
  hydrate: async () => {
    try {
      const saved = (await AsyncStorage.getItem(KEY)) as Locale | null;
      if (saved && LOCALES.includes(saved)) {
        await changeLanguage(saved);
        set({ locale: saved });
      }
    } catch {
      // Storage unavailable: keep the device language.
    }
  },
  setLocale: (locale) => {
    void changeLanguage(locale);
    set({ locale });
    AsyncStorage.setItem(KEY, locale).catch(() => undefined);
  },
}));

export { i18n, useTranslation };
