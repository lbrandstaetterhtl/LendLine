# LendLine

Interne Verwaltung für IT-Geräteausleihen. Nutzer stellen Anfragen, die Verwaltung bestätigt oder lehnt ab und erfasst Rückgaben. Statusänderungen lösen E-Mails aus.

## Voraussetzungen

- Node.js 20 oder neuer
- Docker (für PostgreSQL) oder eine eigene PostgreSQL-16-Datenbank

## Einrichtung

```bash
docker compose up -d
cd backend
copy .env.example .env
npm install
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

Vor dem ersten Start in `backend/.env` den Wert `JWT_ACCESS_SECRET` durch einen zufälligen Wert
ersetzen, mit dem Platzhalter startet die API nicht:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

In einem zweiten Terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173  
API: http://localhost:3001

## LDAP

LDAP ist aus, solange `LDAP_URL` leer ist. Zum Aktivieren in `backend/.env`:

```
LDAP_URL=ldaps://ldap.example.edu
LDAP_BIND_DN=cn=lendline,ou=service,dc=example,dc=edu
LDAP_BIND_PASSWORD=geheim
LDAP_BASE_DN=ou=people,dc=example,dc=edu
LDAP_ADMIN_GROUP=CN=LendLine-Admins,OU=Groups,DC=example,DC=edu
```

Die Anmeldung akzeptiert dann E-Mail, `sAMAccountName` oder `uid`. Ein Treffer wird lokal angelegt (`authSource=LDAP`). Die Gruppe kommt aus den Verzeichnisgruppen, die bei einer LendLine-Gruppe eingetragen sind, sonst führt `LDAP_ADMIN_GROUP` in die Gruppe „Verwaltung“. `LDAP_ADMIN_GROUP` muss vollständige DNs enthalten, mehrere werden mit `;` getrennt; ein bloßer Gruppenname verhindert den Start. In Produktion (`NODE_ENV=production`) startet die API nur mit `ldaps://` und geprüftem Zertifikat, außer mit `LDAP_ALLOW_INSECURE=true`. Lokale Demo-Konten bleiben gültig, wenn der Benutzer im Verzeichnis nicht gefunden wird. `LDAP_ALLOW_LOCAL_REGISTER=false` schaltet die Selbstregistrierung ab.

## Anpassen

Alles Firmenspezifische stellt die Verwaltung in der Oberfläche ein, ohne Neustart:

- **Modus:** Einfach, Mittel, Voll oder eigene Auswahl – wie viel der Verwaltung überhaupt angezeigt wird. Ausgeblendete Bereiche behalten ihre Einstellungen.

- **Erscheinungsbild:** Logo (hell/dunkel), Akzentfarbe, Schrift, Schriftgröße, Ecken, Seitenleiste, Browser-Symbol, eigene Begriffe (z. B. „Ausrüstung“ statt „Gerät“), Überschrift, Text und Bild der Anmeldeseite.
- **Einstellungen:** Selbstregistrierung (standardmäßig **aus**, optional nur für bestimmte E-Mail-Domains), Höchstdauer einer Ausleihe, offene Anfragen pro Person, automatische Bestätigung, Anfrageformular (Raum und Kommentar Pflicht/optional/ausgeblendet, bis zu 10 eigene Felder).
- **Geräte:** freie Eigenschaften pro Gerät (z. B. „RAM: 16 GB“, „Anschlüsse: HDMI, USB-C“). Nutzer sehen sie im Katalog und in der Suche und können danach filtern.
- **E-Mails:** Absendername, Logo, Anrede, Signatur, Fußzeile und ein eigener Text je Nachricht, mit Vorschau.
- **Sprachen:** Deutsch, Englisch, Spanisch, Chinesisch (vereinfacht) und Hindi. Jede Person wählt ihre Sprache in der Seitenleiste, auf der Anmeldeseite oder unter „Mein Konto“; E-Mails gehen in der Sprache der empfangenden Person hinaus. Standardtexte und -begriffe erscheinen übersetzt, eigene Texte der Firma so, wie sie eingegeben wurden.

Konten legt die Verwaltung unter „Benutzer“ an. Jede Person gehört zu genau einer **Gruppe**; unter „Benutzer → Gruppen und Rechte“ legt die Verwaltung Gruppen an und stellt pro Gruppe ein, was sie darf (23 einzelne Rechte), aus welchen Kategorien sie ausleiht, welche Kategorien sie verwaltet und welche Ausleihregeln für sie gelten. Vorhanden sind „Verwaltung“ (alle Rechte) und „Nutzer“ (Katalog und Anfragen). Das dabei vergebene Passwort ist vorläufig: Bei der ersten Anmeldung muss die Person ein eigenes festlegen. Unter „Mein Konto“ kann jede Person ihr Passwort selbst ändern.

## Demo-Konten

| Rolle      | E-Mail               | Passwort   |
| ---------- | -------------------- | ---------- |
| Verwaltung | admin@lendline.local | Admin123!  |
| Nutzer     | user@lendline.local  | User12345! |

Der Demo-Seed läuft nur, solange `FRONTEND_ORIGIN` auf `localhost` zeigt (für eine Test-Installation: `ALLOW_DEMO_SEED=true`).

## E-Mail

SMTP-Werte stehen in `backend/.env`. Ohne `SMTP_HOST` werden Nachrichten nur in der API-Konsole ausgegeben. Der Ausleihvorgang bricht dadurch nicht ab.

Vorlagen liegen in `backend/src/emails/templates/`.

## Fachregeln

- Anfragen nur für verfügbare Geräte ohne andere offene oder bestätigte Anfrage.
- Bestätigen setzt das Gerät auf ausgeliehen und lehnt übrige offene Anfragen für dasselbe Gerät ab.
- Rückgabe setzt ein ausgeliehenes Gerät wieder auf verfügbar. Ein als defekt markiertes Gerät bleibt defekt.
- `BORROWED` kann nicht manuell gesetzt werden.
