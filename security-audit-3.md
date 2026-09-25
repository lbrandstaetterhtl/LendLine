# Security audit 3 – LendLine

As of 2026-09-25, commit `0f3b266` (`main`). Same criteria and severities as `security-audit-1.md` and `security-audit-2.md`. New compared with audit 2: the product is to be rented to companies (one installation per company, see `doc/LendLine.md` §13.6). Findings were therefore also rated on the assumption that an installation can be **reachable from the internet**, not only inside the company network.

**Scope:** the whole backend (`backend/src`, about 3,900 lines, read completely), the Prisma schema, security-relevant parts of the frontend (token handling, HTML sinks, links, `index.html`, Vite configuration), dependencies.

**Tools:**

- Backend and frontend: `typecheck`, `lint:types` and `knip` are green.
- `oxfmt --check` reports 13 backend files. As in audit 2, the cause is the checkout with CRLF (`core.autocrlf=true`); not a security finding.
- `npm audit`: frontend and root 0 vulnerabilities. Backend: `deepmerge-ts` (dev), now rated **High** by npm, see finding 9.

**Runtime tests** against the local installation with PostgreSQL. Audit 2 had no database; these paths are now checked in operation for the first time.

| Test                                                      | Result                            |
| --------------------------------------------------------- | --------------------------------- |
| Refresh, then reuse the old refresh token                 | 200, then 401                     |
| Two simultaneous refreshes with the same token            | once 200, once 401                |
| Refresh with a foreign `Origin`                           | 403                               |
| 11 wrong logins for the same account                      | 10 × 401, then 429                |
| Broken JSON                                               | 400 "Invalid request body"        |
| Response time unknown vs. existing local account          | 333 ms vs. 302 ms (no difference) |
| Security headers (`nosniff`, `X-Frame-Options`, referrer) | set, `X-Powered-By` missing       |
| Logo upload: SVG with `<script>`                          | served with `sandbox` CSP         |
| Logo upload: `.txt`, unknown variant, user account        | 400, 404, 403                     |
| `GET /api/auth/options` without LDAP                      | `allowLocalRegister: true`        |

## Verification of the open findings from audit 2

| Audit 2 | Topic                                          | Status today                                                                                                                                            |
| ------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | Secret/seed protection only with `NODE_ENV`    | **Partially fixed:** the placeholder secret is refused everywhere (`config.ts:39-41`). The seed lock and the `Secure` cookie still depend on `NODE_ENV` |
| 2       | Access token valid for 15 min after revocation | Open, unchanged                                                                                                                                         |
| 3       | Second directory entry takes over the account  | Open, unchanged                                                                                                                                         |
| 4       | LDAP without TLS possible                      | Open, unchanged                                                                                                                                         |
| 5       | Rate limit in memory, per process, per IP      | Open; the limit itself confirmed in operation (429 after 10 attempts)                                                                                   |
| 6       | Parallel refresh from two tabs                 | Open; behaviour confirmed in operation (200/401)                                                                                                        |
| 7       | `JWT_REFRESH_SECRET` unused                    | Open, unchanged                                                                                                                                         |
| 8       | `deepmerge-ts`                                 | Open; npm now rates it High → finding 9                                                                                                                 |
| 9       | Upload content not checked                     | Open, unchanged; now also applies to company logos (SVG), defused by the CSP                                                                            |
| 10      | E-mail not verified on registration            | Open; weighs more in the rental model → finding 1                                                                                                       |

## Current findings

| #   | Title                                                        | Severity | Status                  |
| --- | ------------------------------------------------------------ | -------- | ----------------------- |
| 1   | Self-registration cannot be turned off without LDAP          | Medium   | new                     |
| 2   | Unlimited requests block the whole stock                     | Medium   | new                     |
| 3   | Users cannot change their own password                       | Low      | new                     |
| 4   | Response time reveals directory accounts (LDAP)              | Low      | new                     |
| 5   | `LDAP_ADMIN_GROUP` as a group name matches groups in any OU  | Low      | new                     |
| 6   | No security headers and no CSP for the frontend              | Low      | new                     |
| 7   | "Delete orphaned image files" can delete uploads in progress | Low      | new                     |
| 8   | Sessions have no absolute maximum duration                   | Info     | new                     |
| 9   | Dev dependency `deepmerge-ts` now rated High                 | Low      | re-rating of audit 2 #8 |

No findings of severity Critical or High. The open points from audit 2 (table above) still apply in addition.

## 1. Self-registration cannot be turned off without LDAP — **Medium**

**Files:** `backend/src/config.ts:73`, `backend/src/services/authService.ts:65-70`, `backend/src/routes/auth.ts:60-61`

