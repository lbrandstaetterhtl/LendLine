# Security-Audit 3 – LendLine

Stand: 2026-09-25, Commit `0f3b266` (`main`). Gleiche Kriterien und Schweregrade wie
`security-audit-1.md` und `security-audit-2.md`. Neu gegenüber Audit 2: Das Produkt soll künftig
an Firmen vermietet werden (eine Installation pro Firma, siehe `doc/LendLine.md` §13.6). Befunde
wurden deshalb auch danach bewertet, dass eine Installation **aus dem Internet erreichbar** sein
kann und nicht nur im Firmennetz läuft.

**Umfang:** gesamtes Backend (`backend/src`, ca. 3 900 Zeilen, vollständig gelesen), Prisma-Schema,
sicherheitsrelevante Teile des Frontends (Token-Handling, HTML-Senken, Links, `index.html`,
Vite-Konfiguration), Abhängigkeiten.

**Werkzeuge:**

- Backend und Frontend: `typecheck`, `lint:types` und `knip` sind grün.
- `oxfmt --check` meldet 13 Backend-Dateien. Ursache ist wie in Audit 2 der Checkout mit CRLF
  (`core.autocrlf=true`); kein Sicherheitsbefund.
- `npm audit`: Frontend und Root 0 Schwachstellen. Backend: `deepmerge-ts` (Dev), von npm jetzt als
  **High** eingestuft, siehe Finding 9.

**Laufzeittests** gegen die lokale Installation mit PostgreSQL. In Audit 2 fehlte die Datenbank;
diese Pfade sind jetzt erstmals im Betrieb geprüft.

| Test                                                     | Ergebnis                             |
| -------------------------------------------------------- | ------------------------------------ |
| Refresh, danach altes Refresh-Token erneut verwenden     | 200, dann 401                        |
| Zwei gleichzeitige Refreshes mit demselben Token         | einmal 200, einmal 401               |
| Refresh mit fremdem `Origin`                             | 403                                  |
| 11 falsche Logins für dasselbe Konto                     | 10 × 401, dann 429                   |
| Kaputtes JSON                                            | 400 „Ungültiger Anfrage-Inhalt“      |
| Antwortzeit unbekanntes vs. vorhandenes lokales Konto    | 333 ms vs. 302 ms (kein Unterschied) |
| Security-Header (`nosniff`, `X-Frame-Options`, Referrer) | gesetzt, `X-Powered-By` fehlt        |
| Logo-Upload: SVG mit `<script>`                          | Auslieferung mit `sandbox`-CSP       |
| Logo-Upload: `.txt`, unbekannte Variante, Nutzerkonto    | 400, 404, 403                        |
| `GET /api/auth/options` ohne LDAP                        | `allowLocalRegister: true`           |

## Verifikation der offenen Findings aus Audit 2

| Audit 2 | Thema                                       | Status heute                                                                                                                                      |
| ------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | Secret-/Seed-Schutz nur mit `NODE_ENV`      | **Teilweise behoben:** Platzhalter-Secret wird überall abgelehnt (`config.ts:39-41`). Seed-Sperre und `Secure`-Cookie hängen weiter an `NODE_ENV` |
| 2       | Access-Token 15 min nach Widerruf gültig    | Offen, unverändert                                                                                                                                |
| 3       | Zweiter Verzeichniseintrag übernimmt Konto  | Offen, unverändert                                                                                                                                |
| 4       | LDAP ohne TLS möglich                       | Offen, unverändert                                                                                                                                |
| 5       | Rate Limit im Speicher, pro Prozess, pro IP | Offen; Limit selbst im Betrieb bestätigt (429 nach 10 Versuchen)                                                                                  |
| 6       | Paralleler Refresh aus zwei Tabs            | Offen; Verhalten im Betrieb bestätigt (200/401)                                                                                                   |
| 7       | `JWT_REFRESH_SECRET` ungenutzt              | Offen, unverändert                                                                                                                                |
| 8       | `deepmerge-ts`                              | Offen; npm stuft es jetzt als High ein → Finding 9                                                                                                |
| 9       | Upload-Inhalt nicht geprüft                 | Offen, unverändert; gilt jetzt auch für Firmenlogos (SVG), durch CSP entschärft                                                                   |
| 10      | E-Mail bei Registrierung nicht verifiziert  | Offen; wiegt im Mietmodell schwerer → Finding 1                                                                                                   |

