# Security-Audit 1 – LendLine

Stand: 2026-09-24, Commit `13e596f`. Geprüft: `backend/src/**`, `backend/prisma/seed.ts`,
`docker-compose.yml`, `backend/.env.example`, Frontend-Quellcode (`frontend/src/**`, `index.html`,
`vite.config.ts`) sowie die Abhängigkeiten per `npm audit`.

Nicht gefunden (geprüft, ohne Befund): SQL-Injection (nur Prisma-Query-API, einziges Raw-Query ist
das statische `SELECT 1`), Command Injection (keine `child_process`-Nutzung), Path Traversal
(Dateinamen werden serverseitig als UUID erzeugt, Pfade stammen nie aus Nutzereingaben), unsichere
Deserialisierung (nur `JSON.parse`/Zod), XSS im Frontend (kein `dangerouslySetInnerHTML`, React
escaped; SVG-Uploads werden mit `CSP sandbox` + `nosniff` ausgeliefert), HTML-Injection in E-Mails
(alle Werte laufen durch `escapeHtml`), LDAP-Filter-Injection (`escapeFilter` escaped `\ * ( ) NUL`),
Secrets im Repository (`backend/.env` ist nicht eingecheckt, `.env.example` enthält nur Platzhalter).

| #   | Titel                                                                                         | Schweregrad |
| --- | --------------------------------------------------------------------------------------------- | ----------- |
| 1   | Kein Brute-Force-Schutz / Rate Limit auf Anmeldung und Registrierung                          | High        |
| 2   | Kontoübernahme bei LDAP-Anmeldung über gleiche E-Mail-Adresse                                 | High        |
| 3   | Verwundbare Abhängigkeit `nodemailer` ≤ 9.1.0                                                 | Medium      |
| 4   | Berechtigung nur aus JWT-Claims – gelöschte/herabgestufte/abgemeldete Nutzer behalten Zugriff | Medium      |
| 5   | Schwache bzw. Platzhalter-JWT-Secrets werden akzeptiert, Algorithmus nicht festgelegt         | Medium      |
| 6   | Seed legt Admin-Konto mit bekanntem Passwort in jeder Umgebung an                             | Medium      |
| 7   | PostgreSQL mit Standard-Zugangsdaten auf allen Netzwerk-Interfaces                            | Medium      |
| 8   | Passwort-Reset durch Admin beendet bestehende Sitzungen nicht                                 | Medium      |
| 9   | Benutzer-Enumeration über Antwortzeit des Logins                                              | Low         |
| 10  | Refresh-Token-Rotation nicht atomar                                                           | Low         |
| 11  | Race Condition bei der „letzter Administrator“-Prüfung                                        | Low         |
| 12  | Fehlende Security-Header, `X-Powered-By` verrät Framework                                     | Low         |
| 13  | Fehlerhafte JSON-Bodies erzeugen 500 und Stacktrace im Log                                    | Low         |
| 14  | Keine Längenbegrenzung des Login-Passworts, bcrypt-Kürzung auf 72 Byte                        | Low         |
| 15  | Refresh/Logout ohne Origin-Prüfung (CSRF nur über SameSite=Lax abgesichert)                   | Low         |
| 16  | Verwundbare Dev-Abhängigkeit `deepmerge-ts` über Prisma-CLI                                   | Low         |
| 17  | Upload-Inhalt wird nicht geprüft (nur Endung + MIME-Typ des Clients)                          | Low         |
| 18  | E-Mail-Adresse bei Registrierung wird nicht verifiziert                                       | Low         |

---

## 1. Kein Brute-Force-Schutz / Rate Limit auf Anmeldung und Registrierung — **High**

**Dateien:** `backend/src/routes/auth.ts:46-64`, `backend/src/services/authService.ts:162-201`

**Beschreibung:** `POST /api/auth/login` und `POST /api/auth/register` haben weder Rate Limit noch
Sperre. Jeder Versuch wird nur protokolliert. Bei aktiviertem LDAP wird jeder Versuch zusätzlich an
den Verzeichnisdienst weitergereicht.

