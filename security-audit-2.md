# Security-Audit 2 – LendLine (Verifikation)

Stand: 2026-09-24, Arbeitsstand nach den Fixes aus `fix-report.md` (noch nicht committet).
Gleiche Kriterien und Methode wie `security-audit-1.md`. Zusätzlich wurde jede geänderte Zeile
darauf geprüft, ob sie neue Probleme einführt.

**Werkzeuge:**

- Backend: `npm run typecheck`, `npm run lint:types` und `npm run knip` sind grün.
- `oxfmt --check` meldet nur Dateien, die mit CRLF ausgecheckt sind (`core.autocrlf=true`).
  Das ist unabhängig von den Fixes; ein unveränderter Checkout zeigt denselben Befund für
  46 Dateien.
- `npm audit`: Backend nur noch `deepmerge-ts` (Dev), Frontend und Root 0 Schwachstellen.

**Smoke-Test** der API (ohne Datenbank):

- `X-Powered-By` fehlt, `X-Frame-Options: DENY` und `nosniff` werden gesetzt.
- Kaputtes JSON → 400.
- Login: 11. Versuch → 429.
- Logout mit fremdem `Origin` → 403, mit Frontend-Origin → 204.
- 80-Byte-Passwort → 400.
- Platzhalter-Secret: Abbruch bei `NODE_ENV=production`, sonst Warnung.

## Verifikation der Findings aus Audit 1

