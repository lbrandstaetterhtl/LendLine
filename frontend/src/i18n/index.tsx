import type { Messages } from "./de";

import { createContext, Fragment, useCallback, useContext, useMemo, useState } from "react";

import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { hi } from "./hi";
import { zh } from "./zh";

/**
 * Languages of the interface. German is the source: the other dictionaries are typed against it, so
 * a missing text fails the type check. The server answers in the same language (Accept-Language).
 */
export const locales = ["de", "en", "es", "zh", "hi"] as const;
export type Locale = (typeof locales)[number];

/**
 * Each language in its own name, for the language menu.
 */
export const localeNames: Record<Locale, string> = {
  de: "Deutsch",
  en: "English",
  es: "Español",
  zh: "中文",
  hi: "हिन्दी",
};

const intlTag: Record<Locale, string> = {
  de: "de-DE",
  en: "en-GB",
  es: "es-ES",
  zh: "zh-CN",
  hi: "hi-IN",
};

const dictionaries: Record<Locale, Messages> = { de, en, es, zh, hi };

const STORAGE_KEY = "lendline-locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

function storedLocale(): Locale | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * The saved choice, else the first browser language we have, else German.
 */
function initialLocale(): Locale {
  const stored = storedLocale();
  if (stored) return stored;
  for (const tag of navigator.languages) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return "de";
}

// Also read outside React: the API client sends it, the date helpers format with it. The whole
// app is mounted again when it changes (see LocaleBoundary), so nothing keeps an old value.
let active: Locale = initialLocale();
document.documentElement.lang = active;

export function currentLocale(): Locale {
  return active;
}

export function messages(): Messages {
  return dictionaries[active];
}

/**
 * A company text that is still the German default comes in the current language; one the company
 * wrote itself stays as it is.
 */
export function localizedDefault(value: string, pick: (m: Messages) => string): string {
  return value === pick(de) ? pick(messages()) : value;
}

export type Plural = { one: string; other: string };
type Params = Record<string, string | number>;

/**
 * Fills "{name}" placeholders; a plural picks its form by `count`. "{name:lower}" puts the value in
 * lower case, for a company term inside an English or Spanish sentence ("Find pieces").
 */
export function format(text: string | Plural, params: Params = {}): string {
  const template =
    typeof text === "string"
      ? text
      : new Intl.PluralRules(intlTag[active]).select(Number(params.count ?? 0)) === "one"
        ? text.one
        : text.other;
  return template.replaceAll(/\{(\w+)(:lower)?\}/g, (match, name: string, lower?: string) => {
    if (!(name in params)) return match;
    const value = String(params[name]);
    return lower ? value.toLocaleLowerCase(intlTag[active]) : value;
  });
}

/**
 * Date and time as the server's zone (Europe/Berlin) sees it, "–" for none.
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "–";
  return new Intl.DateTimeFormat(intlTag[active], {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
}

/**
 * Any other date format in the current language.
 */
export function formatWith(value: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(intlTag[active], options).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(intlTag[active]).format(value);
}

/**
 * Short weekday names, Monday first.
 */
export function weekdayNames(): string[] {
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, index) =>
    formatWith(new Date(2024, 0, 1 + index), { weekday: "short" })
  );
}

type I18nValue = {
  locale: Locale;
  m: Messages;
  /**
   * Switches the language and remembers it on this device.
   */
  setLocale: (locale: Locale) => void;
  /**
   * True once the person picked a language on this device.
   */
  chosen: boolean;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setState] = useState<Locale>(active);
  const [chosen, setChosen] = useState(() => storedLocale() !== null);

  const setLocale = useCallback((next: Locale) => {
    active = next;
    document.documentElement.lang = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked: the choice lasts until the tab is closed.
    }
    setChosen(true);
    setState(next);
  }, []);

  const value = useMemo(
    () => ({ locale, m: dictionaries[locale], setLocale, chosen }),
    [locale, setLocale, chosen]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("I18nProvider missing");
  return ctx;
}

/**
 * Mounts its children again when the language changes: pages load the server's texts (errors,
 * catalogues, protocol) anew in the new language, and every formatted date follows.
 */
export function LocaleBoundary({ children }: { children: React.ReactNode }) {
  const { locale } = useI18n();
  return <Fragment key={locale}>{children}</Fragment>;
}