## Aktuelle Findings

| #   | Titel                                                            | Schweregrad | Status                      |
| --- | ---------------------------------------------------------------- | ----------- | --------------------------- |
| 1   | Selbstregistrierung ohne LDAP nicht abschaltbar                  | Medium      | neu                         |
| 2   | Unbegrenzte Anfragen blockieren den gesamten Bestand             | Medium      | neu                         |
| 3   | Nutzer können ihr Passwort nicht selbst ändern                   | Low         | neu                         |
| 4   | Antwortzeit verrät Verzeichniskonten (LDAP)                      | Low         | neu                         |
| 5   | `LDAP_ADMIN_GROUP` als Gruppenname passt auf Gruppen in jeder OU | Low         | neu                         |
| 6   | Keine Security-Header und keine CSP für das Frontend             | Low         | neu                         |
| 7   | „Verwaiste Bilddateien löschen“ kann laufende Uploads löschen    | Low         | neu                         |
| 8   | Sitzungen haben keine absolute Höchstdauer                       | Info        | neu                         |
| 9   | Dev-Abhängigkeit `deepmerge-ts` jetzt als High eingestuft        | Low         | Neubewertung von Audit 2 #8 |

Keine Findings mit Schweregrad Critical oder High. Offene Punkte aus Audit 2 (Tabelle oben) gelten
zusätzlich weiter.

## 1. Selbstregistrierung ohne LDAP nicht abschaltbar — **Medium**

**Dateien:** `backend/src/config.ts:73`, `backend/src/services/authService.ts:65-70`,
`backend/src/routes/auth.ts:60-61`

