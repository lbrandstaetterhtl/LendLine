/**
 * The supported languages. Separate from `index.ts` so the request context can resolve the language
 * without importing the dictionaries.
 */
export const locales = ["en", "de", "es", "zh", "hi"] as const;
export type Locale = (typeof locales)[number];
/**
 * Without a header or a saved choice: English.
 */
export const defaultLocale: Locale = "en";

/**
 * Tags for Intl (dates, numbers, plural rules).
 */
export const intlTag: Record<Locale, string> = {
  de: "de-DE",
  en: "en-GB",
  es: "es-ES",
  zh: "zh-CN",
  hi: "hi-IN",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/**
 * The best supported language from an Accept-Language header ("zh-CN,zh;q=0.9,en;q=0.8").
 */
export function resolveLocale(header: string | undefined | null): Locale {
  if (!header) return defaultLocale;
  const wanted = header
    .split(",")
    .map((part) => {
      const [tag = "", ...rest] = part.trim().split(";");
      const q = rest.find((item) => item.trim().startsWith("q="));
      return { tag: tag.toLowerCase(), q: q ? Number(q.trim().slice(2)) || 0 : 1 };
    })
    .filter((item) => item.tag)
    .toSorted((a, b) => b.q - a.q);
  for (const { tag } of wanted) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return defaultLocale;
}