**Description:** The only setting to turn registration off is `LDAP_ALLOW_LOCAL_REGISTER`, and it only works when LDAP is active (`config.ldap.enabled && !config.ldap.allowLocalRegister`). Without LDAP, `POST /api/auth/register` is **always** open, except in maintenance mode. The e-mail address is not confirmed (audit 2 #10) and not limited to company domains. The rate limit allows 10 accounts per IP and hour.

In the previous use inside the company network this was a convenience feature. A rented installation of a small company without a directory service is, however, typically reachable from the internet.

**Attack scenario:** Anyone finds the installation, registers with a throwaway address and is a user at once. They see the complete device catalogue with serial numbers, all rooms and the bookings of all devices. They can make requests that block the stock (finding 2) and pose as an employee towards the administration.

**Recommended fix:** A dedicated setting `ALLOW_REGISTRATION` (default `false` for new installations), better still switchable in the interface under "Appearance" or a new "Settings" page. Optionally a list of allowed e-mail domains and/or activating new accounts only after approval by the administration.

## 2. Unlimited requests block the whole stock — **Medium**

**Files:** `backend/src/validators/request.ts:3-13`, `backend/src/services/requestService.ts:63-119`, `backend/src/services/searchService.ts:34-43`

**Description:** Open requests (`OPEN`) block a piece just like approved ones: the search and the overlap check count both statuses. There are no limits for new requests:

- no maximum number of open requests per person,
- no maximum duration (`desiredUntil` may be e.g. `9999-12-31T23:59`),
- no check that `startsAt` is in the future (only the end must be in the future),
- no rate limit on `POST /api/requests`,
- users cannot withdraw their own requests; only the administration can reject.

**Attack scenario:** A user – together with finding 1 also a stranger – requests every piece by script for the period "now until 9999". Afterwards nobody finds a free device until the administration rejects every request individually. Every rejection also sends an e-mail to the (possibly foreign) address of the account.

**Recommended fix:** Check a maximum duration (e.g. configurable, default 30 days) and a minimum start (`startsAt ≥ now − a small tolerance`) server-side. A maximum number of open requests per person (e.g. 10). A rate limit on creating. Let users withdraw their own open requests. For the administration, a bulk action "reject all open requests of this person".

## 3. Users cannot change their own password — **Low**

**Files:** `backend/src/routes/auth.ts` (no endpoint), `backend/src/routes/users.ts:27-31`, `backend/src/services/userAdminService.ts:61-92`

**Description:** Passwords of local accounts are only set by the administration (on creation or reset). There is no endpoint and no page where users change their password, and no requirement to change it after the first login. The administration therefore permanently knows the passwords of all accounts it created.

**Attack scenario:** An admin (or whoever has their access or their notes) signs in as any user; in the log this appears as the user's sign-in. A user who uses the same password elsewhere cannot fix that. After a suspicion of misuse the user cannot react themselves.

**Recommended fix:** `POST /api/auth/password` with the old and the new password (rate limit, ends all other sessions) and an "Account" page. Mark passwords set by the administration as temporary and require a change at the first login.

## 4. Response time reveals directory accounts (LDAP) — **Low**

**Files:** `backend/src/services/ldapService.ts:87-97`, `backend/src/services/authService.ts:220-233`

**Description:** The dummy hash from audit 1 #9 only evens out local accounts. With LDAP active:

- If the name is found in the directory and the password is wrong, the API answers 401 right after the LDAP bind, without bcrypt (a few milliseconds).
- If it is not found, the local path with bcrypt runs (about 300 ms).

**Attack scenario:** An attacker tries names such as `m.miller` or `john.doe@company.com` and recognizes from the response time which Windows/AD accounts exist. That is a good basis for password spraying against other services of the company. The rate limit slows this down but does not prevent it (audit 2 #5).

**Recommended fix:** After a failed LDAP bind, also check against `DUMMY_HASH`, or pad every failed sign-in to a fixed minimum duration.

## 5. `LDAP_ADMIN_GROUP` as a group name matches groups in any OU — **Low**

**Files:** `backend/src/services/ldapService.ts:31-38`, `README.md` (LDAP section)

**Description:** If `LDAP_ADMIN_GROUP` is a plain name (e.g. `LendLine-Admins`), any `memberOf` group whose DN starts with `cn=LendLine-Admins,` is accepted, whatever the OU. Only a full DN is unique.

**Attack scenario:** In many directories, department admins or helpdesk accounts may create groups in their own OU. Whoever creates a group `cn=LendLine-Admins,ou=Sales,…` and adds themselves becomes a LendLine admin at the next login.

**Recommended fix:** Only accept full DNs (warning or abort at start for a plain name). Alternatively resolve the group found by search and compare its DN.

## 6. No security headers and no CSP for the frontend — **Low**

**Files:** `backend/src/app.ts:25-30` (API only), `frontend/index.html:11-25`, `frontend/vite.config.ts`

**Description:** `X-Frame-Options`, `nosniff` and `Referrer-Policy` are only set by the API. For the frontend there are neither these headers nor a Content Security Policy. A production delivery is not defined (Vite is only the development server). A company installation is therefore delivered with whatever the respective web server does by default. The access token lives in JavaScript memory; an XSS vulnerability would therefore have full effect. None was found at present: React escapes all output, there is no `dangerouslySetInnerHTML` and no dynamic `href`.

**Attack scenario:** A foreign page embeds LendLine invisibly in a frame and gets a signed-in admin to trigger e.g. "End all sessions" or "Turn on maintenance mode" with a click (clickjacking). If an XSS vulnerability appears later, the CSP is missing as a second line of defence.

**Recommended fix:** Define a production delivery (e.g. Express also serves `frontend/dist`, or a documented reverse proxy configuration) and set there: `Content-Security-Policy: default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; object-src 'none'; base-uri 'none'` with a hash for the inline script in `index.html`, plus `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and HSTS in production.

## 7. "Delete orphaned image files" can delete uploads in progress — **Low**

**Files:** `backend/src/services/systemService.ts:31-49` (`uploadFiles`), `backend/src/services/systemService.ts:128-134`, `backend/src/middleware/upload.ts:17`, `backend/src/services/imageService.ts:29-31`

**Description:** Multer writes the file before `addImages` creates the `DeviceImage` row. If the maintenance task runs exactly at that moment, the file counts as orphaned and is deleted. The database then points to a missing file. This is about integrity, not confidentiality; only admins can trigger it.

**Attack scenario:** No targeted attack; two admins work at the same time, and a device image is permanently broken afterwards.

**Recommended fix:** Only delete files older than e.g. 10 minutes (`mtime`).

## 8. Sessions have no absolute maximum duration — **Info**

**Files:** `backend/src/services/authService.ts:41-56`, `backend/src/services/authService.ts:246-268`

**Description:** Every refresh issues a new refresh token with the full `JWT_REFRESH_TTL_DAYS` (7 days). A regularly used session therefore runs indefinitely without asking for the password again. This is common but should be a deliberate decision, especially on shared computers.

**Recommended fix:** Carry the start of the session along with the token and require a new sign-in after e.g. 30 days (optionally configurable).

## 9. Dev dependency `deepmerge-ts` now rated High — **Low**

**Files:** `backend/package.json` (`prisma` → `@prisma/config@6.19.3` → `deepmerge-ts@7.1.5`)

**Description:** The same finding as audit 2 #8 (GHSA-ggr8-5vv4-36mx, stack overflow when merging recursive objects). `npm audit` now reports it as **3 × High**, because the chain covers three packages. Checked: `@prisma/client` has no runtime dependencies, and `deepmerge-ts` does not appear in the client runtime code. Only the Prisma CLI (migrations) is affected, which processes no attacker data. The rating therefore stays Low.

Side note: `npm start` uses `tsx`, a dev dependency. A production installation therefore needs all dev dependencies, and `npm audit --omit=dev` is not meaningful there.

**Attack scenario:** Practically none in operation. The warning "3 high" can, however, unsettle customers or their auditors.

**Recommended fix:** Update Prisma once a version with `deepmerge-ts ≥ 8` is released. For operation, provide a build (`npm run build`) with `node dist/index.js` and `npm ci --omit=dev`.

## Checked without finding

- **Access control:** all routes under `/api/admin`, `/api/users` and all writing routes for devices, categories, rooms and requests require `requireAdmin`. Users only reach their own requests (`/requests/mine`); there is no endpoint with someone else's request ID for users. Booking calendars show names only to the administration.
- **Role:** comes from the database on every request (`middleware/auth.ts:39-45`).
- **CSRF:** all writing API calls need the bearer header. Refresh/logout are protected by `SameSite=Lax` and the origin check (confirmed in operation).
- **Injection:** no raw SQL queries with input (`$queryRaw` only `SELECT 1`), LDAP filters are escaped (`ldapService.ts:13-18`), e-mail HTML is escaped (`emails/format.ts:21-27`).
- **Uploads:** server-generated UUID file names, extension whitelist, 1 MB (logo) or 5 MB (device image), `sandbox` CSP and `nosniff` under `/api/uploads`, confirmed in operation. Replaced logos are deleted; a wrong variant is rejected before writing.
- **Branding:** the accent colour is checked server-side against `#rrggbb` before it is used as CSS; CSS injection is not possible. `/api/branding` only reveals the colour and logo URLs.
- **Maintenance mode:** the public answer does not say who turned it on. Notice text and time are validated and rendered escaped in React.
- **Passwords:** bcrypt with cost 12, 72-byte limit, constant response time for local accounts (confirmed in operation).
- **Frontend:** no HTML sinks, no dynamic links, no `postMessage`. `localStorage` only holds theme and branding, no tokens.

## Recommended order

1. **Before the first customer:** finding 1 (registration can be turned off, off by default) and finding 2 (limits for requests). Both are small and close the attack surface "stranger from the internet".
2. **With the production delivery:** finding 6 (headers/CSP), finding 9 (build instead of `tsx`), make `NODE_ENV=production` mandatory (rest of audit 2 #1).
3. **Afterwards:** finding 3 (change own password), audit 2 #2 (`sessionVersion`), for LDAP customers findings 4 and 5 as well as audit 2 #3 and #4.
4. **When convenient:** findings 7 and 8, audit 2 #6 and #7.