**Beschreibung:** Die einzige Einstellung zum Abschalten der Registrierung ist
`LDAP_ALLOW_LOCAL_REGISTER`, und sie wirkt nur, wenn LDAP aktiv ist
(`config.ldap.enabled && !config.ldap.allowLocalRegister`). Ohne LDAP ist
`POST /api/auth/register` **immer** offen, nur im Wartungsmodus nicht. Die E-Mail-Adresse wird
nicht bestätigt (Audit 2 #10) und nicht auf Firmen-Domains beschränkt. Das Rate Limit erlaubt
10 Konten pro IP und Stunde.

Im bisherigen Einsatz im Firmennetz war das ein Komfortmerkmal. Eine vermietete Installation einer
kleinen Firma ohne Verzeichnisdienst ist aber typischerweise aus dem Internet erreichbar.

**Angriffsszenario:** Eine beliebige Person findet die Installation, registriert sich mit einer
Wegwerfadresse und ist sofort Nutzer. Sie sieht den vollständigen Gerätekatalog mit Seriennummern,
alle Räume und die Belegung aller Geräte. Sie kann Anfragen stellen, die den Bestand blockieren
(Finding 2), und gibt sich gegenüber der Verwaltung als Mitarbeiter aus.

**Empfohlener Fix:** Eine eigene Einstellung `ALLOW_REGISTRATION` (Standard `false` für neue
Installationen), besser noch in der Oberfläche unter „Erscheinungsbild“ bzw. einer neuen Seite
„Einstellungen“ schaltbar. Optional eine Liste erlaubter E-Mail-Domains und/oder neue Konten erst
nach Freigabe durch die Verwaltung aktivieren.

## 2. Unbegrenzte Anfragen blockieren den gesamten Bestand — **Medium**

**Dateien:** `backend/src/validators/request.ts:3-13`,
`backend/src/services/requestService.ts:63-119`, `backend/src/services/searchService.ts:34-43`

**Beschreibung:** Offene Anfragen (`OPEN`) blockieren ein Stück genauso wie bestätigte: Suche und
Überschneidungsprüfung zählen beide Status. Für neue Anfragen gibt es keine Grenzen:

- keine Höchstzahl offener Anfragen pro Person,
- keine Höchstdauer (`desiredUntil` darf z. B. `9999-12-31T23:59` sein),
- keine Prüfung, dass `startsAt` in der Zukunft liegt (nur das Ende muss in der Zukunft liegen),
- kein Rate Limit auf `POST /api/requests`,
- Nutzer können eigene Anfragen nicht zurückziehen; nur die Verwaltung kann ablehnen.

**Angriffsszenario:** Ein Nutzer, zusammen mit Finding 1 auch ein Fremder, fragt per Skript jedes
Stück für den Zeitraum „jetzt bis 9999“ an. Danach findet niemand mehr ein freies Gerät, bis die
Verwaltung jede Anfrage einzeln ablehnt. Jede Ablehnung verschickt außerdem eine E-Mail an die
(eventuell fremde) Adresse des Kontos.

**Empfohlener Fix:** Höchstdauer (z. B. einstellbar, Standard 30 Tage) und Mindest-Start
(`startsAt ≥ jetzt − kleine Toleranz`) serverseitig prüfen. Höchstzahl offener Anfragen pro Person
(z. B. 10). Rate Limit auf das Anlegen. Nutzern das Zurückziehen eigener offener Anfragen erlauben.
Für die Verwaltung eine Sammelaktion „alle offenen Anfragen dieser Person ablehnen“.

## 3. Nutzer können ihr Passwort nicht selbst ändern — **Low**

**Dateien:** `backend/src/routes/auth.ts` (kein Endpunkt), `backend/src/routes/users.ts:27-31`,
`backend/src/services/userAdminService.ts:61-92`

**Beschreibung:** Passwörter lokaler Konten setzt nur die Verwaltung (beim Anlegen oder
Zurücksetzen). Es gibt keinen Endpunkt und keine Seite, auf der ein Nutzer sein Passwort ändert,
und keinen Zwang zur Änderung nach dem ersten Login. Die Verwaltung kennt deshalb dauerhaft die
Passwörter aller Konten, die sie angelegt hat.

**Angriffsszenario:** Ein Admin (oder wer seinen Zugang oder seine Notizen hat) meldet sich als
beliebiger Nutzer an; im Protokoll erscheint das als Anmeldung des Nutzers. Ein Nutzer, der ein
gleiches Passwort anderswo verwendet, kann das nicht beheben. Nach einem Verdacht auf Missbrauch
kann der Nutzer selbst nicht reagieren.

**Empfohlener Fix:** `POST /api/auth/password` mit altem und neuem Passwort (Rate Limit, beendet
alle anderen Sitzungen) und eine Seite „Konto“. Von der Verwaltung gesetzte Passwörter als
vorläufig markieren und beim ersten Login eine Änderung verlangen.

## 4. Antwortzeit verrät Verzeichniskonten (LDAP) — **Low**

**Dateien:** `backend/src/services/ldapService.ts:87-97`, `backend/src/services/authService.ts:220-233`

**Beschreibung:** Der Dummy-Hash aus Audit 1 #9 gleicht nur lokale Konten an. Mit aktivem LDAP gilt:

- Wird der Name im Verzeichnis gefunden und das Passwort ist falsch, antwortet die API direkt nach
  dem LDAP-Bind mit 401, ohne bcrypt (wenige Millisekunden).
- Wird er nicht gefunden, läuft der lokale Pfad mit bcrypt (ca. 300 ms).

**Angriffsszenario:** Ein Angreifer probiert Namen wie `m.mueller` oder `max.mustermann@firma.de`
aus und erkennt an der Antwortzeit, welche Windows-/AD-Konten existieren. Das ist eine gute
Grundlage für Passwort-Spraying gegen andere Dienste der Firma. Das Rate Limit bremst, verhindert
es aber nicht (Audit 2 #5).

**Empfohlener Fix:** Nach einem fehlgeschlagenen LDAP-Bind ebenfalls gegen `DUMMY_HASH` prüfen oder
jede fehlgeschlagene Anmeldung auf eine feste Mindestdauer auffüllen.

## 5. `LDAP_ADMIN_GROUP` als Gruppenname passt auf Gruppen in jeder OU — **Low**

**Dateien:** `backend/src/services/ldapService.ts:31-38`, `README.md` (LDAP-Abschnitt)

**Beschreibung:** Ist `LDAP_ADMIN_GROUP` ein einfacher Name (z. B. `LendLine-Admins`), wird jede
`memberOf`-Gruppe akzeptiert, deren DN mit `cn=LendLine-Admins,` beginnt, egal in welcher OU. Nur
ein vollständiger DN ist eindeutig.

**Angriffsszenario:** In vielen Verzeichnissen dürfen Abteilungs-Admins oder Helpdesk-Konten in
ihrer eigenen OU Gruppen anlegen. Wer eine Gruppe `cn=LendLine-Admins,ou=Vertrieb,…` anlegt und
sich selbst aufnimmt, wird beim nächsten Login LendLine-Admin.

**Empfohlener Fix:** Nur vollständige DNs akzeptieren (Start-Warnung oder Abbruch bei einem
einfachen Namen). Alternativ die gefundene Gruppe per Suche auflösen und ihren DN vergleichen.

## 6. Keine Security-Header und keine CSP für das Frontend — **Low**

**Dateien:** `backend/src/app.ts:25-30` (nur API), `frontend/index.html:11-25`,
`frontend/vite.config.ts`

**Beschreibung:** `X-Frame-Options`, `nosniff` und `Referrer-Policy` setzt nur die API. Für das
Frontend gibt es weder diese Header noch eine Content-Security-Policy. Eine
Produktionsauslieferung ist nicht definiert (Vite ist nur der Entwicklungsserver). Eine
Firmen-Installation wird also mit dem ausgeliefert, was der jeweilige Webserver standardmäßig tut.
Das Access-Token liegt im JavaScript-Speicher; eine XSS-Lücke hätte deshalb volle Wirkung. Aktuell
wurde keine gefunden: React escaped alle Ausgaben, es gibt kein `dangerouslySetInnerHTML` und keine
dynamischen `href`.

**Angriffsszenario:** Eine fremde Seite bettet LendLine unsichtbar in einen Frame ein und bringt
einen angemeldeten Admin per Klick dazu, z. B. „Alle Sitzungen beenden“ oder „Wartungsmodus
einschalten“ auszulösen (Clickjacking). Kommt später eine XSS-Lücke hinzu, fehlt die CSP als
zweite Verteidigungslinie.

**Empfohlener Fix:** Eine Produktionsauslieferung festlegen (z. B. Express liefert `frontend/dist`
mit aus, oder eine dokumentierte Reverse-Proxy-Konfiguration) und dort setzen:
`Content-Security-Policy: default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; object-src 'none'; base-uri 'none'`
mit einem Hash für das Inline-Skript in `index.html`, dazu `X-Frame-Options: DENY`, `nosniff`,
`Referrer-Policy` und in Produktion HSTS.

## 7. „Verwaiste Bilddateien löschen“ kann laufende Uploads löschen — **Low**

**Dateien:** `backend/src/services/systemService.ts:31-49` (`uploadFiles`),
`backend/src/services/systemService.ts:128-134`, `backend/src/middleware/upload.ts:17`,
`backend/src/services/imageService.ts:29-31`

**Beschreibung:** Multer schreibt die Datei, bevor `addImages` die Zeile `DeviceImage` anlegt. Läuft
die Wartungsaufgabe genau in diesem Moment, gilt die Datei als verwaist und wird gelöscht. Die
Datenbank verweist danach auf eine fehlende Datei. Es geht um Integrität, nicht um Vertraulichkeit;
auslösen können es nur Admins.

**Angriffsszenario:** Kein gezielter Angriff; zwei Admins arbeiten gleichzeitig, ein Gerätebild ist
danach dauerhaft kaputt.

**Empfohlener Fix:** Nur Dateien löschen, die älter als z. B. 10 Minuten sind (`mtime`).

## 8. Sitzungen haben keine absolute Höchstdauer — **Info**

**Dateien:** `backend/src/services/authService.ts:41-56`, `backend/src/services/authService.ts:246-268`

**Beschreibung:** Jeder Refresh stellt ein neues Refresh-Token mit vollen
`JWT_REFRESH_TTL_DAYS` (7 Tage) aus. Eine regelmäßig genutzte Sitzung läuft deshalb unbegrenzt,
ohne erneute Passwortabfrage. Das ist üblich, sollte aber bewusst entschieden sein, besonders auf
gemeinsam genutzten Rechnern.

**Empfohlener Fix:** Den Beginn der Sitzung am Token mitführen und nach z. B. 30 Tagen eine neue
Anmeldung verlangen (optional einstellbar).

## 9. Dev-Abhängigkeit `deepmerge-ts` jetzt als High eingestuft — **Low**

**Dateien:** `backend/package.json` (`prisma` → `@prisma/config@6.19.3` → `deepmerge-ts@7.1.5`)

**Beschreibung:** Derselbe Befund wie Audit 2 #8 (GHSA-ggr8-5vv4-36mx, Stack-Überlauf beim Mergen
rekursiver Objekte). `npm audit` meldet ihn inzwischen als **3 × High**, weil die Kette drei Pakete
umfasst. Geprüft: `@prisma/client` hat keine Laufzeitabhängigkeiten, und `deepmerge-ts` kommt im
Client-Runtime-Code nicht vor. Betroffen ist nur das Prisma-CLI (Migrationen), das keine
Angreiferdaten verarbeitet. Die Einstufung bleibt deshalb Low.

Randnotiz: `npm start` nutzt `tsx`, eine Dev-Abhängigkeit. Eine Produktivinstallation braucht also
alle Dev-Abhängigkeiten, und `npm audit --omit=dev` ist dort nicht aussagekräftig.

**Angriffsszenario:** Praktisch keines im Betrieb. Die Warnung „3 high“ kann aber Kunden oder
deren Prüfer verunsichern.

**Empfohlener Fix:** Prisma aktualisieren, sobald eine Version mit `deepmerge-ts ≥ 8` erscheint.
Für den Betrieb einen Build (`npm run build`) mit `node dist/index.js` und
`npm ci --omit=dev` vorsehen.

## Geprüft ohne Befund

- **Zugriffskontrolle:** Alle Routen unter `/api/admin`, `/api/users` und alle schreibenden Routen
  für Geräte, Kategorien, Räume und Anfragen verlangen `requireAdmin`. Nutzer erreichen nur ihre
  eigenen Anfragen (`/requests/mine`); es gibt keinen Endpunkt mit fremder Anfrage-ID für Nutzer.
  Belegungskalender zeigen Namen nur der Verwaltung.
- **Rolle:** kommt bei jeder Anfrage aus der Datenbank (`middleware/auth.ts:39-45`).
- **CSRF:** Alle schreibenden API-Aufrufe brauchen den Bearer-Header. Refresh/Logout sind per
  `SameSite=Lax` und Origin-Prüfung geschützt (im Betrieb bestätigt).
- **Injection:** keine Raw-SQL-Abfragen mit Eingaben (`$queryRaw` nur `SELECT 1`), LDAP-Filter
  werden escaped (`ldapService.ts:13-18`), E-Mail-HTML wird escaped (`emails/format.ts:21-27`).
- **Uploads:** Serverseitig erzeugte UUID-Dateinamen, Endungs-Whitelist, 1 MB (Logo) bzw. 5 MB
  (Gerätebild), `sandbox`-CSP und `nosniff` unter `/api/uploads`, im Betrieb bestätigt. Ersetzte
  Logos werden gelöscht; eine falsche Variante wird vor dem Schreiben abgewiesen.
- **Branding:** Die Akzentfarbe wird serverseitig auf `#rrggbb` geprüft, bevor sie als CSS
  eingesetzt wird; eine CSS-Injection ist nicht möglich. `/api/branding` gibt nur Farbe und
  Logo-URLs preis.
- **Wartungsmodus:** Die öffentliche Antwort nennt nicht, wer ihn eingeschaltet hat. Hinweistext
  und Zeitpunkt werden validiert und in React escaped ausgegeben.
- **Passwörter:** bcrypt mit Kosten 12, 72-Byte-Grenze, konstante Antwortzeit für lokale Konten
  (im Betrieb bestätigt).
- **Frontend:** keine HTML-Senken, keine dynamischen Links, kein `postMessage`. `localStorage` hält
  nur Theme und Branding, keine Tokens.

## Empfohlene Reihenfolge

1. **Vor dem ersten Kunden:** Finding 1 (Registrierung abschaltbar, Standard aus) und Finding 2
   (Grenzen für Anfragen). Beide sind klein und schließen die Angriffsfläche „Fremder aus dem
   Internet“.
2. **Mit der Produktionsauslieferung:** Finding 6 (Header/CSP), Finding 9 (Build statt `tsx`),
   `NODE_ENV=production` verpflichtend machen (Rest von Audit 2 #1).
3. **Danach:** Finding 3 (Passwort selbst ändern), Audit 2 #2 (`sessionVersion`), bei
   LDAP-Kunden Findings 4 und 5 sowie Audit 2 #3 und #4.
4. **Bei Gelegenheit:** Findings 7 und 8, Audit 2 #6 und #7.
