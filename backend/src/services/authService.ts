import type { Permission } from "../lib/permissions.js";
import type { LdapProfile } from "./ldapService.js";
import type { AuthSource } from "@prisma/client";

import { Prisma } from "@prisma/client";

import { config } from "../config.js";
import { type Locale, isLocale, t } from "../i18n/index.js";
import { HttpError } from "../lib/errors.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { withImplied } from "../lib/permissions.js";
import { prisma } from "../lib/prisma.js";
import { createRefreshToken, hashToken, signAccessToken } from "../lib/tokens.js";
import { diff, recordAudit } from "./auditService.js";
import { defaultGroupId, groupForDirectoryUser } from "./groupService.js";
import { authenticateLdap } from "./ldapService.js";
import { assertAccessDuringMaintenance } from "./maintenanceService.js";
import { endAllSessions } from "./sessionService.js";
import { getSetting } from "./settingsService.js";

// What login, refresh and /me need; `present()` turns it into what the client sees.
const userSelect = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
  mustChangePassword: true,
  locale: true,
  authSource: true,
  sessionVersion: true,
  group: { select: { id: true, name: true, permissions: true } },
} as const;
type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

/**
 * A rotated token presented again after this grace period was copied: someone else holds it. Within
 * it, two tabs simply raced for the same refresh.
 */
const REUSE_GRACE_MS = 60_000;

// bcrypt hash of a random string (cost 12, like real hashes): compared against when the account
// does not exist, so a missing account takes as long as a wrong password.
const DUMMY_HASH = "$2b$12$O8kaLVjFtBul44boJ5k3B.cPsObVK2h0zy/KPgqgRYPWdzD5B1lb.";

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  /**
   * An admin set the password; the client must ask for a new one before anything else.
   */
  mustChangePassword: boolean;
  /**
   * Chosen language (interface and e-mails); null = not chosen yet, German for e-mails.
   */
  locale: Locale | null;
  authSource: AuthSource;
  group: { id: string; name: string };
  /**
   * Effective permissions of the group (with everything they imply); the client shows and hides its
   * pages by them, the API checks them again on every request.
   */
  permissions: Permission[];
};

function permissionsOf(user: UserRow): Set<Permission> {
  return new Set(withImplied(user.group.permissions));
}

function present(user: UserRow): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    mustChangePassword: user.mustChangePassword,
    locale: isLocale(user.locale) ? user.locale : null,
    authSource: user.authSource,
    group: { id: user.group.id, name: user.group.name },
    permissions: withImplied(user.group.permissions),
  };
}

export type AuthResult = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
};

/**
 * `sessionStartedAt` is the login time; rotations pass it on so `SESSION_MAX_DAYS` caps the
 * session.
 */
async function issueTokens(user: UserRow, sessionStartedAt = new Date()): Promise<AuthResult> {
  const refreshToken = createRefreshToken();
  const expiresAt = new Date(Date.now() + config.jwtRefreshTtlDays * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt,
      sessionStartedAt,
    },
  });
  return {
    user: present(user),
    accessToken: signAccessToken({ sub: user.id, sv: user.sessionVersion }),
    refreshToken,
  };
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  // A new account has no rights yet, so registration is closed during maintenance.
  await assertAccessDuringMaintenance(new Set());
  if (config.ldap.enabled && !config.ldap.allowLocalRegister) {
    throw new HttpError(
      403,
      t((m) => m.errors.registrationLdapOnly)
    );
  }
  const { registration } = await getSetting("policy");
  if (!registration.enabled) {
    throw new HttpError(
      403,
      t((m) => m.errors.registrationOff)
    );
  }
  const domain = input.email.toLowerCase().split("@").pop() ?? "";
  if (registration.domains.length > 0 && !registration.domains.includes(domain)) {
    throw new HttpError(
      403,
      t((m) => m.errors.registrationDomains, {
        domains: registration.domains.map((item) => `@${item}`).join(", "),
      })
    );
  }
  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash: await hashPassword(input.password),
        groupId: await defaultGroupId(),
      },
      select: userSelect,
    });
    await recordAudit({
      actorId: user.id,
      action: "USER_REGISTERED",
      entityType: "USER",
      entityId: user.id,
      summary: { key: "audit.userRegistered", params: { name: user.name } },
      details: { context: { "E-Mail": user.email, Gruppe: user.group.name } },
    });
    return await issueTokens(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(
        409,
        t((m) => m.errors.emailRegistered)
      );
    }
    throw error;
  }
}

