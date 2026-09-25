# Lokalisierungs-Audit 2 – Prüfung des Ergebnisses

Stand: 2026-09-25, auf `e377461` plus die Lokalisierung (noch nicht committet). Prüft, ob die
Lokalisierung alles abdeckt, was `localization-audit-1.md` gefunden hat, und was offen bleibt.

**Ergebnis:** Oberfläche, API-Meldungen, Validierung, E-Mails, Protokoll, Kataloge und Formate sind
in **Deutsch, Englisch, Spanisch, vereinfachtem Chinesisch und Hindi** vorhanden. Kein
Oberflächentext ist mehr fest im Code. Offen sind vor allem inhaltliche Grenzen (Firmentexte,
alte Protokolleinträge, Grammatik bei Firmenbegriffen) und eine Prüfung von Chinesisch und Hindi
durch Muttersprachler.

## Methode

1. **Vollständigkeit per Typprüfung:** Deutsch ist die Quelle (`de.ts`), die anderen Sprachen sind
   als `Messages` typisiert. Ein fehlender oder überzähliger Schlüssel lässt `npm run check`
   scheitern. Zusätzlich lädt ein Skript alle Wörterbücher und vergleicht Schlüssel und Platzhalter.
2. **Textsuche wie in Audit 1:** dasselbe Suchskript über `frontend/src` und `backend/src`, ohne die
   Wörterbücher; jede verbleibende Fundstelle eingeordnet.
3. **Protokollwörter:** ein Skript sammelt alle festen Feldnamen und Werte, die die Services ins
   Protokoll schreiben, und prüft sie gegen die Übersetzungstabelle `auditTerms`.
4. **Oberfläche im Browser:** Edge (headless) meldet sich in jeder der fünf Sprachen an, öffnet
   19 Seiten und sucht im sichtbaren Text, in `title`, `aria-label` und `placeholder` nach deutschen
   Wörtern; dazu Screenshots und die Konsolenfehler.
5. **API und E-Mails:** Anfragen mit `Accept-Language` in allen Sprachen; eine echte Ausleihe, die
   eine Verwaltungsperson auf Deutsch bestätigt, für eine Person mit Sprache Spanisch.

## Zahlen

| Wörterbuch                      | Texte  | Fehlend | Überzählig | Platzhalter abweichend |
| ------------------------------- | ------ | ------- | ---------- | ---------------------- |
| Frontend `de` (Quelle)          | 859    | –       | –          | –                      |
| Frontend `en`, `es`, `zh`, `hi` | je 859 | 0       | 0          | 0                      |
| Backend `de` (Quelle)           | 398    | –       | –          | –                      |
| Backend `en`, `es`, `zh`, `hi`  | je 398 | 0       | 0          | 1 (s. u.)              |

Die eine Abweichung ist gewollt: Chinesisch nutzt in `errors.tooManyOpen` auch für „eine“ Anfrage
`{count}`, weil es keine eigene Einzahl gibt. Texte, die im Englischen gleich wie im Deutschen sind
(„Name“, „Status“, „Details“, „System“, „Start“), und „Normal“ im Spanischen sind echte Übersetzungen,
keine vergessenen.

**Textsuche:** Von 785 Fundstellen aus Audit 1 bleiben im Code außerhalb der Wörterbücher nur
diese Arten übrig, alle mit Absicht:

| Art                                                          | Beispiele                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Gespeicherte deutsche Vorgaben (werden beim Lesen übersetzt) | Begriffe „Gerät“, „Stück“ (`BrandingContext`, `brandingService`), Kommentarfeld, Wartungshinweis |
| Protokoll-Rohdaten (werden beim Lesen übersetzt)             | Feldnamen „Kategorie“, „Gebäude“; Werte „Bestätigt“; Muster „Stück LT-1001“, „3 Std. verspätet“  |
| Server-Logs und Startmeldungen (Konsole)                     | „LendLine API läuft auf …“, „SMTP nicht konfiguriert“, Warnungen in `config.ts`                  |
| Interne Fehler, die nie bei Nutzern ankommen                 | „Ungültiges Access-Token“ (wird zu 401 „Sitzung abgelaufen“ übersetzt)                           |

