import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
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

/**
 * Safely read the device language without crashing if the native bridge
 * is not ready during synchronous module evaluation on cold iOS launch.
 * Mirrors the defensive pattern from the original lib/i18n.ts.
 */
function getDeviceLanguage(): string {
  try {
    // Lazy require so any native-bridge failure is contained here.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Localization = require('expo-localization');
    const code = Localization.getLocales?.()[0]?.languageCode;
    return typeof code === 'string' && code.length > 0 ? code : 'en';
  } catch {
    return 'en';
  }
}

const supported: string[] = SUPPORTED_LANGUAGES.map((l) => l.code);
const deviceLanguage = getDeviceLanguage();
const initialLng = supported.includes(deviceLanguage) ? deviceLanguage : 'en';

try {
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
      // Don't throw on missing keys — fall back to key string so UI stays functional
      // even if a translation is absent.
      missingKeyHandler: () => {},
      parseMissingKeyHandler: (key: string) => key,
    });
} catch (e) {
  // i18n init failing must never crash the app.
  console.warn('[i18n] init failed:', e);
}

// After synchronous init, hydrate with the user's persisted language preference.
AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
  .then((stored) => {
    if (stored && supported.includes(stored) && stored !== i18n.language) {
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