**Angriffsszenario:** Ein Angreifer probiert per Skript tausende Passwörter für
`admin@lendline.local` oder für aus dem Audit-/Mailverkehr bekannte Adressen (Credential Stuffing).
Mit LDAP führen die Fehlversuche zusätzlich zur Sperrung der AD-Konten (Lockout-Policy des AD) –
ein Denial of Service gegen echte Mitarbeiterkonten. Registrierung kann massenhaft Konten anlegen
(bcrypt mit 12 Runden pro Anfrage → CPU-DoS).

**Empfohlener Fix:** Rate Limit pro IP und pro (IP + Benutzername) auf Login, pro IP auf
Registrierung; bei Überschreitung HTTP 429 mit `Retry-After`. Erfolgreicher Login setzt den Zähler
für die Kombination zurück.

## 2. Kontoübernahme bei LDAP-Anmeldung über gleiche E-Mail-Adresse — **High**

**Dateien:** `backend/src/services/authService.ts:93-156` (`upsertLdapUser`),
`backend/src/services/authService.ts:54-91` (`register`)

**Beschreibung:** Beim LDAP-Login wird ein vorhandener Benutzer über `ldapDn` **oder** `email`
gesucht und in ein LDAP-Konto umgewandelt. Dabei bleiben alle Refresh-Tokens des bisherigen
(lokalen) Kontos gültig, und die Rolle wird ohne `LDAP_ADMIN_GROUP` vom alten Konto übernommen.
Außerdem wird ein Konto, das bereits zu einem **anderen** DN gehört, einfach auf den neuen DN
umgeschrieben.

**Angriffsszenario (Pre-Account-Takeover):** LDAP ist aktiv, lokale Registrierung erlaubt
(Standard). Der Angreifer registriert sich lokal mit der Adresse eines Kollegen
(`chefin@firma.de`), der sich noch nie angemeldet hat, und behält seine Sitzung. Meldet sich die
Kollegin später per LDAP an, wird genau dieses Konto übernommen; ist sie in der Admin-Gruppe, wird
es `ADMIN`. Der Refresh-Token des Angreifers ist weiterhin gültig und liefert bei `/auth/refresh`
nun Access-Tokens mit ihrer Identität und Admin-Rolle. Zweites Szenario: Zwei Verzeichniseinträge
mit gleicher `mail` – der zweite übernimmt das Konto (inkl. Anfragen und Rolle) des ersten.

**Empfohlener Fix:** Wird ein lokales Konto in ein LDAP-Konto umgewandelt, alle Refresh-Tokens des
Kontos widerrufen. Gehört das per E-Mail gefundene Konto bereits zu einem anderen DN, Anmeldung mit
409 ablehnen.

## 3. Verwundbare Abhängigkeit `nodemailer` ≤ 9.1.0 — **Medium**

**Dateien:** `backend/package.json:39`, `backend/package-lock.json`

**Beschreibung:** `npm audit` meldet 10 Advisories (npm-Einstufung „high“), u. a. SMTP-Command-
Injection (GHSA-c7w3-x93f-qmm8, GHSA-vvjj-xcjg-gr5g), Header-Injection (GHSA-268h-hp4c-crq3),
Umgehung von Domain-Prüfungen (GHSA-cc9r-2j5m-2m83) und quadratische Laufzeit im `addressparser`
(GHSA-2x7j-588g-ccc2). Die App nutzt nur `createTransport` + `sendMail` mit Text/HTML, daher ist
die tatsächliche Ausnutzbarkeit eingeschränkt (→ Medium statt High).

**Angriffsszenario:** Der Empfänger (`to`) stammt aus der vom Nutzer selbst registrierten
E-Mail-Adresse. Eine präparierte Adresse, die die Zod-Prüfung passiert, kann Parser-Fehler in
`addressparser` auslösen (DoS beim Versand, Zustellung an falsche Domain).

**Empfohlener Fix:** Auf `nodemailer@^10.0.10` aktualisieren (API für `createTransport`/`sendMail`
unverändert).

## 4. Berechtigung nur aus JWT-Claims — **Medium**

**Dateien:** `backend/src/middleware/auth.ts:25-39`, `backend/src/lib/tokens.ts:19-29`

