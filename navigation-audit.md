# Navigations-Audit – LendLine

Stand: 2026-09-25, Commit `df15966`. Geprüft wurde, wie man sich durch LendLine bewegt: Seitenleiste,
Wege zu den häufigsten Aufgaben, Dialoge, Weiterleitungen, Links aus E-Mails und der Übersicht.

**Methode:** Code-Review aller Seiten und Routen (`App.tsx`, `Layout.tsx`, alle `pages/`) und ein
Durchgang im Browser (Edge headless) mit den Demo-Konten, auf einem typischen Laptop-Bildschirm
(1366 × 768) und einem Handy (390 × 844). Gezählt wurden Klicks bis zum Ziel und gleichzeitig
offene Dialoge.

## Ausgangslage (gemessen)

| Aufgabe                                          | Weg heute                                                                                            | Klicks bis Formular | Dialoge übereinander |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------- | -------------------- |
| Nutzer bucht über die Suche                      | Suche (Ergebnisse für morgen sind schon da) → „Kalender & anfragen“ → „Für diesen Zeitraum anfragen“ | 2                   | **2**                |
| Nutzer bucht über den Katalog                    | Katalog → „Stücke“ → „Kalender“ → Tag wählen                                                         | 3                   | **3**                |
| Nutzer öffnet einen Link, ist abgemeldet         | `/my-requests` → Anmeldung → landet auf `/search`                                                    | –                   | –                    |
| Nutzer will nach Bestätigungs-E-Mail zur App     | E-Mail enthält keinen Link                                                                           | –                   | –                    |
| Verwaltung prüft eine Anfrage aus der Übersicht  | Übersicht zeigt sie → „Alle prüfen“ → Anfrage in der Liste suchen → Bestätigen                       | 2 + Suchen          | –                    |
| Verwaltung ändert Registrierung/E-Mail-Text/Logo | drei verschiedene Menüpunkte (Einstellungen, E-Mails, Erscheinungsbild)                              | 1                   | –                    |

Seitenleiste der Verwaltung: **16 Einträge in 5 Gruppen**. Auf 1366 × 768 sind 202 px verdeckt;
„Einstellungen“, „E-Mails“, „Wartung“ und „Bedienung“ sind erst nach Scrollen zu sehen.

## Findings

| #   | Finding                                                                   | Schweregrad | Status    |
| --- | ------------------------------------------------------------------------- | ----------- | --------- |
| 1   | Buchen über den Katalog stapelt drei Dialoge                              | Hoch        | umgesetzt |
| 2   | Buchen über die Suche stapelt zwei Dialoge, obwohl der Zeitraum feststeht | Mittel      | umgesetzt |
| 3   | Seitenleiste der Verwaltung zu lang, Einträge nur nach Scrollen sichtbar  | Mittel      | umgesetzt |
| 4   | Einstellungen auf drei Menüpunkte verteilt, Grenzen unklar                | Mittel      | umgesetzt |
| 5   | Nach der Anmeldung geht die ursprünglich geöffnete Seite verloren         | Mittel      | umgesetzt |
| 6   | E-Mails enthalten keinen Link zurück in die App                           | Mittel      | umgesetzt |
| 7   | Nach dem Absenden einer Anfrage kein Weg zu „Meine Anfragen“              | Niedrig     | umgesetzt |
| 8   | Einträge der Übersicht führen nur zur Liste, nicht zur Anfrage            | Niedrig     | umgesetzt |
| 9   | Verwaltung sieht die Ausleihe-Gruppe vor ihrer eigenen Arbeit             | Niedrig     | umgesetzt |
| 10  | Unbekannte Adressen führen auch Admins auf die Suche                      | Niedrig     | umgesetzt |
| 11  | Registrierung wird auf der Benutzerseite nicht erwähnt                    | Niedrig     | umgesetzt |

## Nach den Änderungen (gemessen)

Gleicher Durchgang im Browser nach den Änderungen, gleiche Bildschirmgrößen:

