# Security audit 1 – LendLine

As of 2026-09-24, commit `13e596f`. Reviewed: `backend/src/**`, `backend/prisma/seed.ts`, `docker-compose.yml`, `backend/.env.example`, the frontend source (`frontend/src/**`, `index.html`, `vite.config.ts`) and the dependencies via `npm audit`.

Not found (checked, no finding): SQL injection (Prisma query API only, the only raw query is the static `SELECT 1`), command injection (no use of `child_process`), path traversal (file names are generated server-side as UUIDs, paths never come from user input), insecure deserialization (only `JSON.parse`/Zod), XSS in the frontend (no `dangerouslySetInnerHTML`, React escapes; SVG uploads are served with `CSP sandbox` + `nosniff`), HTML injection in e-mails (all values go through `escapeHtml`), LDAP filter injection (`escapeFilter` escapes `\ * ( ) NUL`), secrets in the repository (`backend/.env` is not checked in, `.env.example` only contains placeholders).

| #   | Title                                                                             | Severity |
| --- | --------------------------------------------------------------------------------- | -------- |
| 1   | No brute-force protection / rate limit on sign-in and registration                | High     |
| 2   | Account takeover on LDAP sign-in through the same e-mail address                  | High     |
| 3   | Vulnerable dependency `nodemailer` ≤ 9.1.0                                        | Medium   |
| 4   | Authorization from JWT claims only – deleted/demoted/signed-out users keep access | Medium   |
| 5   | Weak or placeholder JWT secrets are accepted, algorithm not fixed                 | Medium   |
| 6   | Seed creates an admin account with a known password in every environment          | Medium   |
| 7   | PostgreSQL with default credentials on all network interfaces                     | Medium   |
| 8   | Password reset by an admin does not end existing sessions                         | Medium   |
| 9   | User enumeration through the login's response time                                | Low      |
| 10  | Refresh token rotation not atomic                                                 | Low      |
| 11  | Race condition in the "last administrator" check                                  | Low      |
| 12  | Missing security headers, `X-Powered-By` reveals the framework                    | Low      |
| 13  | Malformed JSON bodies cause a 500 and a stack trace in the log                    | Low      |
| 14  | No length limit on the login password, bcrypt truncation at 72 bytes              | Low      |
| 15  | Refresh/logout without origin check (CSRF only covered by SameSite=Lax)           | Low      |
| 16  | Vulnerable dev dependency `deepmerge-ts` via the Prisma CLI                       | Low      |
| 17  | Upload content is not checked (only the extension + the client's MIME type)       | Low      |
| 18  | E-mail address not verified on registration                                       | Low      |

---

## 1. No brute-force protection / rate limit on sign-in and registration — **High**

**Files:** `backend/src/routes/auth.ts:46-64`, `backend/src/services/authService.ts:162-201`

**Description:** `POST /api/auth/login` and `POST /api/auth/register` have neither a rate limit nor a lockout. Every attempt is only logged. With LDAP enabled, every attempt is also passed on to the directory service.

**Attack scenario:** An attacker tries thousands of passwords by script for `admin@lendline.local` or for addresses known from the audit log or mail traffic (credential stuffing). With LDAP, the failed attempts also lock the AD accounts (the AD's lockout policy) – a denial of service against real employee accounts. Registration can create accounts in bulk (bcrypt with 12 rounds per request → CPU DoS).

**Recommended fix:** Rate limit per IP and per (IP + user name) on login, per IP on registration; when exceeded, HTTP 429 with `Retry-After`. A successful login resets the counter for the combination.

## 2. Account takeover on LDAP sign-in through the same e-mail address — **High**

**Files:** `backend/src/services/authService.ts:93-156` (`upsertLdapUser`), `backend/src/services/authService.ts:54-91` (`register`)

**Description:** On an LDAP login an existing user is looked up by `ldapDn` **or** `email` and converted into an LDAP account. All refresh tokens of the previous (local) account stay valid, and without `LDAP_ADMIN_GROUP` the role is taken over from the old account. An account that already belongs to **another** DN is simply rewritten to the new DN.

**Attack scenario (pre-account takeover):** LDAP is active, local registration allowed (default). The attacker registers locally with the address of a colleague (`boss@company.com`) who has never signed in, and keeps the session. When the colleague later signs in via LDAP, exactly this account is taken over; if she is in the admin group, it becomes `ADMIN`. The attacker's refresh token stays valid and now yields access tokens with her identity and admin role on `/auth/refresh`. Second scenario: two directory entries with the same `mail` – the second takes over the account (including requests and role) of the first.

**Recommended fix:** When a local account is converted into an LDAP account, revoke all refresh tokens of the account. If the account found by e-mail already belongs to another DN, refuse the sign-in with 409.

## 3. Vulnerable dependency `nodemailer` ≤ 9.1.0 — **Medium**

**Files:** `backend/package.json:39`, `backend/package-lock.json`

**Description:** `npm audit` reports 10 advisories (npm rating "high"), among them SMTP command injection (GHSA-c7w3-x93f-qmm8, GHSA-vvjj-xcjg-gr5g), header injection (GHSA-268h-hp4c-crq3), bypassing domain checks (GHSA-cc9r-2j5m-2m83) and quadratic runtime in the `addressparser` (GHSA-2x7j-588g-ccc2). The app only uses `createTransport` + `sendMail` with text/HTML, so the actual exploitability is limited (→ Medium instead of High).

**Attack scenario:** The recipient (`to`) comes from the e-mail address the user registered. A crafted address that passes the Zod check can trigger parser errors in `addressparser` (DoS when sending, delivery to the wrong domain).

**Recommended fix:** Update to `nodemailer@^10.0.10` (API for `createTransport`/`sendMail` unchanged).

## 4. Authorization from JWT claims only — **Medium**

**Files:** `backend/src/middleware/auth.ts:25-39`, `backend/src/lib/tokens.ts:19-29`

**Description:** `requireAuth` takes `sub` and `role` from the access token without checking them. Whether the user still exists or is still an admin is not checked. "End sessions" (`/users/:id/sessions/revoke`, maintenance task `end-sessions`) only revokes refresh tokens.

**Attack scenario:** A compromised admin account loses its role or is deleted and its sessions are ended. The attacker keeps working as admin with the existing access token for up to 15 minutes (or `JWT_ACCESS_TTL`, freely configurable) – for example creates a new admin account and so secures permanent access.

**Recommended fix:** Load the user by ID in `requireAuth`; if missing → 401, otherwise use the **current** role from the database.

## 5. Weak or placeholder JWT secrets, algorithm not fixed — **Medium**

**Files:** `backend/src/config.ts:36-37`, `backend/.env.example:2-3`, `backend/src/lib/tokens.ts:14,20`

**Description:** Any non-empty value is accepted as `JWT_ACCESS_SECRET`, including the placeholder `change-me-access-secret` from `.env.example` (README: "copy .env.example"). `jwt.verify` does not fix the allowed algorithms.

**Attack scenario:** An installation runs with a copied `.env.example`. The attacker knows the secret from the public repository and signs a token `{ sub: "<anything>", role: "ADMIN" }` → full admin access without signing in. (Combined with finding 4, `sub` does not even have to exist.)

**Recommended fix:** At start, refuse secrets shorter than 32 characters or with the `change-me` prefix (abort in production, warning in development). Fix `algorithms: ["HS256"]` for signing and verifying.

## 6. Seed creates an admin account with a known password — **Medium**

**Files:** `backend/prisma/seed.ts:7-30`

**Description:** `npm run prisma:seed` (and `db:setup`, as well as `prisma migrate reset`) creates `admin@lendline.local` / `Admin123!` – regardless of `NODE_ENV`.

**Attack scenario:** The operator runs the seed described in the README while setting up production. Anyone who knows the README signs in as admin.

**Recommended fix:** Refuse the seed in production (`NODE_ENV=production`).

## 7. PostgreSQL with default credentials on all interfaces — **Medium**

**Files:** `docker-compose.yml:5-9`

**Description:** `ports: "5432:5432"` binds to `0.0.0.0`; user/password are `lendline`. Docker also often bypasses the host firewall.

**Attack scenario:** A device in the same network (e.g. company Wi-Fi) connects with `psql -h <host> -U lendline` and reads/changes all data, e.g. sets `role = 'ADMIN'` for an own account or reads password hashes.

**Recommended fix:** Bind the port to `127.0.0.1` only. Make the password overridable through an environment variable.

## 8. Password reset by an admin does not end existing sessions — **Medium**

**Files:** `backend/src/services/userAdminService.ts:61-81`

**Description:** When an admin sets a new password (typically after a compromise), all refresh tokens of the account stay valid. The same applies to a role change.

**Attack scenario:** An attacker has guessed a user's password and has a session. The admin resets the password – the attacker stays signed in for up to 7 days (or indefinitely through rotation).

**Recommended fix:** Revoke all refresh tokens of the account on a password change.

## 9. User enumeration through the login's response time — **Low**

**Files:** `backend/src/services/authService.ts:214-221`

**Description:** If the e-mail does not exist (or it is an LDAP account), the server answers at once; otherwise only after the bcrypt comparison (~250 ms).

**Attack scenario:** An attacker measures response times and so gets a list of valid accounts as the basis for targeted password guessing (finding 1) or phishing.

**Recommended fix:** For a missing account, compare against a dummy hash so the runtime is the same. (The 409 on registration stays as a deliberately accepted UX trade-off.)

## 10. Refresh token rotation not atomic — **Low**

**Files:** `backend/src/services/authService.ts:238-251`

**Description:** The token is read, checked and then revoked with an unconditional `update`. Two simultaneous calls with the same token both get a new token pair. Reuse of already rotated tokens is not detected.

**Attack scenario:** A stolen refresh token that the attacker uses at the same time as the victim creates a second, independent session chain that the user does not end by signing out.

**Recommended fix:** Revoke atomically with `updateMany({ where: { id, revokedAt: null } })` and only issue new tokens when `count === 1`.

## 11. Race condition in the "last administrator" check — **Low**

**Files:** `backend/src/services/userAdminService.ts:66-81`, `111-122`, `137-142`

**Description:** The number of admins is counted and then changed in a separate query.

**Attack scenario:** Two admins remove each other's role (or delete each other) at the same time – both checks see 2 admins, afterwards there is no admin left. The instance can no longer be administered (recovery only through database access).

**Recommended fix:** Check and change in a `Serializable` transaction.

## 12. Missing security headers, `X-Powered-By` — **Low**

**Files:** `backend/src/app.ts:19-27`

**Description:** Except under `/api/uploads` the API sets no security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`); Express sends `X-Powered-By: Express`.

**Attack scenario:** Fingerprinting of the server software; in old browsers JSON responses could be interpreted as HTML through MIME sniffing.

**Recommended fix:** `app.disable("x-powered-by")` and set basic headers globally.

## 13. Malformed JSON bodies cause a 500 and a stack trace in the log — **Low**

**Files:** `backend/src/middleware/errorHandler.ts:7-23`

**Description:** Errors from `express.json()` (invalid JSON, body > 100 kB) are not `HttpError`s and are answered as 500 "Internal server error" and logged with a stack trace. The client sees no stack trace (no information leak), but the log can be flooded and monitoring reports server errors.

**Attack scenario:** An attacker sends broken JSON in bulk and so fills the log with stack traces; real errors get lost in it.

**Recommended fix:** Answer body parser errors (`type` starting with `entity.` / `status` 4xx) with their status and a general message, without logging a stack trace.

## 14. No length limit on the login password, bcrypt truncation — **Low**

**Files:** `backend/src/validators/auth.ts:11`, `backend/src/lib/password.ts`

**Description:** The login password is unlimited (up to a 100 kB body). bcrypt only uses the first 72 bytes, but registration accepts passwords of up to 200 characters.

**Attack scenario:** Users with long passphrases (> 72 bytes) effectively have a shorter password than they think; two passwords with the same first 72 bytes are equivalent.

**Recommended fix:** Limit passwords (login, registration, admin form) to 72 bytes UTF-8.

## 15. Refresh/logout without origin check — **Low**

**Files:** `backend/src/routes/auth.ts:66-82`

**Description:** The cookie-based endpoints `/auth/refresh` and `/auth/logout` are only protected against CSRF by `SameSite=Lax`. Same-site attackers (another subdomain of the same domain) or browsers without SameSite support are not stopped.

**Attack scenario:** A page on `evil.company.com` sends `POST /api/auth/logout` → login CSRF / forced sign-out of all visitors. The access token itself cannot be read because of CORS.

**Recommended fix:** On these endpoints, check an `Origin` header, if present, against `FRONTEND_ORIGIN` and answer 403 on a mismatch.

## 16. Vulnerable dev dependency `deepmerge-ts` — **Low**

**Files:** `backend/package.json:57` (`prisma`)

**Description:** `prisma` → `@prisma/config` → `deepmerge-ts < 8.0.0` (GHSA-ggr8-5vv4-36mx, stack exhaustion). Only affects the Prisma CLI (migrate/generate), not the running API; the processed data (own configuration) is not controlled by an attacker.

**Attack scenario:** Practically none in operation.

**Recommended fix:** Update Prisma once a version with `deepmerge-ts ≥ 8` is released.

## 17. Upload content is not checked — **Low**

**Files:** `backend/src/middleware/upload.ts:25-57`

**Description:** Only the file extension and the MIME type sent by the client are checked, not the content (magic bytes). Thanks to `nosniff` and the `sandbox` CSP under `/api/uploads` (`app.ts:29-42`), a disguised HTML/script file cannot be executed, however. Uploads are reserved for admins.

**Attack scenario:** An admin (accidentally) uploads an arbitrary file as `.png`, which is then publicly available (hosting of foreign content).

**Recommended fix:** Optionally a magic-byte check. Not implemented because of the low risk.

## 18. E-mail address not verified on registration — **Low**

**Files:** `backend/src/services/authService.ts:54-91`

**Description:** Anyone can register with any (foreign) address; the owner of the address later receives notifications. Combined with LDAP see finding 2.

**Attack scenario:** Nuisance through notifications to foreign addresses; impersonation towards the administration ("John Doe" orders devices).

**Recommended fix:** E-mail confirmation by link on registration, or limit registration to company domains. (Larger feature, see the fix report.)