**Beschreibung:** `requireAuth` übernimmt `sub` und `role` ungeprüft aus dem Access-Token. Ob der
Benutzer noch existiert oder noch Admin ist, wird nicht geprüft. „Sitzungen beenden“
(`/users/:id/sessions/revoke`, Wartungsaufgabe `end-sessions`) widerruft nur Refresh-Tokens.

**Angriffsszenario:** Einem kompromittierten Admin-Konto wird die Rolle entzogen oder es wird
gelöscht und seine Sitzungen beendet. Der Angreifer arbeitet mit dem vorhandenen Access-Token bis
zu 15 Minuten (bzw. `JWT_ACCESS_TTL`, frei konfigurierbar) weiter als Admin – legt z. B. ein neues
Admin-Konto an und sichert sich so dauerhaften Zugang.

**Empfohlener Fix:** In `requireAuth` den Benutzer per ID laden; fehlt er → 401, sonst die
**aktuelle** Rolle aus der Datenbank verwenden.

## 5. Schwache bzw. Platzhalter-JWT-Secrets, Algorithmus nicht festgelegt — **Medium**

**Dateien:** `backend/src/config.ts:36-37`, `backend/.env.example:2-3`,
`backend/src/lib/tokens.ts:14,20`

**Beschreibung:** Jeder nicht-leere Wert wird als `JWT_ACCESS_SECRET` akzeptiert, auch der
Platzhalter `change-me-access-secret` aus `.env.example` (README: „.env.example kopieren“).
`jwt.verify` legt die erlaubten Algorithmen nicht fest.

**Angriffsszenario:** Eine Installation wird mit kopierter `.env.example` betrieben. Der Angreifer
kennt das Secret aus dem öffentlichen Repository und signiert ein Token
`{ sub: "<beliebig>", role: "ADMIN" }` → voller Admin-Zugriff ohne Anmeldung. (In Kombination mit
Finding 4 muss `sub` nicht einmal existieren.)

**Empfohlener Fix:** Beim Start Secrets mit weniger als 32 Zeichen oder mit `change-me`-Präfix
ablehnen (in Produktion Abbruch, in Entwicklung Warnung). `algorithms: ["HS256"]` bei Signatur und
Prüfung festlegen.

## 6. Seed legt Admin-Konto mit bekanntem Passwort an — **Medium**

**Dateien:** `backend/prisma/seed.ts:7-30`

**Beschreibung:** `npm run prisma:seed` (und `db:setup`, sowie `prisma migrate reset`) legt
`admin@lendline.local` / `Admin123!` an – unabhängig von `NODE_ENV`.

**Angriffsszenario:** Der Betreiber führt bei der Produktionseinrichtung den im README
beschriebenen Seed aus. Jeder, der das README kennt, meldet sich als Admin an.

**Empfohlener Fix:** Seed in Produktion (`NODE_ENV=production`) verweigern.

## 7. PostgreSQL mit Standard-Zugangsdaten auf allen Interfaces — **Medium**

**Dateien:** `docker-compose.yml:5-9`

**Beschreibung:** `ports: "5432:5432"` bindet an `0.0.0.0`; Benutzer/Passwort sind `lendline`.
Docker umgeht dabei zudem häufig die Host-Firewall.

**Angriffsszenario:** Ein Gerät im selben Netz (z. B. Firmen-WLAN) verbindet sich mit
`psql -h <host> -U lendline` und liest/ändert alle Daten, setzt z. B. `role = 'ADMIN'` für ein
eigenes Konto oder liest Passwort-Hashes.

**Empfohlener Fix:** Port nur an `127.0.0.1` binden. Passwort über Umgebungsvariable
überschreibbar machen.

## 8. Passwort-Reset durch Admin beendet bestehende Sitzungen nicht — **Medium**

**Dateien:** `backend/src/services/userAdminService.ts:61-81`

**Beschreibung:** Setzt ein Admin ein neues Passwort (typisch nach Kompromittierung), bleiben alle
Refresh-Tokens des Kontos gültig. Dasselbe gilt für eine Rollenänderung.

