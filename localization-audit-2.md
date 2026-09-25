# Localization audit 2 – checking the result

As of 2026-09-25, on `e377461` plus the localization (not yet committed at the time). Checks whether the localization covers everything `localization-audit-1.md` found, and what remains open.

**Update after the audit (commit `bb004bc`):** English is now the default language (API without `Accept-Language`, e-mails for accounts without a saved language, interface without a saved choice; the browser language is no longer used). Server logs, startup errors, `.env.example`, README and code comments are in English. The points below are updated where this changes them.

**Result:** Interface, API messages, validation, e-mails, audit log, catalogues and formats are available in **German, English, Spanish, Simplified Chinese and Hindi**. No interface text is hard-coded any more. Open are mainly limits of content (company texts, old audit log entries, grammar of company terms) and a review of Chinese and Hindi by native speakers.

## Method

1. **Completeness by type check:** German is the source (`de.ts`), the other languages are typed as `Messages`. A missing or extra key makes `npm run check` fail. In addition, a script loads all dictionaries and compares keys and placeholders.
2. **Text search as in audit 1:** the same search script over `frontend/src` and `backend/src`, without the dictionaries; every remaining hit classified.
3. **Audit log words:** a script collects all fixed field names and values the services write into the audit log and checks them against the translation table `auditTerms`.
4. **Interface in the browser:** headless Edge signs in in each of the five languages, opens 19 pages and searches the visible text, `title`, `aria-label` and `placeholder` for German words; plus screenshots and the console errors.
5. **API and e-mails:** requests with `Accept-Language` in all languages; a real loan, approved by an administrator in German, for a person with Spanish as their language.

## Numbers

| Dictionary                      | Texts    | Missing | Extra | Placeholders differing |
| ------------------------------- | -------- | ------- | ----- | ---------------------- |
| Frontend `de` (source)          | 859      | –       | –     | –                      |
| Frontend `en`, `es`, `zh`, `hi` | 859 each | 0       | 0     | 0                      |
| Backend `de` (source)           | 398      | –       | –     | –                      |
| Backend `en`, `es`, `zh`, `hi`  | 398 each | 0       | 0     | 1 (see below)          |

The one difference is intended: Chinese also uses `{count}` for "one" request in `errors.tooManyOpen`, because it has no separate singular. Texts that are the same in English as in German ("Name", "Status", "Details", "System", "Start") and "Normal" in Spanish are real translations, not forgotten ones.

**Text search:** Of the 785 hits from audit 1, only these kinds remain in the code outside the dictionaries, all on purpose:

| Kind                                           | Examples                                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Stored German defaults (translated on reading) | Terms "Gerät", "Stück" (`BrandingContext`, `brandingService`), comment field, maintenance notice     |
| Raw audit log data (translated on reading)     | Field names "Kategorie", "Gebäude"; values "Bestätigt"; patterns "Stück LT-1001", "3 Std. verspätet" |
| Server logs and start messages (console)       | German at the time of the audit; English since `bb004bc`                                             |
| Internal errors that never reach users         | "Invalid access token" (translated into 401 "session expired")                                       |

**Audit log words:** 62 fixed words found, all in `auditTerms` (the piece statuses "Verfügbar", "Ausgeliehen", "Defekt" were missing before – added).

**Browser:** In all five languages no German interface texts; only company data from the demo stock (device descriptions, groups, welcome text) and old audit log entries remain. The only console message: the intended 401 for the deliberately wrong password. `<html lang>` follows the language.

## Check of the points from audit 1

