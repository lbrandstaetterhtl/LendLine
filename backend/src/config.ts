import dotenv from "dotenv";

dotenv.config();

/**
 * Reads an environment variable; an empty value (e.g. `SMTP_HOST=` in .env) counts as unset.
 */
function env(name: string): string | undefined {
  const value = process.env[name];
  return value === "" ? undefined : value;
}

function parseTtlSeconds(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) return fallback;
  const amount = Number(match[1]);
  const unit = match[2];
  const factor = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
  return amount * factor;
}

function required(name: string): string {
  const value = env(name);
  if (!value) {
    throw new Error(`Umgebungsvariable ${name} fehlt. Siehe backend/.env.example.`);
  }
  return value;
}

/**
 * HMAC secrets must not be the placeholder from .env.example: it is public, so anyone could sign
 * admin tokens with it. That is refused everywhere, because NODE_ENV is easily left unset on a real
 * installation. A merely short secret aborts in production and only warns in development.
 */
function secret(name: string): string {
  const value = required(name);
  const hint = `Zufälligen Wert erzeugen: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`;
  if (value.startsWith("change-me")) {
    throw new Error(`${name} ist noch der Platzhalter aus .env.example. ${hint}`);
  }
  if (value.length >= 32) return value;
  const problem = `${name} ist zu kurz (mindestens 32 zufällige Zeichen). ${hint}`;
  if (env("NODE_ENV") === "production") throw new Error(problem);
  console.warn(`WARNUNG: ${problem} Nur für die Entwicklung zulässig.`);
  return value;
}

/**
 * Group DNs only: a bare name like "LendLine-Admins" would match a group of that name in any OU,
 * which someone with rights in their own OU could create.
 */
function adminGroups(): string[] {
  const groups = (env("LDAP_ADMIN_GROUP") ?? "")
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean);
  const bare = groups.filter((group) => !/^cn=/i.test(group) || !group.includes(","));
  if (bare.length > 0) {
    throw new Error(
      `LDAP_ADMIN_GROUP muss vollständige DNs enthalten (z. B. CN=LendLine-Admins,OU=Groups,DC=firma,DC=de), mehrere mit „;“ getrennt. Ungültig: ${bare.join(", ")}`
    );
  }
  return groups.map((group) => group.toLowerCase());
}

const nodeEnv = env("NODE_ENV") ?? "development";
const frontendOrigin = env("FRONTEND_ORIGIN") ?? "http://localhost:5173";

export const config = {
  port: Number(env("PORT") ?? 3001),
  nodeEnv,
  frontendOrigin,
  /**
   * `Secure` on the session cookie whenever the site runs on HTTPS, not only with NODE_ENV set.
   */
  secureCookies: nodeEnv === "production" || frontendOrigin.startsWith("https://"),
  databaseUrl: required("DATABASE_URL"),
  jwtAccessSecret: secret("JWT_ACCESS_SECRET"),
  jwtAccessTtlSeconds: parseTtlSeconds(env("JWT_ACCESS_TTL"), 15 * 60),
  jwtRefreshTtlDays: Number(env("JWT_REFRESH_TTL_DAYS") ?? 7),
  /**
   * A session ends this many days after the login, however often it was refreshed.
   */
  sessionMaxDays: Number(env("SESSION_MAX_DAYS") ?? 30),
  ldap: {
    url: env("LDAP_URL") ?? "",
    bindDn: env("LDAP_BIND_DN") ?? "",
    bindPassword: env("LDAP_BIND_PASSWORD") ?? "",
    baseDn: env("LDAP_BASE_DN") ?? "",
    userFilter:
      env("LDAP_USER_FILTER") ??
      "(|(mail={{username}})(sAMAccountName={{username}})(uid={{username}}))",
    adminGroups: adminGroups(),
    emailAttribute: env("LDAP_ATTR_EMAIL") ?? "mail",
    nameAttribute: env("LDAP_ATTR_NAME") ?? "displayName",
    tlsRejectUnauthorized: env("LDAP_TLS_REJECT_UNAUTHORIZED") !== "false",
    allowLocalRegister: env("LDAP_ALLOW_LOCAL_REGISTER") !== "false",
    /**
     * Allows ldap:// without TLS and unchecked certificates in production (not recommended).
     */
    allowInsecure: env("LDAP_ALLOW_INSECURE") === "true",
    get enabled(): boolean {
      return Boolean(this.url && this.baseDn);
    },
  },
  smtp: {
    host: env("SMTP_HOST") ?? "",
    port: Number(env("SMTP_PORT") ?? 587),
    secure: env("SMTP_SECURE") === "true",
    user: env("SMTP_USER") ?? "",
    pass: env("SMTP_PASS") ?? "",
    from: env("SMTP_FROM") ?? "LendLine <noreply@lendline.local>",
  },
};

/**
 * Users send their directory password through this connection: plain ldap:// or an unchecked
 * certificate exposes it on the network. Refused in production unless explicitly allowed.
 */
function checkLdapTransport(): void {
  const { ldap } = config;
  if (!ldap.enabled) return;
  const problems = [
    ...(ldap.url.toLowerCase().startsWith("ldaps://")
      ? []
      : ["LDAP_URL nutzt kein ldaps:// (Passwörter gehen unverschlüsselt über das Netz)"]),
    ...(ldap.tlsRejectUnauthorized
      ? []
      : ["LDAP_TLS_REJECT_UNAUTHORIZED=false (jedes Zertifikat wird akzeptiert)"]),
  ];
  if (problems.length === 0) return;
  const message = problems.join("; ");
  if (config.nodeEnv === "production" && !ldap.allowInsecure) {
    throw new Error(`${message}. In Produktion nur mit LDAP_ALLOW_INSECURE=true erlaubt.`);
  }
  console.warn(`WARNUNG: ${message}.`);
}

checkLdapTransport();
