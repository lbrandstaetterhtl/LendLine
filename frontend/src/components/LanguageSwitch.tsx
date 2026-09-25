import { isLocale, localeNames, locales, useI18n } from "../i18n";

/**
 * Language menu (sidebar, login page, "Mein Konto"). Each language is named in itself, so a person
 * finds theirs whatever language is showing.
 */
export function LanguageSwitch({ id }: { id?: string }) {
  const { locale, setLocale, m } = useI18n();
  return (
    <select
      id={id}
      className="language-switch"
      value={locale}
      aria-label={id ? undefined : m.common.language}
      title={m.common.language}
      onChange={(event) => {
        if (isLocale(event.target.value)) setLocale(event.target.value);
      }}
    >
      {locales.map((value) => (
        <option key={value} value={value} lang={value}>
          {localeNames[value]}
        </option>
      ))}
    </select>
  );
}