| Aufgabe                                    | Vorher                                   | Nachher                                                                 |
| ------------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------- |
| Nutzer bucht über die Suche                | 2 Klicks, 2 Dialoge übereinander         | **1 Klick** („Anfragen“), 1 Dialog; Kalender im selben Fenster          |
| Nutzer bucht über den Katalog              | 3 Klicks, 3 Dialoge übereinander         | 2 Klicks, **1 Dialog**; bei nur einem Stück direkt der Kalender         |
| Nach dem Absenden                          | Kalender bleibt offen, Hinweis ohne Link | Dialog schließt, Seite zeigt Bestätigung mit „Zu meinen Anfragen“       |
| Abgemeldet `/my-requests` öffnen, anmelden | landet auf `/search`                     | landet auf `/my-requests`                                               |
| Unbekannte Adresse (Verwaltung)            | `/search`                                | `/admin`                                                                |
| E-Mail → App                               | kein Link                                | „Meine Anfragen öffnen“ in Bestätigung, Ablehnung, Rückgabe             |
| Anfrage aus der Übersicht prüfen           | Liste öffnen, Eintrag suchen             | Klick auf den Eintrag springt zur hervorgehobenen Zeile                 |
| Seitenleiste der Verwaltung (1366 × 768)   | 16 Einträge, 202 px verdeckt             | **12 Einträge, nichts verdeckt**; „Verwaltung“ zuerst, „Hilfe“ im Fuß   |
| Einstellungen                              | 4 Menüpunkte                             | 1 Menüpunkt mit 4 Reitern; alte Adressen und Tastenkürzel gelten weiter |

`npm run check` ist in Backend, Frontend und Doku grün. Die Test-Anfrage aus dem Durchgang wurde
wieder zurückgezogen.

Geprüft ohne Befund: „Mein Konto“ (Name unten in der Seitenleiste, beschriftet mit „Mein Konto“),
Tastenkürzel (`g` + Buchstabe, `/`, `n`, `?`), mobiles Menü (öffnet mit Fokus, schließt mit Escape),
Wartungsbanner mit Link, Zähler an „Anfragen“ und „Ausleihen“, Kacheln der Übersicht als Links.

## 1. Buchen über den Katalog stapelt drei Dialoge — **Hoch**

**Dateien:** `frontend/src/pages/DevicesPage.tsx`, `frontend/src/components/DeviceImages.tsx`
(`PieceListDialog` → `PieceCalendarDialog` → Anfrage-Modal)

**Beschreibung:** „Stücke“ öffnet eine Liste der Stücke, „Kalender“ darin einen zweiten Dialog,
ein Tag darin einen dritten mit dem Formular. Im Browser liegen dann „Logitech Presenter“,
„Stück ZB-4001“ und „Ausleihe anfragen“ übereinander. Schließen führt schrittweise zurück, der
Hintergrund ist dreifach abgedunkelt, und auf dem Handy ist nur der oberste Dialog sichtbar. Auch
bei Geräten mit genau einem Stück muss man durch die Stückliste. Der Button heißt im Katalog
„Stücke“, in der Suche „Kalender & anfragen“ – für dieselbe Handlung.

**Verbesserung:** Ein Dialog mit Schritten statt Stapel: Stückliste → Kalender → Formular im
selben Fenster, mit „Zurück“. Bei nur einem verfügbaren Stück direkt zum Kalender. Einheitlicher
Button „Kalender & anfragen“.

## 2. Buchen über die Suche stapelt zwei Dialoge — **Mittel**

**Dateien:** `frontend/src/pages/SearchPage.tsx`, `frontend/src/components/DeviceImages.tsx`

**Beschreibung:** Wer in der Suche schon einen Zeitraum gewählt hat, muss trotzdem erst den
Kalender öffnen und dort „Für diesen Zeitraum anfragen“ klicken; das Formular öffnet sich als
zweiter Dialog über dem Kalender.

**Verbesserung:** „Anfragen“ öffnet direkt das Formular mit dem Zeitraum der Suche. Den Kalender
erreicht man im selben Dialog über „Anderen Zeitraum im Kalender wählen“.

## 3. Seitenleiste der Verwaltung zu lang — **Mittel**

**Dateien:** `frontend/src/components/Layout.tsx`

**Beschreibung:** 16 Einträge und 5 Gruppenüberschriften. Auf einem 768 px hohen Bildschirm sind
die letzten vier Einträge verdeckt. „Bedienung“ steht allein in einer eigenen Gruppe „Hilfe“.

**Verbesserung:** Einstellungen zusammenfassen (Finding 4), „Bedienung“ als Symbol neben
„Darstellung“ in den Fuß der Seitenleiste. Ergebnis: 12 Einträge in 4 Gruppen. Auf niedrigen
Bildschirmen etwas kompaktere Einträge.

## 4. Einstellungen auf drei Menüpunkte verteilt — **Mittel**

