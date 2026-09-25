# LendLine

Internal IT equipment lending. Users request devices for a period, the administration approves or rejects the requests and records returns. Status changes trigger e-mails.

Project documentation: [`doc/LendLine.md`](doc/LendLine.md).

## Requirements

- Node.js 20 or newer
- Docker (for PostgreSQL) or an own PostgreSQL 16 database

## Setup

```bash
docker compose up -d
cd backend
copy .env.example .env
npm install
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

Before the first start, replace `JWT_ACCESS_SECRET` in `backend/.env` with a random value; the API does not start with the placeholder:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173  
API: http://localhost:3001

### Starting everything at once

After the first setup, one command starts the database, the API and the frontend:

```bash
npm run dev
```

It uses the database from `DATABASE_URL` if it is reachable; otherwise it starts the Docker container (`docker compose up -d`) or, on Windows without Docker, the local PostgreSQL service. It installs missing dependencies, applies pending migrations (never resets data) and runs API and frontend with prefixed output. Ctrl+C stops both. If port 3001 is already in use, it does not start a second API.

## LDAP

LDAP is off as long as `LDAP_URL` is empty. To turn it on, in `backend/.env`:

```
LDAP_URL=ldaps://ldap.example.edu
LDAP_BIND_DN=cn=lendline,ou=service,dc=example,dc=edu
LDAP_BIND_PASSWORD=secret
LDAP_BASE_DN=ou=people,dc=example,dc=edu
LDAP_ADMIN_GROUP=CN=LendLine-Admins,OU=Groups,DC=example,DC=edu
```

Sign-in then accepts the e-mail address, `sAMAccountName` or `uid`. A match is created locally (`authSource=LDAP`). The group comes from the directory groups entered for a LendLine group; otherwise `LDAP_ADMIN_GROUP` leads into the group "Verwaltung". `LDAP_ADMIN_GROUP` must contain full DNs, several separated by `;`; a bare group name stops the start. In production (`NODE_ENV=production`) the API only starts with `ldaps://` and a verified certificate, unless `LDAP_ALLOW_INSECURE=true`. Local demo accounts stay valid when the user is not found in the directory. `LDAP_ALLOW_LOCAL_REGISTER=false` turns self-registration off.

## Customizing

The administration sets everything company-specific in the interface, without a restart:

- **Mode:** simple, medium, full or a custom selection – how much of the administration is shown at all. Hidden areas keep their settings.
- **Appearance:** logo (light/dark), accent colour, font, font size, corners, sidebar, browser icon, own terms (e.g. "Equipment" instead of "Device"), heading, text and picture of the sign-in page.
- **Settings:** self-registration (**off** by default, optionally only for certain e-mail domains), maximum loan duration, open requests per person, automatic approval, request form (room and comment required/optional/hidden, up to 10 own fields).
- **Devices:** free properties per device (e.g. "RAM: 16 GB", "Ports: HDMI, USB-C"). Users see them in the catalogue and the search and can filter by them.
- **E-mails:** sender name, logo, greeting, signature, footer and an own text per message, with a preview.
- **Languages:** German, English, Spanish, Chinese (simplified) and Hindi. Everyone picks their language in the sidebar, on the sign-in page or under "My account"; e-mails go out in the recipient's language. Default texts and terms appear translated, the company's own texts as entered.

The administration creates accounts under "Users". Every person belongs to exactly one **group**; under "Users → Groups and permissions" the administration creates groups and sets per group what it may do (23 single permissions), which categories it borrows from, which categories it manages and which loan rules apply. Built in are "Verwaltung" (all permissions) and "Nutzer" (catalogue and requests). A password set there is temporary: at the first sign-in the person must choose their own. Everyone can change their password under "My account".

## Demo accounts

| Role           | E-mail               | Password   |
| -------------- | -------------------- | ---------- |
| Administration | admin@lendline.local | Admin123!  |
| User           | user@lendline.local  | User12345! |

The demo seed only runs while `FRONTEND_ORIGIN` points to `localhost` (for a test installation: `ALLOW_DEMO_SEED=true`).

## E-mail

SMTP values are in `backend/.env`. Without `SMTP_HOST`, messages are only printed to the API console; lending carries on regardless.

Templates are in `backend/src/emails/templates.ts`.

## Logs

Server logs and startup errors are in English. The activity log page shows entries in the reader's language.

## Business rules

- A request is for one piece (unit) of a device and a period. Pieces that are defective, or already requested or approved for an overlapping period, cannot be requested.
- Approving reserves the piece for the period and checks for overlaps again.
- Recording the return ends the loan and frees the piece. A piece marked defective stays defective.
- A piece's "borrowed" status follows from the approved loans; it cannot be set by hand.