async function upsertLdapUser(profile: LdapProfile): Promise<UserRow> {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ ldapDn: profile.dn }, { email: profile.email }] },
    include: { group: { select: { name: true } } },
  });
  if (!existing) {
    const created = await prisma.user.create({
      data: {
        name: profile.name,
        email: profile.email,
        authSource: "LDAP",
        ldapDn: profile.dn,
        groupId: await groupForDirectoryUser(profile.memberOf, null),
        passwordHash: null,
      },
      select: userSelect,
    });
    await recordAudit({
      actorId: created.id,
      action: "USER_CREATED",
      entityType: "USER",
      entityId: created.id,
      summary: { key: "audit.userFromDirectory", params: { name: created.name } },
      details: {
        context: { "E-Mail": created.email, Gruppe: created.group.name, DN: profile.dn },
      },
    });
    return created;
  }
  // The account changes hands when it was local (possibly registered by someone else with this
  // e-mail) or belonged to another DN: its existing sessions must not carry over. A DN change
  // is also what a move between OUs looks like, so it is not refused.
  if (existing.authSource === "LOCAL" || existing.ldapDn !== profile.dn) {
    await endAllSessions(prisma, { id: existing.id });
  }
  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: {
      name: profile.name,
      email: profile.email,
      authSource: "LDAP",
      ldapDn: profile.dn,
      groupId: await groupForDirectoryUser(profile.memberOf, existing.groupId),
      passwordHash: null,
      mustChangePassword: false,
    },
    select: userSelect,
  });
  const changes = diff(
    { ...existing, group: existing.group.name },
    { ...updated, group: updated.group.name, authSource: "LDAP" },
    [
      { key: "name", label: "Name" },
      { key: "email", label: "E-Mail" },
      { key: "group", label: "Gruppe" },
      {
        key: "authSource",
        label: "Anmeldung",
        format: (value) => (value === "LDAP" ? "Verzeichnis" : "Lokal"),
      },
    ]
  ).filter((change) => change.from !== change.to);
  if (changes.length > 0) {
    await recordAudit({
      actorId: updated.id,
      action: "USER_UPDATED",
      entityType: "USER",
      entityId: updated.id,
      summary: { key: "audit.userUpdatedFromDirectory", params: { name: updated.name } },
      details: { changes },
    });
  }
  return updated;
}

export async function login(input: { email: string; password: string }): Promise<AuthResult> {
  const identifier = input.email.trim();
  let result: { user: UserRow; method: string };
  try {
    result = await authenticate(identifier, input.password);
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      await recordAudit({
        actorName: identifier.slice(0, 120),
        action: "LOGIN_FAILED",
        entityType: "AUTH",
        summary: { key: "audit.loginFailed", params: { name: identifier.slice(0, 120) } },
        details: { context: { Grund: "Benutzername oder Passwort falsch" } },
      });
    }
    throw error;
  }
  try {
    await assertAccessDuringMaintenance(permissionsOf(result.user));
  } catch (error) {
    await recordAudit({
      actorId: result.user.id,
      action: "LOGIN_BLOCKED",
      entityType: "AUTH",
      entityId: result.user.id,
      summary: { key: "audit.loginBlocked", params: { name: result.user.name } },
      details: { context: { Methode: result.method } },
    });
    throw error;
  }
  await recordAudit({
    actorId: result.user.id,
    action: "LOGIN_SUCCEEDED",
    entityType: "AUTH",
    entityId: result.user.id,
    summary: { key: "audit.loginSucceeded", params: { name: result.user.name } },
    details: { context: { Methode: result.method } },
  });
  return issueTokens(result.user);
}

async function authenticate(
  identifier: string,
  password: string
): Promise<{ user: UserRow; method: string }> {
  if (config.ldap.enabled) {
    let profile;
    try {
      profile = await authenticateLdap(identifier, password);
    } catch (error) {
      // A wrong directory password is answered after the bind, much faster than bcrypt: spend
      // the same time, so the response does not reveal that the directory account exists.
      if (error instanceof HttpError && error.status === 401) {
        await verifyPassword(password, DUMMY_HASH);
      }
      throw error;
    }
    if (profile) {
      return { user: await upsertLdapUser(profile), method: "Verzeichnis (LDAP)" };
    }
  }

  const user = await prisma.user.findUnique({ where: { email: identifier.toLowerCase() } });
  const localHash = user?.authSource === "LOCAL" ? user.passwordHash : null;
  // Always run bcrypt, so the response time does not reveal whether the account exists.
  const valid = await verifyPassword(password, localHash ?? DUMMY_HASH);
  if (!user || !localHash || !valid) {
    throw new HttpError(
      401,
      t((m) => m.errors.badCredentials)
    );
  }
  return {
    user: await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: userSelect }),
    method: "Lokales Konto",
  };
}