**Angriffsszenario:** Ein Angreifer hat das Passwort eines Nutzers erraten und eine Sitzung. Der
Admin setzt das Passwort zurück – der Angreifer bleibt bis zu 7 Tage (bzw. unbegrenzt durch
Rotation) angemeldet.

**Empfohlener Fix:** Bei Passwortänderung alle Refresh-Tokens des Kontos widerrufen.

## 9. Benutzer-Enumeration über Antwortzeit des Logins — **Low**

**Dateien:** `backend/src/services/authService.ts:214-221`

**Beschreibung:** Existiert die E-Mail nicht (oder ist es ein LDAP-Konto), antwortet der Server
sofort; sonst erst nach dem bcrypt-Vergleich (~250 ms).

**Angriffsszenario:** Ein Angreifer misst Antwortzeiten und erhält so eine Liste gültiger
Konten als Grundlage für gezieltes Passwort-Raten (Finding 1) oder Phishing.

**Empfohlener Fix:** Bei fehlendem Konto gegen einen Dummy-Hash vergleichen, damit die Laufzeit
gleich ist. (Die 409 bei der Registrierung bleibt als bewusst hingenommene UX-Abwägung bestehen.)

## 10. Refresh-Token-Rotation nicht atomar — **Low**

**Dateien:** `backend/src/services/authService.ts:238-251`

**Beschreibung:** Das Token wird gelesen, geprüft und dann per `update` ohne Bedingung widerrufen.
Zwei gleichzeitige Aufrufe mit demselben Token erhalten beide ein neues Token-Paar. Eine
Wiederverwendung bereits rotierter Tokens wird nicht erkannt.

**Angriffsszenario:** Ein gestohlenes Refresh-Token, das der Angreifer zeitgleich mit dem Opfer
einsetzt, erzeugt eine zweite, unabhängige Sitzungskette, die der Nutzer beim Abmelden nicht
beendet.

**Empfohlener Fix:** Widerruf atomar per `updateMany({ where: { id, revokedAt: null } })` und nur
bei `count === 1` neue Tokens ausgeben.

## 11. Race Condition bei der „letzter Administrator“-Prüfung — **Low**

**Dateien:** `backend/src/services/userAdminService.ts:66-81`, `111-122`, `137-142`

**Beschreibung:** Anzahl der Admins wird gezählt und danach in einer separaten Abfrage geändert.

**Angriffsszenario:** Zwei Admins entziehen sich gleichzeitig gegenseitig die Rolle (oder löschen
sich) – beide Prüfungen sehen 2 Admins, danach gibt es keinen Admin mehr. Die Instanz ist nicht
mehr verwaltbar (Wiederherstellung nur per Datenbankzugriff).

**Empfohlener Fix:** Prüfung und Änderung in einer `Serializable`-Transaktion.

## 12. Fehlende Security-Header, `X-Powered-By` — **Low**

**Dateien:** `backend/src/app.ts:19-27`

**Beschreibung:** Die API setzt außer unter `/api/uploads` keine Security-Header
(`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`); Express sendet
`X-Powered-By: Express`.

**Angriffsszenario:** Fingerprinting der Serversoftware; JSON-Antworten könnten in alten Browsern
per MIME-Sniffing als HTML interpretiert werden.

**Empfohlener Fix:** `app.disable("x-powered-by")` und Basis-Header global setzen.

## 13. Fehlerhafte JSON-Bodies erzeugen 500 und Stacktrace im Log — **Low**

**Dateien:** `backend/src/middleware/errorHandler.ts:7-23`

**Beschreibung:** Fehler von `express.json()` (ungültiges JSON, Body > 100 kB) sind keine
`HttpError` und werden als 500 „Interner Serverfehler“ beantwortet und mit Stacktrace geloggt.
Der Client sieht keinen Stacktrace (kein Info-Leak), aber das Log lässt sich fluten und
Monitoring meldet Serverfehler.

**Angriffsszenario:** Ein Angreifer sendet massenhaft kaputtes JSON und füllt damit das Log mit
Stacktraces, echte Fehler gehen darin unter.

**Empfohlener Fix:** Body-Parser-Fehler (`type` beginnt mit `entity.`/ `status` 4xx) mit deren
Status und einer allgemeinen Meldung beantworten, ohne Stacktrace zu loggen.

