import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en.json';
import es from './locales/es.json';
import ar from './locales/ar.json';
import zh from './locales/zh.json';
import pt from './locales/pt.json';
import sw from './locales/sw.json';

export const LANGUAGE_STORAGE_KEY = '@powrlog_language';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'ar', label: 'العربية' },
  { code: 'zh', label: '中文' },
  { code: 'pt', label: 'Português' },
  { code: 'sw', label: 'Kiswahili' },
] as const;

export type LanguageCode = 'en' | 'es' | 'ar' | 'zh' | 'pt' | 'sw';

const deviceLanguage = getLocales()?.[0]?.languageCode ?? 'en';
const supported: string[] = SUPPORTED_LANGUAGES.map((l) => l.code);
const initialLng = supported.includes(deviceLanguage) ? deviceLanguage : 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      ar: { translation: ar },
      zh: { translation: zh },
      pt: { translation: pt },
      sw: { translation: sw },
    },
    lng: initialLng,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React Native handles escaping
    },
    compatibilityJSON: 'v4',
  });

// After synchronous init, hydrate with the user's persisted preference (async)
AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
  .then((stored) => {
    if (stored && stored !== i18n.language) {
      i18n.changeLanguage(stored);
    }
  })
  .catch(() => {
    // Ignore — falls back to device language
  });

/**
 * Persist a language choice and update i18next immediately.
 * Import this wherever you need to trigger a language change (e.g. Settings).
 */
export async function changeAppLanguage(code: LanguageCode): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  await i18n.changeLanguage(code);
}

export default i18n;
