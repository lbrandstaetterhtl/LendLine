# Lokalisierungs-Audit 1 – Bestandsaufnahme der Texte

Stand: 2026-09-25, Commit `e377461`. Ziel: LendLine in **Deutsch, Englisch, Spanisch,
Mandarin (vereinfachtes Chinesisch) und Hindi**. Dieses Audit erfasst, wo überall Text entsteht,
bevor lokalisiert wird; `localization-audit-2.md` prüft danach das Ergebnis.

**Methode:** Ein Skript zählt sichtbaren Text im Quellcode (JSX-Text, Attribute wie `label`,
`title`, `placeholder`, `aria-label`, String- und Template-Literale mit Wörtern). Mehrzeilige
JSX-Texte erkennt es nicht vollständig; die Zahlen sind deshalb **Untergrenzen**. Danach wurden alle
Dateien mit Treffern gelesen und die Stellen eingeordnet, die ein Textsuchlauf nicht findet
(Formate, gespeicherte Texte, Grammatik).

## Überblick

| Bereich                                 | Fundstellen (mind.) | Wo                                                                      |
| --------------------------------------- | ------------------- | ----------------------------------------------------------------------- |
| Oberfläche (Seiten, Komponenten)        | ~480                | 23 Seiten, 14 Komponenten in `frontend/src`                             |
| Fehlermeldungen der API                 | 127 `HttpError`     | 25 Dateien in `backend/src` (Services, Routen, Middleware)              |
| Validierungsmeldungen                   | ~35 + Zod-Standard  | `backend/src/validators`, Schemas in Services und Routen, Formulare     |
| E-Mails                                 | 4 Vorlagen + Rahmen | `backend/src/emails/templates.ts`, `format.ts`, Standardtexte           |
| Protokoll (gespeichert)                 | 39 `recordAudit`    | Zusammenfassung + Feldnamen + Werte als deutscher Text in der Datenbank |
| Kataloge vom Server                     | 32 + 10             | Rechte (`lib/permissions.ts`), Modus-Bereiche (`lib/uiFeatures.ts`)     |
| Standardwerte (gespeichert/als Vorgabe) | ~25                 | Einstellungen, E-Mail-Texte, Begriffe, Anmeldeseite, Wartungshinweis    |
| Datums-/Zahlenformate, Sortierung       | 16                  | `de-DE`, `Europe/Berlin`, Wochentage, `localeCompare("de")`             |
| Statische Seite                         | 2                   | `index.html`: `lang="de"`, `<title>`                                    |

Summe laut Skript: 785 Textstellen (Frontend 479, Backend 306), dazu die gespeicherten Texte.

## A. Oberfläche (Frontend)

Größte Dateien (Skript-Treffer): `AdminBrandingPage` 40, `AdminUsersPage` 35, `AdminGroupsPage` 34,
`HelpPage` 33, `AuditTimeline` 29, `AdminDevicesPage` 28, `DeviceImages` (Kalender, Anfrageformular)
25, `AdminSettingsPage` 24, `AdminMaintenancePage` 21, `AdminEmailsPage` 18, `AdminRoomsPage` 18,
`SearchPage` 17, `AdminAuditPage` 16, `AccountPage` 15, `AdminHomePage` 13, `AdminRequestsPage` 12,
`AdminCategoriesPage` 11, `DevicesPage` 11, `Layout` 10, `MyRequestsPage` 8, `BrandingContext` 8,
`AdminModePage` 7, `AdminBorrowedPage` 7, `RegisterPage` 7, `DeviceFields` 7, `LoginPage` 5,
`appearance` 5, `types` 4 (Statusnamen), `SettingsTabs` 4, `shortcuts` 17 (Menünamen), `ui.tsx`
(„optional“, Schließen), `CategorySelect`, `RequestSent`, `Logo` (Alt-Texte).

Arten: sichtbarer Text, Überschriften, Beschriftungen, Hinweise, Platzhalter, Tooltips (`title`),
Screenreader-Texte (`aria-label`, `sr-only`), `window.confirm`-Rückfragen, Erfolgsmeldungen,
Fehlermeldungen der Oberfläche, Statusnamen (`types.ts`), Menüeinträge und Tastenkürzel
(`shortcuts.ts`).

**Sonderfälle:**

- **Zusammengesetzte Sätze** mit Zahlen und Namen: „4 Stücke frei“, „Anfrage für „X“ zurückziehen?“,
  „{n} von {m} Rechten“. Hart kodierte Plurale (`=== 1 ? "" : "e"`) funktionieren nur im Deutschen.
- **Firmenbegriffe** (`useTerms`): „Gerät“, „Stück“, „Raum“ … sind als deutsche Vorgaben gespeichert
  und werden in Sätze eingesetzt.
- **Tastenkürzel** sind an deutsche Wörter angelehnt (`g` + `k` = Katalog). Sie bleiben gleich; nur
  die Beschriftung wird übersetzt.
- **Wochenbeginn und Schnellauswahl** („Heute“, „Nächste Woche“, Kalender ab Montag) sind in der
  Logik deutsch geprägt.

## B. Fehlermeldungen der API

127 `throw new HttpError(status, "…")` in 25 Dateien, dazu Meldungen in der Fehlerbehandlung
(„Interner Serverfehler“, „Ungültiger Anfrage-Inhalt“), im Rate Limit („Zu viele Versuche …“) und
beim Upload. Das Frontend zeigt `error` **wörtlich** an; die Sprache des Servers ist also die
Sprache, die Nutzer sehen. Viele Meldungen enthalten Werte („Stück LT-1001 ist ausgeliehen …“,
„Eine Ausleihe dauert höchstens 30 Tage“).