export async function refresh(rawToken: string | undefined): Promise<AuthResult> {
  if (!rawToken) {
    throw new HttpError(
      401,
      t((m) => m.errors.noSession)
    );
  }
  const expired = new HttpError(
    401,
    t((m) => m.errors.sessionExpired)
  );
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: { select: userSelect } },
  });
  if (!existing) throw expired;
  const now = Date.now();
  if (existing.rotatedAt && now - existing.rotatedAt.getTime() > REUSE_GRACE_MS) {
    await reportReuse(existing.user);
    throw expired;
  }
  const maxAgeMs = config.sessionMaxDays * 24 * 60 * 60 * 1000;
  if (
    existing.revokedAt ||
    existing.expiresAt.getTime() <= now ||
    existing.sessionStartedAt.getTime() + maxAgeMs <= now
  ) {
    throw expired;
  }
  // Checked before rotating: the session stays valid and simply continues after maintenance.
  await assertAccessDuringMaintenance(permissionsOf(existing.user));
  // Atomic: of two requests presenting the same token, only one gets a new pair.
  const rotatedAt = new Date();
  const claimed = await prisma.refreshToken.updateMany({
    where: { id: existing.id, revokedAt: null },
    data: { revokedAt: rotatedAt, rotatedAt },
  });
  if (claimed.count !== 1) throw expired;
  return issueTokens(existing.user, existing.sessionStartedAt);
}

/**
 * An old refresh token came back: it was copied (stolen cookie, malware, backup). Nobody can tell
 * which copy is legitimate, so every session of the account ends.
 */
async function reportReuse(user: UserRow): Promise<void> {
  const revoked = await endAllSessions(prisma, { id: user.id });
  await recordAudit({
    actorId: user.id,
    action: "SESSION_REUSE_DETECTED",
    entityType: "AUTH",
    entityId: user.id,
    summary: { key: "audit.sessionReuse", params: { name: user.name } },
    details: {
      context: {
        Bedeutung:
          "Ein bereits ersetztes Token wurde erneut vorgelegt; es wurde vermutlich kopiert.",
        "Beendete Sitzungen": String(revoked),
      },
    },
  });
}

/**
 * Own password change for local accounts. Ends every session, including other devices, and starts a
 * fresh one for the caller.
 */
export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string }
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user)
    throw new HttpError(
      404,
      t((m) => m.errors.userNotFound)
    );
  if (user.authSource !== "LOCAL" || !user.passwordHash) {
    throw new HttpError(
      409,
      t((m) => m.errors.directoryPassword)
    );
  }
  // 400, not 401: the client would take a 401 for an expired session and refresh.
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new HttpError(
      400,
      t((m) => m.errors.currentPasswordWrong)
    );
  }
  if (await verifyPassword(input.newPassword, user.passwordHash)) {
    throw new HttpError(
      400,
      t((m) => m.errors.passwordUnchanged)
    );
  }
  const passwordHash = await hashPassword(input.newPassword);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
    await endAllSessions(tx, { id: userId });
    return tx.user.findUniqueOrThrow({ where: { id: userId }, select: userSelect });
  });
  await recordAudit({
    actorId: userId,
    action: "PASSWORD_CHANGED",
    entityType: "AUTH",
    entityId: userId,
    summary: {
      key: user.mustChangePassword ? "audit.passwordReplaced" : "audit.passwordChanged",
      params: { name: user.name },
    },
    details: { context: { Folge: "Alle anderen Sitzungen wurden beendet" } },
  });
  return issueTokens(updated);
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  const session = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: { revokedAt: true, user: { select: { id: true, name: true } } },
  });
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (session && !session.revokedAt) {
    await recordAudit({
      actorId: session.user.id,
      action: "LOGOUT",
      entityType: "AUTH",
      entityId: session.user.id,
      summary: { key: "audit.logout", params: { name: session.user.name } },
    });
  }
}

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: userSelect });
  if (!user)
    throw new HttpError(
      401,
      t((m) => m.errors.userNotFound)
    );
  return present(user);
}

/**
 * Stores the language the person chose, for their e-mails and their next devices.
 */
export async function setLocale(userId: string, locale: Locale): Promise<PublicUser> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { locale },
    select: userSelect,
  });
  return present(user);
}