| # (Audit 1) | Finding                          | Ergebnis                                                           |
| ----------- | -------------------------------- | ------------------------------------------------------------------ |
| 1           | Rate Limit Login/Registrierung   | Behoben (per Smoke-Test bestätigt); Restpunkte → neues Finding 5   |
| 2           | LDAP-Kontoübernahme              | Pre-Account-Takeover behoben; Rest → Finding 3                     |
| 3           | `nodemailer` verwundbar          | Behoben (10.0.10, `npm audit` sauber)                              |
| 4           | Rolle nur aus JWT                | Rolle/Existenz behoben; Rest → Finding 2                           |
| 5           | Schwache JWT-Secrets             | Behoben für Produktion; Lücke bei fehlendem `NODE_ENV` → Finding 1 |
| 6           | Seed mit bekanntem Passwort      | Behoben für Produktion; gleiche `NODE_ENV`-Lücke → Finding 1       |
| 7           | PostgreSQL öffentlich            | Behoben                                                            |
| 8           | Passwort-Reset ohne Sitzungsende | Behoben (Refresh-Tokens); Access-Token → Finding 2                 |
| 9           | Timing-Enumeration               | Behoben (Dummy-Hash mit Kosten 12, gemessen ~290 ms)               |
| 10          | Rotation nicht atomar            | Behoben; Nebenwirkung → Finding 6                                  |
| 11          | Race „letzter Admin“             | Behoben (Serializable-Transaktion)                                 |
| 12          | Security-Header                  | Behoben (per Smoke-Test bestätigt)                                 |
| 13          | JSON-Fehler → 500                | Behoben (per Smoke-Test bestätigt)                                 |
| 14          | Passwortlänge                    | Behoben (per Smoke-Test bestätigt)                                 |
| 15          | Origin-Prüfung                   | Behoben (per Smoke-Test bestätigt)                                 |
| 16          | `deepmerge-ts`                   | Offen (Won't Fix) → Finding 8                                      |
| 17          | Upload-Inhalt                    | Offen (Won't Fix) → Finding 9                                      |
| 18          | E-Mail-Verifikation              | Offen (Won't Fix) → Finding 10                                     |

Keine neuen Injection-, XSS-, Path-Traversal- oder Deserialisierungsprobleme durch die Änderungen.

## Aktuelle Findings

| #   | Titel                                                                           | Schweregrad | Status                     |
| --- | ------------------------------------------------------------------------------- | ----------- | -------------------------- |
| 1   | Secret- und Seed-Schutz greifen nur mit `NODE_ENV=production`                   | Medium      | neu (Lücke im Fix #5/#6)   |
| 2   | Access-Token bleibt nach „Sitzungen beenden“/Passwort-Reset bis 15 min gültig   | Low         | Rest aus #4/#8             |
| 3   | Zweiter Verzeichniseintrag mit gleicher `mail` übernimmt Konto                  | Low         | Rest aus #2                |
| 4   | LDAP-Passwörter können unverschlüsselt übertragen werden                        | Low         | neu (bestand schon vorher) |
| 5   | Rate Limit nur im Arbeitsspeicher und pro Prozess                               | Low         | neu (Grenzen des Fix #1)   |
| 6   | Gleichzeitiger Refresh aus zwei Tabs meldet einen Tab ab; keine Reuse-Erkennung | Low         | neu (Nebenwirkung Fix #10) |
| 7   | `JWT_REFRESH_SECRET` ist Pflicht, wird aber nicht verwendet                     | Low         | bestand schon vorher       |
| 8   | Verwundbare Dev-Abhängigkeit `deepmerge-ts`                                     | Low         | unverändert                |
| 9   | Upload-Inhalt wird nicht geprüft                                                | Low         | unverändert                |
| 10  | E-Mail-Adresse bei Registrierung wird nicht verifiziert                         | Low         | unverändert                |

Keine Findings mit Schweregrad Critical oder High mehr.

---

## 1. Secret- und Seed-Schutz greifen nur mit `NODE_ENV=production` — **Medium**

**Dateien:** `backend/src/config.ts:35-42`, `backend/src/config.ts:46`, `backend/prisma/seed.ts:7-11`

**Beschreibung:** Die neue Secret-Prüfung bricht nur ab, wenn `NODE_ENV=production` gesetzt ist.
Auch der Seed verweigert nur dann. `NODE_ENV` ist aber standardmäßig `development`
(`config.ts:46`), und `.env.example` setzt es nicht. Eine Produktivinstallation ohne
`NODE_ENV` startet deshalb mit dem öffentlichen Platzhalter-Secret; es gibt nur eine Warnung in
der Konsole. Zusätzlich fehlt dann das `Secure`-Flag am Refresh-Cookie.

**Angriffsszenario:** Der Betreiber kopiert `.env.example`, trägt Datenbank und SMTP ein und
startet `npm start`. Die Warnung geht im Log unter. Wer das Repository kennt, signiert mit
`change-me-access-secret` ein Token für eine beliebige vorhandene Admin-ID und hat Admin-Zugriff.
Admin-IDs sind nicht öffentlich, daher ist der Angriff schwieriger als vor Fix #4. Ein
Seed-Admin (`admin@lendline.local` / `Admin123!`) ist in derselben Situation direkt nutzbar.

**Empfohlener Fix:** Den bekannten Platzhalter (`change-me…`) **immer** ablehnen, auch in der
Entwicklung, und nur die Mindestlänge an `NODE_ENV` koppeln. `NODE_ENV=production` in
`.env.example`/README für den Betrieb dokumentieren. Der Seed sollte eine ausdrückliche Freigabe
verlangen (z. B. `ALLOW_DEMO_SEED=true`) statt nur `production` auszuschließen.

## 2. Access-Token bleibt nach „Sitzungen beenden“/Passwort-Reset gültig — **Low**

**Dateien:** `backend/src/middleware/auth.ts:28-47`,
`backend/src/services/userAdminService.ts:223-241` (`revokeUserSessions`),
`backend/src/services/systemService.ts:141-148` (`end-sessions`)

**Beschreibung:** `requireAuth` prüft jetzt Existenz und Rolle in der Datenbank. Ein Widerruf der
Sitzungen eines weiterhin existierenden Kontos trifft aber nur Refresh-Tokens. Das bereits
ausgegebene Access-Token funktioniert bis zum Ablauf weiter (`JWT_ACCESS_TTL`, Standard 15 min).

**Angriffsszenario:** Ein Angreifer mit gestohlener Sitzung eines normalen Nutzers kann nach dem
Passwort-Reset durch die Verwaltung noch bis zu 15 Minuten Anfragen im Namen des Opfers stellen.
Admin-Rechte kann er sich nicht verschaffen.

**Empfohlener Fix:** Spalte `sessionVersion` am Benutzer anlegen (Migration). Sie wird bei
Widerruf, Passwort-Reset und Rollenwechsel erhöht und als Claim ins Token geschrieben;
`requireAuth` vergleicht beide Werte.

## 3. Zweiter Verzeichniseintrag mit gleicher `mail` übernimmt Konto — **Low**

**Dateien:** `backend/src/services/authService.ts:97-169` (`upsertLdapUser`)

**Beschreibung:** Das Konto wird weiterhin über `ldapDn` **oder** E-Mail gefunden, und der DN wird
überschrieben. Sitzungen des vorherigen Inhabers werden seit Fix #2 widerrufen. Anfragen-Historie
und (ohne `LDAP_ADMIN_GROUP`) die Rolle gehen aber auf den neuen Verzeichniseintrag über.

**Angriffsszenario:** Im Verzeichnis wird (versehentlich oder durch jemanden mit Schreibrecht auf
`mail`) ein zweiter Eintrag mit der Adresse eines LendLine-Admins angelegt. Meldet sich dieser
Eintrag an, erhält er das Admin-Konto. Voraussetzung ist Schreibzugriff auf das Verzeichnis.

**Empfohlener Fix:** Einen unveränderlichen Verzeichnisschlüssel (`objectGUID` bzw. `entryUUID`)
speichern und darüber zuordnen. Die E-Mail nur für die erstmalige Verknüpfung eines lokalen
Kontos verwenden.

## 4. LDAP-Passwörter können unverschlüsselt übertragen werden — **Low**

**Dateien:** `backend/src/services/ldapService.ts:47-52`, `backend/src/config.ts:67`
(`LDAP_TLS_REJECT_UNAUTHORIZED`), `backend/.env.example`

**Beschreibung:** `LDAP_URL=ldap://…` ist erlaubt, ohne StartTLS. Beim Simple Bind geht das
Passwort des Nutzers dann im Klartext über das Netz. Mit `LDAP_TLS_REJECT_UNAUTHORIZED=false` wird
bei `ldaps://` jedes Zertifikat akzeptiert (Man-in-the-Middle möglich). Beides ist Konfiguration,
es gibt aber keine Warnung.

**Angriffsszenario:** Ein Angreifer im Netz zwischen API-Server und Domain-Controller liest die
Passwörter aller Mitarbeiter mit, die sich bei LendLine anmelden – das sind ihre
Windows-/AD-Passwörter.

**Empfohlener Fix:** Beim Start bei `ldap://` ohne StartTLS und bei deaktivierter
Zertifikatsprüfung eine deutliche Warnung ausgeben (in Produktion: Abbruch, außer ausdrücklich
freigegeben). Optional StartTLS unterstützen.

## 5. Rate Limit nur im Arbeitsspeicher und pro Prozess — **Low**

**Dateien:** `backend/src/lib/rateLimit.ts:9-58`, `backend/src/routes/auth.ts:32-36`

**Beschreibung:**

- Die Zähler gehen bei jedem Neustart verloren.
- Bei mehreren API-Prozessen zählt jeder für sich, das Limit vervielfacht sich.
- Oberhalb von 10 000 aktiven Einträgen durchsucht `prune` die ganze Map bei jedem Versuch (O(n)).
- Die Schlüssel beruhen auf `req.ip`: Ein Reverse Proxy, der nicht auf Loopback läuft oder
  `X-Forwarded-For` ungeprüft durchreicht, führt dazu, dass alle Nutzer als eine IP gezählt werden
  (Selbst-DoS) oder dass Angreifer die IP frei wählen.

**Angriffsszenario:** Ein Angreifer mit vielen IPv6-Adressen umgeht das Per-IP-Limit. Das
Konto-Limit gilt pro IP + Konto, daher bleibt er pro Adresse auf 10 Versuche je 15 Minuten
beschränkt; über viele Adressen summiert sich das. Die Kosten liegen weiterhin bei bcrypt
(ca. 290 ms pro Versuch).

**Empfohlener Fix:** Bei Mehrprozess-Betrieb einen gemeinsamen Speicher verwenden (z. B.
Postgres-Tabelle oder Redis). Zusätzlich ein globales Limit pro Konto unabhängig von der IP mit
progressiver Verzögerung statt harter Sperre. Die Proxy-Anforderungen dokumentieren.

## 6. Gleichzeitiger Refresh aus zwei Tabs; keine Reuse-Erkennung — **Low**

**Dateien:** `backend/src/services/authService.ts:246-268`, `frontend/src/api/client.ts:42-90`

**Beschreibung:** Seit dem atomaren Widerruf erhält von zwei gleichzeitigen Refresh-Anfragen mit
demselben Cookie nur eine neue Tokens. Das Frontend bündelt Refreshes nur innerhalb eines Tabs.
Öffnen zwei Tabs gleichzeitig, erhält einer 401 und zeigt die Anmeldeseite (ein Neuladen hilft,
weil das Cookie inzwischen rotiert ist). Das ist eine Verfügbarkeits-Nebenwirkung, keine Lücke.
Außerdem wird die Wiederverwendung eines rotierten Tokens nicht als Diebstahl erkannt.

**Angriffsszenario:** Kein Angriff; ein gestohlenes, bereits rotiertes Token wird abgelehnt, löst
aber keinen Widerruf der ganzen Kette aus.

**Empfohlener Fix:** Kurze Toleranz (z. B. 10 s) für ein soeben rotiertes Token, für die mehrere
Tabs dasselbe neue Token erhalten. Außerhalb dieses Fensters bei Wiederverwendung alle Tokens des
Nutzers widerrufen und protokollieren.

## 7. `JWT_REFRESH_SECRET` ist Pflicht, wird aber nicht verwendet — **Low**

**Dateien:** `backend/src/config.ts:50`, `backend/.env.example:5`

**Beschreibung:** Refresh-Tokens sind zufällige, gehashte Werte, das Secret wird nirgends genutzt.
Betreiber könnten annehmen, Refresh-Tokens seien signiert, und das Rotieren dieses Secrets für
eine wirksame Maßnahme halten (z. B. nach einem Vorfall). Tatsächlich bleiben dabei alle Sitzungen
gültig.

**Angriffsszenario:** Nach einem Leak wird `JWT_REFRESH_SECRET` getauscht, um alle Sitzungen zu
beenden. Die Sitzungen des Angreifers laufen weiter.

**Empfohlener Fix:** Variable entfernen oder als ungenutzt kennzeichnen. Für „alle abmelden“ auf die
Wartungsaufgabe `end-sessions` verweisen.

## 8. Verwundbare Dev-Abhängigkeit `deepmerge-ts` — **Low**

**Dateien:** `backend/package.json` (`prisma` → `@prisma/config` → `deepmerge-ts < 8.0.0`)

**Beschreibung:** Unverändert zu Audit 1 #16 (GHSA-ggr8-5vv4-36mx). Betrifft nur das Prisma-CLI.

**Angriffsszenario:** Praktisch keines im Betrieb.

**Empfohlener Fix:** Prisma aktualisieren, sobald eine Version mit `deepmerge-ts ≥ 8` erscheint.

## 9. Upload-Inhalt wird nicht geprüft — **Low**

**Dateien:** `backend/src/middleware/upload.ts:25-57`

**Beschreibung:** Unverändert zu Audit 1 #17. Nur Endung und Client-MIME-Typ werden geprüft;
`nosniff` + `sandbox`-CSP verhindern die Ausführung, Uploads sind Admins vorbehalten.

**Angriffsszenario:** Ablage beliebiger Dateien durch einen Admin unter öffentlicher URL.

**Empfohlener Fix:** Optional Magic-Byte-Prüfung.

## 10. E-Mail-Adresse bei Registrierung wird nicht verifiziert — **Low**

**Dateien:** `backend/src/services/authService.ts:58-95`

**Beschreibung:** Unverändert zu Audit 1 #18. Die gefährlichste Folge (LDAP-Übernahme mit
fortbestehender Sitzung) ist behoben.

**Angriffsszenario:** Registrierung unter fremder Adresse; Benachrichtigungen gehen an den
Adressinhaber, und gegenüber der Verwaltung wird eine falsche Identität vorgetäuscht.

**Empfohlener Fix:** Bestätigungslink per E-Mail oder Begrenzung auf Firmen-Domains; bei LDAP
`LDAP_ALLOW_LOCAL_REGISTER=false`.