**Dateien:** `Layout.tsx`, `AdminBrandingPage.tsx`, `AdminSettingsPage.tsx`, `AdminEmailsPage.tsx`,
`AdminMaintenancePage.tsx`

**Beschreibung:** „Erscheinungsbild“, „Einstellungen“, „E-Mails“ und „Wartung“ sind vier Einträge,
obwohl alle die Installation konfigurieren. Wo etwas liegt, ist nicht vorhersehbar (Registrierung
unter „Einstellungen“, Logo in E-Mails unter „Erscheinungsbild“, Absender unter „E-Mails“).

**Verbesserung:** Ein Eintrag „Einstellungen“ mit Reitern „Erscheinungsbild“, „Regeln & Formular“,
„E-Mails“, „Wartung“. Die bisherigen Adressen bleiben gültig (Lesezeichen, Tastenkürzel,
Wartungsbanner) und öffnen den passenden Reiter.

## 5. Nach der Anmeldung geht die ursprüngliche Seite verloren — **Mittel**

**Dateien:** `frontend/src/App.tsx` (`Protected`), `frontend/src/pages/LoginPage.tsx`

**Beschreibung:** Wer abgemeldet `/my-requests` öffnet (Lesezeichen, abgelaufene Sitzung, Link aus
einer Nachricht), landet nach der Anmeldung auf `/search` bzw. `/admin`.

**Verbesserung:** Die angefragte Adresse wird an die Anmeldung übergeben; danach geht es genau
dorthin (nur interne Pfade, keine fremden Adressen).

## 6. E-Mails ohne Link zurück — **Mittel**

**Dateien:** `backend/src/emails/format.ts`, `backend/src/emails/templates.ts`

**Beschreibung:** Bestätigung, Ablehnung und Rückgabe nennen keine Adresse der App. Wer den Stand
prüfen oder eine neue Anfrage stellen will, muss LendLine selbst finden.

**Verbesserung:** Link „Meine Anfragen öffnen“ (aus `FRONTEND_ORIGIN`) in jeder Benachrichtigung;
mit Finding 5 führt er auch nach einer Anmeldung auf die richtige Seite.

## 7. Nach dem Absenden kein Weg zu „Meine Anfragen“ — **Niedrig**

**Dateien:** `DeviceImages.tsx`, `SearchPage.tsx`, `DevicesPage.tsx`

**Beschreibung:** Nach „Anfrage senden“ bleibt der Kalender offen, der Hinweis „Den Stand sehen Sie
unter ‚Meine Anfragen‘“ ist kein Link.

**Verbesserung:** Der Dialog schließt sich, die Seite zeigt die Bestätigung mit Link „Zu meinen
Anfragen“.

## 8. Übersicht führt nur zur Liste — **Niedrig**

**Dateien:** `AdminHomePage.tsx`, `AdminRequestsPage.tsx`, `AdminBorrowedPage.tsx`

**Beschreibung:** Die Übersicht zeigt die ältesten offenen Anfragen und fällige Rückgaben, aber
ein Klick führt nur auf die ganze Liste; dort muss man den Eintrag wieder suchen.

**Verbesserung:** Jeder Eintrag verlinkt auf seine Zeile; sie wird in der Liste angesprungen und
hervorgehoben.

## 9. Verwaltung sieht zuerst die Ausleihe — **Niedrig**

**Dateien:** `Layout.tsx`

**Beschreibung:** Admins landen auf der Übersicht, die Seitenleiste zeigt aber zuerst „Stück
suchen / Katalog / Meine Anfragen“. Die eigentliche Arbeit (Anfragen, Ausleihen) steht darunter.

**Verbesserung:** Für Admins steht die Gruppe „Verwaltung“ oben, „Ausleihe“ darunter.

## 10. Unbekannte Adressen führen Admins auf die Suche — **Niedrig**

**Dateien:** `App.tsx`

**Beschreibung:** Jede unbekannte Adresse leitet auf `/search`, auch für die Verwaltung.

**Verbesserung:** Weiterleitung auf die Startseite der Rolle (`/admin` bzw. `/search`).

## 11. Registrierung auf der Benutzerseite nicht erwähnt — **Niedrig**

**Dateien:** `AdminUsersPage.tsx`

**Beschreibung:** Wer auf „Benutzer“ nach der Selbstregistrierung sucht, findet sie nicht; sie liegt
unter den Einstellungen.

**Verbesserung:** Hinweis mit aktuellem Stand und Link zur Einstellung auf der Benutzerseite.