| Audit 1                           | Implementation                                                                                                                                           | Status           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| A. Interface                      | All pages and components read from `frontend/src/i18n`; status names, shortcut labels, confirmations, `aria-label`, placeholders                         | done             |
| A. Sentences with numbers/plurals | `format()` with placeholders and `{ one, other }` via `Intl.PluralRules`; no more `=== 1 ? … :` plurals                                                  | done             |
| A. Company terms                  | as placeholders (`{unit}`); default terms translated in every language; `{unit:lower}` inside a sentence (en/es)                                         | done, see limits |
| B. API error messages             | 127 `HttpError`s through `t()` in the language of the request (`Accept-Language`), also rate limit, upload, 500                                          | done             |
| C. Validation                     | own messages as keys `validation.*`; Zod's default messages translated by kind                                                                           | done             |
| C. Browser validation             | still speaks the browser's language                                                                                                                      | open (browser)   |
| D. E-mails                        | language of the recipient (`User.locale`), texts, dates, default texts; test e-mail in the language of the person triggering it                          | done             |
| E. Audit log                      | new entries: key + values, shown in the reader's language; field and value names via `auditTerms`, varying values via `auditPatterns`, statuses in lists | done, see limits |
| F. Permissions, mode areas        | texts from the dictionaries, the server delivers them translated                                                                                         | done             |
| F. Default values                 | equal to the German default = "not adapted", translated in every language; editors show them translated and store the default when unchanged             | done             |
| G. Formats                        | `Intl` with the language for date, month, weekdays, numbers; time zone `Europe/Berlin`                                                                   | done             |
| H. `index.html`                   | `lang` from the choice before the first paint; title from the translated subtitle                                                                        | done             |
| Approach 3: language choice       | sidebar, sign-in and registration page, "My account"; saved on the account. At the time the default came from the browser; since `bb004bc` it is English | done             |
| Approach 7: native speakers       | the translations do not come from native speakers                                                                                                        | open             |

## Found and fixed during this audit

- Piece statuses were missing from `auditTerms` → status changes stayed German in the audit log.
- Lists such as "LT-1001 (Verfügbar), LT-1002 (Defekt)" in the audit log are now translated.
- Chinese and Spanish used different words for "defective" in the backend than in the interface (损坏/故障, defectuoso/averiado); Chinese "Offen" in the audit log differed from the status. Aligned.
- Hindi used "ऋण" (credit) instead of "उधार" (lending); Chinese used "件" alone as a term. Replaced.
- The e-mail settings showed non-German speakers the German default texts for editing; now translated, and saving keeps the default (tested: en → stored de).
- The sidebar was too narrow for language choice, help and theme ("帮助" wrapped); the language choice has its own row.
- English showed "Find Piece": company terms inside a sentence are now lower case ("Find pieces").
- The help page had two identical React keys for "g, then g" (already before).
- Group actions ("Group created" …) were missing from the list of audit log actions (already before; they appeared as `GROUP_CREATED`).

## Limits and open points

1. **Company texts are single-language.** Device names, descriptions, categories, rooms, groups, own terms, form fields, welcome text and own e-mail texts appear in every language as the company writes them. The pages point this out. Multilingual company texts would be an extension of their own.
2. **Old audit log entries** (before the localization) keep their German summary; field names and known values in them are translated.
3. **Audit log search** searches the German summary. Whoever searches for "approved" in English finds nothing; in other languages the page says so below the search field. Names, devices and serial numbers are found in every language.
4. **Dates in audit log details** ("Zeitraum: 15.10.2026, 09:00 – …") are formatted in German when written and stay that way. The time of the entries themselves follows the language.
5. **Grammar of company terms:** terms are inserted without gender and case. In Spanish "{room} «A101» guardada" fits "Sala", but not an own masculine term; similarly in Hindi. In German this was always so (terms without a choice of article).
6. **Translation quality:** English and Spanish are careful but not checked by native speakers; **Chinese and Hindi should be reviewed by native speakers before customers use them** (technical terms such as 设备件/इकाई for "piece", tone of the greeting).
7. **Browser validation** (`required`, `minLength`, date fields) speaks the browser's language, not the app's.
8. **Right-to-left** is not needed (none of the five languages), but is not prepared either.
9. **Keyboard shortcuts** stay based on German words (`g k` = Katalog); only the labels are translated.
10. **Server logs** in the console were German at the time of the audit; since `bb004bc` they are English (for operation, not for users).

## Adding a new language

1. Create `backend/src/i18n/<code>.ts` and `frontend/src/i18n/<code>.ts` as a copy of `en.ts`, keep the type `Messages` and translate – the type check reports every missing key.
2. Add the code to `locales` and `intlTag` (`backend/src/i18n/locales.ts`, `frontend/src/i18n/index.tsx`) and the dictionary to `dictionaries` (`backend/src/i18n/index.ts`, `frontend/src/i18n/index.tsx`); in the frontend also the name in `localeNames`.
3. `npm run check` in the root directory.