## C. Validierung

- Eigene Zod-Meldungen (~35): Namenslängen, E-Mail, Passwort, Zeitformat, Farbe, Domains.
- **Zod-Standardmeldungen** sind Englisch („Required“, „Invalid input“, „Expected string“) und
  erscheinen bei Feldern ohne eigene Meldung – schon heute ein Sprachmix.
- Browser-Validierung (`required`, `minLength`) spricht die Sprache des Browsers, nicht der App.

## D. E-Mails

Vier Nachrichten (Bestätigung, Ablehnung, Rückgabe, Test) aus `emails/templates.ts`: Betreff,
Überschrift, Einleitung, Tabellenbeschriftungen („Kategorie“, „Seriennummer“, „Zeitraum“), Link-Text,
Datumsformat. Dazu die **Firmentexte** (Anrede, Signatur, Fußzeile, Text je Nachricht) mit deutschen
Vorgaben. **Problem:** Beim Versand ist unbekannt, welche Sprache der Empfänger spricht – es gibt
keine Spracheinstellung pro Person.

## E. Protokoll

39 Aufrufe von `recordAudit` speichern die Zusammenfassung („Ausleihe von „X“ … bestätigt“), die
Feldnamen der Änderungen („Name“, „Kategorie“, „Status“) und Kontext („Grund“, „Zeitraum“) als
**deutschen Text in der Datenbank**. Aktionsnamen („Anfrage bestätigt“) übersetzt das Frontend
selbst (`AuditTimeline.tsx`). Bestehende Einträge bleiben deutsch, egal was später passiert; die
Textsuche im Protokoll durchsucht die deutsche Zusammenfassung.

## F. Kataloge und Standardwerte vom Server

- **Rechte** (`lib/permissions.ts`): 5 Abschnitte, 23 Rechte mit Name und Hinweis, per
  `GET /api/groups/permissions` an die Gruppenseite.
- **Modus-Bereiche** (`lib/uiFeatures.ts`): 9 Bereiche mit Name und Beschreibung, per `GET /api/ui`.
- **Standardwerte**, die in der Datenbank landen, sobald eine Einstellung gespeichert wird:
  E-Mail-Anrede, Signatur, Fußzeile, Texte je Nachricht; Name und Beispiel des Kommentarfelds;
  Begriffe und Untertitel; Überschrift der Anmeldeseite; Wartungshinweis. Gespeichert sind sie von
  echten Firmentexten nicht zu unterscheiden.
- **Firmentexte** (von der Verwaltung eingegeben) sind einsprachig. Sie werden nicht übersetzt.

## G. Formate

- Datum/Zeit: `Intl.DateTimeFormat("de-DE", …, timeZone: "Europe/Berlin")` in Frontend und E-Mails,
  `toLocaleDateString("de-DE")` im Kalender und Protokoll (8 Stellen), Monatsname im Kalender.
- Wochentagskürzel `["Mo", "Di", …]` fest im Kalender.
- Sortierung `localeCompare(…, "de")` im Backend (3 Stellen): für Gerätenamen unkritisch, bleibt.
- Zahlen (MB, Anzahlen) ohne Formatierung; Dezimaltrennzeichen im Wartungsbereich („1.2 MB“).

## H. Statisch

`index.html`: `lang="de"` (Screenreader lesen jede Sprache mit deutscher Aussprache) und der
Seitentitel.

## Nicht zu lokalisieren

Inhalte der Firma (Gerätenamen, Kategorien, Räume, Beschreibungen, Eigenschaften, Personennamen),
Server-Logs in der Konsole, Kommentare im Code, die Doku in `doc/` (englisch) und die Audits.

## Vorgehen (aus diesem Audit abgeleitet)

1. **Wörterbücher mit Typprüfung:** Deutsch ist die Quelle; jede andere Sprache muss dieselben
   Schlüssel haben – fehlt einer, schlägt `npm run check` fehl. Platzhalter `{name}`, Plural über
   `Intl.PluralRules` (Chinesisch kennt keinen Plural, Hindi one/other).
2. **Sprache der Anfrage:** Frontend schickt die gewählte Sprache mit (`Accept-Language`); der Server
   übersetzt Fehler- und Validierungsmeldungen je Anfrage (inkl. Zod-Standardmeldungen).
3. **Sprache pro Person** (`User.locale`) für E-Mails; Auswahl in der Seitenleiste, auf der
   Anmeldeseite und unter „Mein Konto“, Vorgabe aus dem Browser.
4. **Protokoll:** neue Einträge speichern zusätzlich Schlüssel + Werte und werden in der
   Sprache der Lesenden gezeigt; Feld- und Wertnamen über eine Zuordnungstabelle – so werden auch
   alte Einträge größtenteils übersetzt.
5. **Standardwerte:** Ein gespeicherter Wert, der der deutschen Vorgabe entspricht, gilt als „nicht
   angepasst“ und wird in der jeweiligen Sprache gezeigt; nur echte Firmentexte bleiben wörtlich.
6. **Formate** aus der gewählten Sprache (`Intl`), Zeitzone weiter `Europe/Berlin`.
7. **Übersetzungen** von Mandarin und Hindi sollten vor dem Einsatz bei Kunden von
   Muttersprachlern geprüft werden.