**Protokollwörter:** 62 feste Wörter gefunden, alle in `auditTerms` (vorher fehlten die
Stückstatus „Verfügbar“, „Ausgeliehen“, „Defekt“ – ergänzt).

**Browser:** In allen fünf Sprachen keine deutschen Oberflächentexte; übrig sind nur Firmendaten
aus dem Demo-Bestand (Gerätebeschreibungen, Gruppen, Begrüßungstext) und alte Protokolleinträge.
Einzige Konsolenmeldung: die gewollte 401 beim absichtlich falschen Passwort. `<html lang>` folgt
der Sprache.

## Prüfung der Punkte aus Audit 1

| Audit 1                     | Umsetzung                                                                                                                                                                | Status               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| A. Oberfläche               | Alle Seiten und Komponenten lesen aus `frontend/src/i18n`; Statusnamen, Tastenkürzel-Beschriftungen, Rückfragen, `aria-label`, Platzhalter                               | erledigt             |
| A. Sätze mit Zahlen/Plural  | `format()` mit Platzhaltern und `{ one, other }` über `Intl.PluralRules`; keine `=== 1 ? … :`-Plurale mehr                                                               | erledigt             |
| A. Firmenbegriffe           | als Platzhalter (`{unit}`); Vorgabe-Begriffe in jeder Sprache übersetzt; `{unit:lower}` im Satz (en/es)                                                                  | erledigt, s. Grenzen |
| B. Fehlermeldungen der API  | 127 `HttpError` über `t()` in der Sprache der Anfrage (`Accept-Language`), auch Rate Limit, Upload, 500                                                                  | erledigt             |
| C. Validierung              | eigene Meldungen als Schlüssel `validation.*`; Zod-Standardmeldungen nach Art übersetzt                                                                                  | erledigt             |
| C. Browser-Validierung      | spricht weiter die Sprache des Browsers                                                                                                                                  | offen (Browser)      |
| D. E-Mails                  | Sprache der Empfangenden (`User.locale`), Texte, Daten, Standardtexte; Test-E-Mail in der Sprache der auslösenden Person                                                 | erledigt             |
| E. Protokoll                | neue Einträge: Schlüssel + Werte, Anzeige in der Sprache der Lesenden; Feld- und Wertnamen über `auditTerms`, veränderliche Werte über `auditPatterns`, Status in Listen | erledigt, s. Grenzen |
| F. Rechte, Modus-Bereiche   | Texte aus den Wörterbüchern, der Server liefert sie übersetzt                                                                                                            | erledigt             |
| F. Standardwerte            | gleich der deutschen Vorgabe = „nicht angepasst“, in jeder Sprache übersetzt; Editoren zeigen sie übersetzt und speichern unverändert die Vorgabe                        | erledigt             |
| G. Formate                  | `Intl` mit der Sprache für Datum, Monat, Wochentage, Zahlen; Zeitzone `Europe/Berlin`                                                                                    | erledigt             |
| H. `index.html`             | `lang` vor dem ersten Zeichnen aus der Wahl; Titel aus dem übersetzten Untertitel                                                                                        | erledigt             |
| Vorgehen 3: Sprachwahl      | Seitenleiste, Anmelde- und Registrierungsseite, „Mein Konto“; Vorgabe aus dem Browser; am Konto gespeichert                                                              | erledigt             |
| Vorgehen 7: Muttersprachler | Übersetzungen stammen nicht von Muttersprachlern                                                                                                                         | offen                |

## Gefunden und behoben während dieses Audits

- Stückstatus fehlten in `auditTerms` → Statusänderungen blieben im Protokoll deutsch.
- Listen wie „LT-1001 (Verfügbar), LT-1002 (Defekt)“ im Protokoll werden jetzt übersetzt.
- Chinesisch und Spanisch nutzten im Backend andere Wörter für „defekt“ als die Oberfläche
  (损坏/故障, defectuoso/averiado); Chinesisch „Offen“ im Protokoll anders als der Status. Angeglichen.
