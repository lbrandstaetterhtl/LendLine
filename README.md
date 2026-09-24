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

Die Anmeldung akzeptiert dann E-Mail, `sAMAccountName` oder `uid`. Ein Treffer wird lokal angelegt (`authSource=LDAP`). Die Rolle kommt aus `LDAP_ADMIN_GROUP` (`memberOf`), sofern gesetzt. Lokale Demo-Konten bleiben gültig, wenn der Benutzer im Verzeichnis nicht gefunden wird. `LDAP_ALLOW_LOCAL_REGISTER=false` schaltet die Selbstregistrierung ab.

## Demo-Konten

| Rolle      | E-Mail               | Passwort   |
| ---------- | -------------------- | ---------- |
| Verwaltung | admin@lendline.local | Admin123!  |
| Nutzer     | user@lendline.local  | User12345! |

## E-Mail

SMTP-Werte stehen in `backend/.env`. Ohne `SMTP_HOST` werden Nachrichten nur in der API-Konsole ausgegeben. Der Ausleihvorgang bricht dadurch nicht ab.

Vorlagen liegen in `backend/src/emails/templates/`.

## Fachregeln

- Anfragen nur für verfügbare Geräte ohne andere offene oder bestätigte Anfrage.
- Bestätigen setzt das Gerät auf ausgeliehen und lehnt übrige offene Anfragen für dasselbe Gerät ab.
- Rückgabe setzt ein ausgeliehenes Gerät wieder auf verfügbar. Ein als defekt markiertes Gerät bleibt defekt.
- `BORROWED` kann nicht manuell gesetzt werden.
