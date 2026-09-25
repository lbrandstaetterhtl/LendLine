import type { Messages } from "./de.js";

import { currentRequest } from "../lib/requestContext.js";
import { de } from "./de.js";
import { en } from "./en.js";
import { es } from "./es.js";
import { hi } from "./hi.js";
import { type Locale, defaultLocale, intlTag } from "./locales.js";
import { zh } from "./zh.js";

export { type Locale, defaultLocale, isLocale, locales } from "./locales.js";

const dictionaries: Record<Locale, Messages> = { de, en, es, zh, hi };

/**
 * The language of the running request (from its Accept-Language), else German.
 */
export function currentLocale(): Locale {
  return currentRequest().locale ?? defaultLocale;
}

export function messages(locale: Locale = currentLocale()): Messages {
  return dictionaries[locale];
}

export type Plural = { one: string; other: string };
export type Text = string | Plural;
type Params = Record<string, string | number>;

/**
 * Fills {placeholders}; a plural text picks its form by `params.count`.
 */
export function format(text: Text, params: Params = {}, locale: Locale = currentLocale()): string {
  let template: string;
  if (typeof text === "string") {
    template = text;
  } else {
    const rule = new Intl.PluralRules(intlTag[locale]).select(Number(params.count ?? 0));
    template = rule === "one" ? text.one : text.other;
  }
  return template.replaceAll(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  );
}

/**
 * Shortcut for the common case: a message of the current request.
 */
export function t(pick: (m: Messages) => Text, params?: Params): string {
  return format(pick(messages()), params);
}

/**
 * Date and time for mails and messages, always in the company's time zone.
 */
export function formatDateFor(value: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlTag[locale], {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(value);
}

/**
 * A stored company text that is still the German default is shown in the reader's language;
 * anything the company wrote itself stays as it is.
 */
export function localizedDefault(
  stored: string,
  pick: (m: Messages) => string,
  locale: Locale = currentLocale()
): string {
  return stored === pick(de) ? pick(messages(locale)) : stored;
}