## 14. Keine Längenbegrenzung des Login-Passworts, bcrypt-Kürzung — **Low**

**Dateien:** `backend/src/validators/auth.ts:11`, `backend/src/lib/password.ts`

**Beschreibung:** Das Login-Passwort ist unbegrenzt (bis 100 kB Body). bcrypt verwendet nur die
ersten 72 Byte, Passwörter bis 200 Zeichen werden bei der Registrierung aber akzeptiert.

**Angriffsszenario:** Nutzer mit langen Passphrasen (> 72 Byte) haben faktisch ein kürzeres
Passwort als gedacht; zwei Passwörter mit gleichem 72-Byte-Anfang sind gleichwertig.

**Empfohlener Fix:** Passwörter (Login, Registrierung, Admin-Formular) auf 72 Byte UTF-8
begrenzen.

## 15. Refresh/Logout ohne Origin-Prüfung — **Low**

**Dateien:** `backend/src/routes/auth.ts:66-82`

**Beschreibung:** Die Cookie-basierten Endpunkte `/auth/refresh` und `/auth/logout` sind nur durch
`SameSite=Lax` gegen CSRF geschützt. Same-Site-Angreifer (andere Subdomain derselben Domain) oder
Browser ohne SameSite-Unterstützung werden nicht abgewehrt.

**Angriffsszenario:** Eine Seite auf `evil.firma.de` sendet `POST /api/auth/logout` → Login-CSRF /
Zwangsabmeldung aller Besucher. Das Access-Token selbst kann wegen CORS nicht gelesen werden.

**Empfohlener Fix:** Bei diesen Endpunkten einen vorhandenen `Origin`-Header gegen
`FRONTEND_ORIGIN` prüfen und bei Abweichung 403 antworten.

## 16. Verwundbare Dev-Abhängigkeit `deepmerge-ts` — **Low**

**Dateien:** `backend/package.json:57` (`prisma`)

**Beschreibung:** `prisma` → `@prisma/config` → `deepmerge-ts < 8.0.0` (GHSA-ggr8-5vv4-36mx, Stack
Exhaustion). Betrifft nur das Prisma-CLI (Migration/Generate), nicht die laufende API; die
verarbeiteten Daten (eigene Konfiguration) sind nicht angreiferkontrolliert.

**Angriffsszenario:** Praktisch keines im Betrieb.

**Empfohlener Fix:** Prisma aktualisieren, sobald eine Version mit `deepmerge-ts ≥ 8` erscheint.

## 17. Upload-Inhalt wird nicht geprüft — **Low**

**Dateien:** `backend/src/middleware/upload.ts:25-57`

**Beschreibung:** Nur Dateiendung und der vom Client gesendete MIME-Typ werden geprüft, nicht der
Inhalt (Magic Bytes). Durch `nosniff` und die `sandbox`-CSP unter `/api/uploads` (`app.ts:29-42`)
kann eine getarnte HTML-/Script-Datei jedoch nicht ausgeführt werden. Uploads sind Admins
vorbehalten.

**Angriffsszenario:** Ein Admin lädt (versehentlich) eine beliebige Datei als `.png` hoch, die dann
öffentlich abrufbar ist (Ablage fremder Inhalte).

**Empfohlener Fix:** Optional Magic-Byte-Prüfung. Wird wegen geringem Risiko nicht umgesetzt.

## 18. E-Mail-Adresse bei Registrierung wird nicht verifiziert — **Low**

**Dateien:** `backend/src/services/authService.ts:54-91`

**Beschreibung:** Jeder kann sich mit einer beliebigen (fremden) Adresse registrieren; der
Adressinhaber erhält später Benachrichtigungen. In Verbindung mit LDAP siehe Finding 2.

**Angriffsszenario:** Belästigung durch Benachrichtigungen an fremde Adressen; Identitätsvortäuschung
gegenüber der Verwaltung („Max Mustermann“ bestellt Geräte).

**Empfohlener Fix:** E-Mail-Bestätigung per Link bei der Registrierung bzw. Registrierung auf
Firmen-Domains begrenzen. (Größeres Feature, siehe Fix-Report.)
