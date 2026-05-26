/**
 * i18n setup — POWRLOG localisation
 *
 * Supported languages:
 *   en — English (default / fallback)
 *   es — Spanish
 *
 * HOW TO ADD A STRING
 * 1. Add the key + English value to locales/en.json
 * 2. Add the translated value to locales/es.json (and any other locales)
 * 3. Replace the hardcoded string in the component with t("your.key")
 *
 * HOW TO ADD A NEW LANGUAGE
 * 1. Create locales/<code>.json (copy en.json as template)
 * 2. Import it below and add to `resources`
 * 3. That's it — expo-localization auto-detects device language
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "@/locales/en.json";
import es from "@/locales/es.json";

// Safely read device language — wrap in try/catch so a native-module error
// (e.g. bridge not ready, version mismatch) can never crash the app on boot.
function getDeviceLanguage(): string {
  try {
    // Lazy-require so any native-bridge failure is caught here, not at import time
    const Localization = require("expo-localization");
    const code = Localization.getLocales?.()[0]?.languageCode;
    return typeof code === "string" && code.length > 0 ? code : "en";
  } catch {
    return "en";
  }
}

const deviceLanguage = getDeviceLanguage();

try {
  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    // Use device language if we support it, otherwise fall back to English
    lng: deviceLanguage,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false, // React already handles XSS escaping
    },
    // Don't warn about missing keys during the incremental migration —
    // most strings are still hardcoded while we migrate screen by screen.
    missingKeyHandler: () => {},
    parseMissingKeyHandler: (key: string) => key,
  });
} catch (e) {
  // i18n init failing must never crash the app — all strings are still hardcoded
  console.warn("[i18n] init failed:", e);
}

export default i18n;
