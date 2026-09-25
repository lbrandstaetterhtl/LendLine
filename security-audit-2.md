# Security audit 2 – LendLine (verification)

As of 2026-09-24, the working state after the fixes from `fix-report.md` (not yet committed). Same criteria and method as `security-audit-1.md`. In addition, every changed line was checked for new problems it might introduce.

**Tools:**

- Backend: `npm run typecheck`, `npm run lint:types` and `npm run knip` are green.
- `oxfmt --check` only reports files checked out with CRLF (`core.autocrlf=true`). This is unrelated to the fixes; an unchanged checkout shows the same result for 46 files.
- `npm audit`: backend only `deepmerge-ts` (dev), frontend and root 0 vulnerabilities.

**Smoke test** of the API (without a database):

- `X-Powered-By` is missing, `X-Frame-Options: DENY` and `nosniff` are set.
- Broken JSON → 400.
- Login: 11th attempt → 429.
- Logout with a foreign `Origin` → 403, with the frontend origin → 204.
- 80-byte password → 400.
- Placeholder secret: abort with `NODE_ENV=production`, otherwise a warning.

## Verification of the findings from audit 1

| # (audit 1) | Finding                                | Result                                                            |
| ----------- | -------------------------------------- | ----------------------------------------------------------------- |
| 1           | Rate limit login/registration          | Fixed (confirmed by smoke test); remaining points → new finding 5 |
| 2           | LDAP account takeover                  | Pre-account takeover fixed; rest → finding 3                      |
| 3           | `nodemailer` vulnerable                | Fixed (10.0.10, `npm audit` clean)                                |
| 4           | Role from JWT only                     | Role/existence fixed; rest → finding 2                            |
| 5           | Weak JWT secrets                       | Fixed for production; gap when `NODE_ENV` is missing → finding 1  |
| 6           | Seed with a known password             | Fixed for production; same `NODE_ENV` gap → finding 1             |
| 7           | PostgreSQL public                      | Fixed                                                             |
| 8           | Password reset without ending sessions | Fixed (refresh tokens); access token → finding 2                  |
| 9           | Timing enumeration                     | Fixed (dummy hash with cost 12, measured ~290 ms)                 |
| 10          | Rotation not atomic                    | Fixed; side effect → finding 6                                    |
| 11          | Race "last admin"                      | Fixed (serializable transaction)                                  |
| 12          | Security headers                       | Fixed (confirmed by smoke test)                                   |
| 13          | JSON errors → 500                      | Fixed (confirmed by smoke test)                                   |
| 14          | Password length                        | Fixed (confirmed by smoke test)                                   |
| 15          | Origin check                           | Fixed (confirmed by smoke test)                                   |
| 16          | `deepmerge-ts`                         | Open (Won't Fix) → finding 8                                      |
| 17          | Upload content                         | Open (Won't Fix) → finding 9                                      |
| 18          | E-mail verification                    | Open (Won't Fix) → finding 10                                     |

The changes introduce no new injection, XSS, path traversal or deserialization problems.

## Current findings

| #   | Title                                                                         | Severity | Status                       |
| --- | ----------------------------------------------------------------------------- | -------- | ---------------------------- |
| 1   | Secret and seed protection only apply with `NODE_ENV=production`              | Medium   | new (gap in fix #5/#6)       |
| 2   | Access token stays valid for up to 15 min after "end sessions"/password reset | Low      | rest of #4/#8                |
| 3   | Second directory entry with the same `mail` takes over the account            | Low      | rest of #2                   |
| 4   | LDAP passwords can be transmitted unencrypted                                 | Low      | new (existed before)         |
| 5   | Rate limit only in memory and per process                                     | Low      | new (limits of fix #1)       |
| 6   | Simultaneous refresh from two tabs signs one tab out; no reuse detection      | Low      | new (side effect of fix #10) |
| 7   | `JWT_REFRESH_SECRET` is required but not used                                 | Low      | existed before               |
| 8   | Vulnerable dev dependency `deepmerge-ts`                                      | Low      | unchanged                    |
| 9   | Upload content is not checked                                                 | Low      | unchanged                    |
| 10  | E-mail address not verified on registration                                   | Low      | unchanged                    |

No findings of severity Critical or High remain.

---

## 1. Secret and seed protection only apply with `NODE_ENV=production` — **Medium**

**Files:** `backend/src/config.ts:35-42`, `backend/src/config.ts:46`, `backend/prisma/seed.ts:7-11`

**Description:** The new secret check only aborts when `NODE_ENV=production` is set. The seed also only refuses then. But `NODE_ENV` defaults to `development` (`config.ts:46`), and `.env.example` does not set it. A production installation without `NODE_ENV` therefore starts with the public placeholder secret; there is only a warning in the console. The `Secure` flag on the refresh cookie is missing as well.

**Attack scenario:** The operator copies `.env.example`, enters database and SMTP, and runs `npm start`. The warning gets lost in the log. Anyone who knows the repository signs a token with `change-me-access-secret` for any existing admin ID and has admin access. Admin IDs are not public, so the attack is harder than before fix #4. A seed admin (`admin@lendline.local` / `Admin123!`) can be used directly in the same situation.

**Recommended fix:** **Always** refuse the known placeholder (`change-me…`), in development too, and only tie the minimum length to `NODE_ENV`. Document `NODE_ENV=production` for operation in `.env.example`/README. The seed should require an explicit permission (e.g. `ALLOW_DEMO_SEED=true`) instead of only excluding `production`.

## 2. Access token stays valid after "end sessions"/password reset — **Low**

**Files:** `backend/src/middleware/auth.ts:28-47`, `backend/src/services/userAdminService.ts:223-241` (`revokeUserSessions`), `backend/src/services/systemService.ts:141-148` (`end-sessions`)

**Description:** `requireAuth` now checks existence and role in the database. Revoking the sessions of a still existing account only affects refresh tokens, however. The access token already issued keeps working until it expires (`JWT_ACCESS_TTL`, default 15 min).

**Attack scenario:** An attacker with a stolen session of a normal user can still make requests in the victim's name for up to 15 minutes after the administration resets the password. They cannot gain admin rights.

**Recommended fix:** Add a column `sessionVersion` to the user (migration). It is raised on revocation, password reset and role change and written into the token as a claim; `requireAuth` compares both values.

## 3. Second directory entry with the same `mail` takes over the account — **Low**

**Files:** `backend/src/services/authService.ts:97-169` (`upsertLdapUser`)

**Description:** The account is still found by `ldapDn` **or** e-mail, and the DN is overwritten. Since fix #2, the previous owner's sessions are revoked. The request history and (without `LDAP_ADMIN_GROUP`) the role pass to the new directory entry, however.

**Attack scenario:** A second entry with the address of a LendLine admin is created in the directory (by mistake or by someone with write access to `mail`). When this entry signs in, it gets the admin account. Requires write access to the directory.

**Recommended fix:** Store an immutable directory key (`objectGUID` or `entryUUID`) and match by it. Only use the e-mail for the first linking of a local account.

## 4. LDAP passwords can be transmitted unencrypted — **Low**

**Files:** `backend/src/services/ldapService.ts:47-52`, `backend/src/config.ts:67` (`LDAP_TLS_REJECT_UNAUTHORIZED`), `backend/.env.example`

**Description:** `LDAP_URL=ldap://…` is allowed, without StartTLS. With a simple bind the user's password then travels over the network in plain text. With `LDAP_TLS_REJECT_UNAUTHORIZED=false`, any certificate is accepted for `ldaps://` (man-in-the-middle possible). Both are configuration, but there is no warning.

**Attack scenario:** An attacker in the network between the API server and the domain controller reads the passwords of all employees who sign in to LendLine – their Windows/AD passwords.

**Recommended fix:** At start, print a clear warning for `ldap://` without StartTLS and for disabled certificate checks (in production: abort unless explicitly allowed). Optionally support StartTLS.

## 5. Rate limit only in memory and per process — **Low**

**Files:** `backend/src/lib/rateLimit.ts:9-58`, `backend/src/routes/auth.ts:32-36`

**Description:**

- The counters are lost on every restart.
- With several API processes each counts on its own; the limit multiplies.
- Above 10,000 active entries, `prune` scans the whole map on every attempt (O(n)).
- The keys are based on `req.ip`: a reverse proxy that does not run on loopback or passes `X-Forwarded-For` through unchecked causes all users to be counted as one IP (self-DoS) or lets attackers choose their IP freely.

**Attack scenario:** An attacker with many IPv6 addresses bypasses the per-IP limit. The account limit applies per IP + account, so they stay limited to 10 attempts per 15 minutes per address; across many addresses this adds up. The cost is still bcrypt (about 290 ms per attempt).

**Recommended fix:** With several processes, use a shared store (e.g. a Postgres table or Redis). In addition, a global limit per account independent of the IP, with progressive delay instead of a hard lockout. Document the proxy requirements.

## 6. Simultaneous refresh from two tabs; no reuse detection — **Low**

**Files:** `backend/src/services/authService.ts:246-268`, `frontend/src/api/client.ts:42-90`

**Description:** Since the atomic revocation, only one of two simultaneous refresh requests with the same cookie gets new tokens. The frontend only bundles refreshes within one tab. When two tabs open at the same time, one gets 401 and shows the sign-in page (reloading helps, because the cookie has been rotated in the meantime). This is an availability side effect, not a vulnerability. Reuse of a rotated token is also not recognized as theft.

**Attack scenario:** No attack; a stolen, already rotated token is refused, but does not trigger revoking the whole chain.

**Recommended fix:** A short tolerance (e.g. 10 s) for a just-rotated token, during which several tabs get the same new token. Outside this window, revoke all of the user's tokens on reuse and log it.

## 7. `JWT_REFRESH_SECRET` is required but not used — **Low**

**Files:** `backend/src/config.ts:50`, `backend/.env.example:5`

**Description:** Refresh tokens are random, hashed values; the secret is used nowhere. Operators could assume refresh tokens are signed and consider rotating this secret an effective measure (e.g. after an incident). In fact all sessions stay valid.

**Attack scenario:** After a leak, `JWT_REFRESH_SECRET` is replaced to end all sessions. The attacker's sessions continue.

**Recommended fix:** Remove the variable or mark it as unused. For "sign everyone out", refer to the maintenance task `end-sessions`.

## 8. Vulnerable dev dependency `deepmerge-ts` — **Low**

**Files:** `backend/package.json` (`prisma` → `@prisma/config` → `deepmerge-ts < 8.0.0`)

**Description:** Unchanged from audit 1 #16 (GHSA-ggr8-5vv4-36mx). Only affects the Prisma CLI.

**Attack scenario:** Practically none in operation.

**Recommended fix:** Update Prisma once a version with `deepmerge-ts ≥ 8` is released.

## 9. Upload content is not checked — **Low**

**Files:** `backend/src/middleware/upload.ts:25-57`

**Description:** Unchanged from audit 1 #17. Only the extension and the client's MIME type are checked; `nosniff` + `sandbox` CSP prevent execution, uploads are reserved for admins.

**Attack scenario:** An admin stores arbitrary files under a public URL.

**Recommended fix:** Optionally a magic-byte check.

## 10. E-mail address not verified on registration — **Low**

**Files:** `backend/src/services/authService.ts:58-95`

**Description:** Unchanged from audit 1 #18. The most dangerous consequence (LDAP takeover with a surviving session) is fixed.

**Attack scenario:** Registration under a foreign address; notifications go to the owner of the address, and a false identity is presented to the administration.

**Recommended fix:** Confirmation link by e-mail or limiting to company domains; with LDAP `LDAP_ALLOW_LOCAL_REGISTER=false`.
