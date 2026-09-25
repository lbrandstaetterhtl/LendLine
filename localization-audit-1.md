# Localization audit 1 – inventory of the texts

As of 2026-09-25, commit `e377461`. Goal: LendLine in **German, English, Spanish, Mandarin (Simplified Chinese) and Hindi**. This audit records everywhere text is produced before localizing; `localization-audit-2.md` then checks the result.

**Method:** A script counts visible text in the source code (JSX text, attributes such as `label`, `title`, `placeholder`, `aria-label`, string and template literals with words). It does not fully recognize multi-line JSX texts; the numbers are therefore **lower bounds**. Afterwards all files with hits were read, and the places a text search does not find (formats, stored texts, grammar) were classified.

## Overview

| Area                                 | Hits (at least)     | Where                                                                |
| ------------------------------------ | ------------------- | -------------------------------------------------------------------- |
| Interface (pages, components)        | ~480                | 23 pages, 14 components in `frontend/src`                            |
| API error messages                   | 127 `HttpError`     | 25 files in `backend/src` (services, routes, middleware)             |
| Validation messages                  | ~35 + Zod defaults  | `backend/src/validators`, schemas in services and routes, forms      |
| E-mails                              | 4 templates + frame | `backend/src/emails/templates.ts`, `format.ts`, default texts        |
| Audit log (stored)                   | 39 `recordAudit`    | Summary + field names + values as German text in the database        |
| Catalogues from the server           | 32 + 10             | Permissions (`lib/permissions.ts`), mode areas (`lib/uiFeatures.ts`) |
| Default values (stored/as a default) | ~25                 | Settings, e-mail texts, terms, sign-in page, maintenance notice      |
| Date/number formats, sorting         | 16                  | `de-DE`, `Europe/Berlin`, weekdays, `localeCompare("de")`            |
| Static page                          | 2                   | `index.html`: `lang="de"`, `<title>`                                 |

Total according to the script: 785 text spots (frontend 479, backend 306), plus the stored texts.

## A. Interface (frontend)

Largest files (script hits): `AdminBrandingPage` 40, `AdminUsersPage` 35, `AdminGroupsPage` 34, `HelpPage` 33, `AuditTimeline` 29, `AdminDevicesPage` 28, `DeviceImages` (calendar, request form) 25, `AdminSettingsPage` 24, `AdminMaintenancePage` 21, `AdminEmailsPage` 18, `AdminRoomsPage` 18, `SearchPage` 17, `AdminAuditPage` 16, `AccountPage` 15, `AdminHomePage` 13, `AdminRequestsPage` 12, `AdminCategoriesPage` 11, `DevicesPage` 11, `Layout` 10, `MyRequestsPage` 8, `BrandingContext` 8, `AdminModePage` 7, `AdminBorrowedPage` 7, `RegisterPage` 7, `DeviceFields` 7, `LoginPage` 5, `appearance` 5, `types` 4 (status names), `SettingsTabs` 4, `shortcuts` 17 (menu names), `ui.tsx` ("optional", close), `CategorySelect`, `RequestSent`, `Logo` (alt texts).

Kinds: visible text, headings, labels, hints, placeholders, tooltips (`title`), screen reader texts (`aria-label`, `sr-only`), `window.confirm` questions, success messages, interface error messages, status names (`types.ts`), menu entries and keyboard shortcuts (`shortcuts.ts`).

**Special cases:**

- **Composed sentences** with numbers and names: "4 Stücke frei" (4 pieces free), "Anfrage für „X“ zurückziehen?" (withdraw the request for "X"?), "{n} von {m} Rechten" ({n} of {m} permissions). Hard-coded plurals (`=== 1 ? "" : "e"`) only work in German.
- **Company terms** (`useTerms`): "Gerät", "Stück", "Raum" … are stored as German defaults and inserted into sentences.
- **Keyboard shortcuts** are based on German words (`g` + `k` = Katalog). They stay the same; only the labels are translated.
- **Start of the week and quick selection** ("Heute", "Nächste Woche", calendar from Monday) are German in their logic.