- Hindi nutzte „ऋण“ (Kredit) statt „उधार“ (Ausleihe); Chinesisch „件“ allein als Begriff. Ersetzt.
- Die E-Mail-Einstellungen zeigten Nicht-Deutschsprachigen die deutschen Vorgabetexte zum Bearbeiten;
  jetzt übersetzt, beim Speichern bleibt die Vorgabe erhalten (getestet: en → gespeichert de).
- Die Seitenleiste war für Sprachwahl, Hilfe und Darstellung zu schmal („帮助“ brach um); die
  Sprachwahl hat eine eigene Zeile.
- Englisch zeigte „Find Piece“: Firmenbegriffe stehen mitten im Satz jetzt klein („Find pieces“).
- Die Hilfeseite hatte bei „g, dann g“ zwei gleiche React-Schlüssel (auch schon vorher).
- Gruppen-Aktionen („Gruppe angelegt“ …) fehlten in der Liste der Protokoll-Aktionen (auch schon
  vorher; erschienen als `GROUP_CREATED`).

## Grenzen und offene Punkte

1. **Firmentexte sind einsprachig.** Gerätenamen, Beschreibungen, Kategorien, Räume, Gruppen,
   eigene Begriffe, Formularfelder, Begrüßungstext und eigene E-Mail-Texte erscheinen in jeder
   Sprache so, wie die Firma sie schreibt. Die Seiten weisen darauf hin. Mehrsprachige Firmentexte
   wären eine eigene Erweiterung.
2. **Alte Protokolleinträge** (vor der Lokalisierung) behalten ihre deutsche Zusammenfassung;
   Feldnamen und bekannte Werte darin werden übersetzt.
3. **Protokollsuche** durchsucht die deutsche Zusammenfassung. Wer auf Englisch „approved“ sucht,
   findet nichts; die Seite sagt das in anderen Sprachen unter dem Suchfeld. Namen, Geräte und
   Seriennummern findet die Suche in jeder Sprache.
4. **Daten in Protokoll-Details** („Zeitraum: 15.10.2026, 09:00 – …“) sind beim Schreiben deutsch
   formatiert und bleiben so. Die Zeit der Einträge selbst folgt der Sprache.
5. **Grammatik bei Firmenbegriffen:** Begriffe werden ohne Geschlecht und Fall eingesetzt. Im
   Spanischen passt „{room} „A101“ guardada“ zu „Sala“, aber nicht zu einem eigenen männlichen
   Begriff; im Hindi ähnlich. Im Deutschen war das schon immer so (Begriffe ohne Artikelwahl).
6. **Übersetzungsqualität:** Englisch und Spanisch sind sorgfältig, aber nicht muttersprachlich
   geprüft; **Chinesisch und Hindi sollten vor dem Einsatz bei Kunden von Muttersprachlern
   durchgesehen werden** (Fachbegriffe wie 设备件/इकाई für „Stück“, Tonfall der Anrede).
7. **Browser-Validierung** (`required`, `minLength`, Datumsfelder) spricht die Sprache des Browsers,
   nicht die der App.
8. **Rechts-nach-links** wird nicht gebraucht (keine der fünf Sprachen), ist aber auch nicht
   vorbereitet.
9. **Tastenkürzel** bleiben an deutsche Wörter angelehnt (`g k` = Katalog); nur die Beschriftung ist
   übersetzt.
10. **Server-Logs** in der Konsole bleiben deutsch (für den Betrieb, nicht für Nutzer).

## Neue Sprache hinzufügen

1. `backend/src/i18n/<code>.ts` und `frontend/src/i18n/<code>.ts` als Kopie von `en.ts` anlegen,
   Typ `Messages` behalten und übersetzen – die Typprüfung meldet jeden fehlenden Schlüssel.
2. Den Code in `locales` und `intlTag` eintragen (`backend/src/i18n/locales.ts`,
   `frontend/src/i18n/index.tsx`) und das Wörterbuch in `dictionaries` (`backend/src/i18n/index.ts`,
   `frontend/src/i18n/index.tsx`); im Frontend zusätzlich den Namen in `localeNames`.
3. `npm run check` im Hauptverzeichnis.
