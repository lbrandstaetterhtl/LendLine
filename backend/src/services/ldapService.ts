import { Client } from "ldapts";

import { config } from "../config.js";
import { t } from "../i18n/index.js";
import { HttpError } from "../lib/errors.js";

export type LdapProfile = {
  dn: string;
  email: string;
  name: string;
  /**
   * The user's group memberships (`memberOf`), normalised with `normalizeDn`.
   */
  memberOf: string[];
};

function escapeFilter(value: string): string {
  return value.replaceAll(
    /[\\*()\0]/g,
    (char) => `\\${(char.codePointAt(0) ?? 0).toString(16).padStart(2, "0")}`
  );
}

function asStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => asStrings(item));
  if (typeof value === "string") return [value];
  if (Buffer.isBuffer(value)) return [value.toString("utf8")];
  return [];
}

function first(value: unknown): string {
  return asStrings(value)[0]?.trim() || "";
}

/**
 * DNs differ only in case and in spaces after the commas between servers and tools.
 */
export function normalizeDn(dn: string): string {
  return dn
    .toLowerCase()
    .replaceAll(/\s*,\s*/g, ",")
    .trim();
}

function isInvalidCredentials(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "InvalidCredentialsError" || /invalid credentials/i.test(error.message))
  );
}

function client(): Client {
  return new Client({
    url: config.ldap.url,
    tlsOptions: { rejectUnauthorized: config.ldap.tlsRejectUnauthorized },
  });
}

export async function authenticateLdap(
  username: string,
  password: string
): Promise<LdapProfile | null> {
  if (!config.ldap.enabled) return null;

  const searchClient = client();
  try {
    if (config.ldap.bindDn) {
      await searchClient.bind(config.ldap.bindDn, config.ldap.bindPassword);
    }
    const filter = config.ldap.userFilter.replaceAll("{{username}}", escapeFilter(username));
    const { searchEntries } = await searchClient.search(config.ldap.baseDn, {
      scope: "sub",
      filter,
      sizeLimit: 2,
      attributes: ["dn", config.ldap.emailAttribute, config.ldap.nameAttribute, "cn", "memberOf"],
    });
    if (searchEntries.length > 1) {
      throw new HttpError(
        409,
        t((m) => m.errors.ldapAmbiguous)
      );
    }
    const entry = searchEntries[0];
    if (!entry) return null;
    const dn = entry.dn;
    const email = first(entry[config.ldap.emailAttribute]).toLowerCase();
    const name = first(entry[config.ldap.nameAttribute]) || first(entry.cn) || username;
    if (!email) {
      throw new HttpError(
        400,
        t((m) => m.errors.ldapNoEmail)
      );
    }

    const userClient = client();
    try {
      await userClient.bind(dn, password);
    } catch (error) {
      if (isInvalidCredentials(error)) {
        throw new HttpError(
          401,
          t((m) => m.errors.badCredentials)
        );
      }
      throw error;
    } finally {
      await userClient.unbind().catch(() => undefined);
    }

    return {
      dn,
      email,
      name,
      memberOf: asStrings(entry.memberOf).map(normalizeDn),
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error("LDAP sign-in failed, trying the local account", error);
    return null;
  } finally {
    await searchClient.unbind().catch(() => undefined);
  }
}
