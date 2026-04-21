/**
 * Returns the first day of the week for the device's locale.
 *   0 = Sunday (US, CA, AU, JP, …)
 *   1 = Monday (most of Europe, ISO 8601)
 */
export function getWeekStartDay(): 0 | 1 {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    // Intl.Locale.weekInfo is available in V8 (Hermes 0.12+, RN 0.74+)
    const weekInfo = (new Intl.Locale(locale) as any).weekInfo;
    if (weekInfo?.firstDay != null) {
      return weekInfo.firstDay === 7 ? 0 : 1; // firstDay 7 = Sunday
    }
    // Fallback: read region from locale tag (e.g. "en-US" → "US")
    const region = locale.split("-").pop()?.toUpperCase() ?? "";
    return SUNDAY_REGIONS.has(region) ? 0 : 1;
  } catch {
    return 0; // default to Sunday if anything fails
  }
}

const SUNDAY_REGIONS = new Set([
  "US", "CA", "JP", "CN", "AU", "MX", "PH", "IN", "ZA", "KR", "BR",
  "HK", "TW", "SG", "MY", "IL", "CO", "PE", "VE", "AR",
]);

/** Ordered day-of-week indices starting from the locale's first day. */
export function getOrderedDays(): number[] {
  const start = getWeekStartDay(); // 0 or 1
  return [0, 1, 2, 3, 4, 5, 6].map((i) => (i + start) % 7);
}

/** Single-letter labels in locale order. */
export const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
/** Short labels (3-letter) in locale order. */
export const DAY_SHORT  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Full labels in locale order. */
export const DAY_FULL   = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Given a JS Date, return its 0-based offset within the locale week
 * (0 = first day of the week, 6 = last).
 */
export function localeDayOffset(date: Date): number {
  const start = getWeekStartDay();
  return (date.getDay() - start + 7) % 7;
}

/**
 * Returns the date string "YYYY-MM-DD" for the first day of the
 * locale week that contains `date`.
 */
export function weekStartDate(date: Date): string {
  const offset = localeDayOffset(date);
  const d = new Date(date);
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}

/** Returns "YYYY-MM-DD" for the last day of the locale week containing `date`. */
export function weekEndDate(date: Date): string {
  const offset = localeDayOffset(date);
  const d = new Date(date);
  d.setDate(d.getDate() + (6 - offset));
  return d.toISOString().slice(0, 10);
}