## B. API error messages

127 `throw new HttpError(status, "…")` in 25 files, plus messages in the error handling ("Interner Serverfehler", "Ungültiger Anfrage-Inhalt"), in the rate limit ("Zu viele Versuche …") and for uploads. The frontend shows `error` **verbatim**; the server's language is therefore the language users see. Many messages contain values ("Stück LT-1001 ist ausgeliehen …", "Eine Ausleihe dauert höchstens 30 Tage").

## C. Validation

- Own Zod messages (~35): name lengths, e-mail, password, time format, colour, domains.
- **Zod's default messages** are English ("Required", "Invalid input", "Expected string") and appear for fields without an own message – already a mix of languages today.
- Browser validation (`required`, `minLength`) speaks the browser's language, not the app's.

## D. E-mails

Four messages (approval, rejection, return, test) from `emails/templates.ts`: subject, heading, introduction, table labels ("Kategorie", "Seriennummer", "Zeitraum"), link text, date format. Plus the **company texts** (greeting, signature, footer, text per message) with German defaults. **Problem:** when sending, it is unknown which language the recipient speaks – there is no language setting per person.

## E. Audit log

39 calls of `recordAudit` store the summary ("Ausleihe von „X“ … bestätigt"), the field names of the changes ("Name", "Kategorie", "Status") and context ("Grund", "Zeitraum") as **German text in the database**. Action names ("Anfrage bestätigt") are translated by the frontend itself (`AuditTimeline.tsx`). Existing entries stay German whatever happens later; the text search in the audit log searches the German summary.

## F. Catalogues and default values from the server

- **Permissions** (`lib/permissions.ts`): 5 sections, 23 permissions with name and hint, sent to the groups page via `GET /api/groups/permissions`.
- **Mode areas** (`lib/uiFeatures.ts`): 9 areas with name and description, via `GET /api/ui`.
- **Default values** that end up in the database as soon as a setting is saved: e-mail greeting, signature, footer, texts per message; name and example of the comment field; terms and subtitle; heading of the sign-in page; maintenance notice. Once stored they cannot be told apart from real company texts.
- **Company texts** (entered by the administration) are single-language. They are not translated.

## G. Formats

- Date/time: `Intl.DateTimeFormat("de-DE", …, timeZone: "Europe/Berlin")` in the frontend and e-mails, `toLocaleDateString("de-DE")` in the calendar and audit log (8 places), month name in the calendar.
- Weekday abbreviations `["Mo", "Di", …]` hard-coded in the calendar.
- Sorting `localeCompare(…, "de")` in the backend (3 places): uncritical for device names, stays.
- Numbers (MB, counts) without formatting; decimal separator in the maintenance area ("1.2 MB").

## H. Static

`index.html`: `lang="de"` (screen readers read every language with German pronunciation) and the page title.

## Not to be localized

Company content (device names, categories, rooms, descriptions, properties, person names), server logs in the console, comments in the code, the documentation in `doc/` (English) and the audits.

## Approach (derived from this audit)

1. **Dictionaries with a type check:** German is the source; every other language must have the same keys – if one is missing, `npm run check` fails. Placeholders `{name}`, plurals via `Intl.PluralRules` (Chinese has no plural, Hindi one/other).
2. **Language of the request:** the frontend sends the chosen language (`Accept-Language`); the server translates error and validation messages per request (including Zod's default messages).
3. **Language per person** (`User.locale`) for e-mails; choice in the sidebar, on the sign-in page and under "My account", default from the browser (since `bb004bc`: English).
4. **Audit log:** new entries also store key + values and are shown in the reader's language; field and value names via a mapping table – so old entries are largely translated too.
5. **Default values:** a stored value equal to the German default counts as "not adapted" and is shown in the respective language; only real company texts stay verbatim.
6. **Formats** from the chosen language (`Intl`), time zone still `Europe/Berlin`.
7. **Translations** of Mandarin and Hindi should be reviewed by native speakers before customers use them.
