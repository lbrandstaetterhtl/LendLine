import type { LdapProfile } from "./ldapService.js";
import type { Role } from "@prisma/client";

import { Prisma } from "@prisma/client";

import { config } from "../config.js";
import { HttpError } from "../lib/errors.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { createRefreshToken, hashToken, signAccessToken } from "../lib/tokens.js";
import { diff, recordAudit } from "./auditService.js";
import { authenticateLdap } from "./ldapService.js";
import { assertAccessDuringMaintenance } from "./maintenanceService.js";

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
};

export type AuthResult = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
};

async function issueTokens(user: PublicUser): Promise<AuthResult> {
  const refreshToken = createRefreshToken();
  const expiresAt = new Date(Date.now() + config.jwtRefreshTtlDays * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt,
    },
  });
  return {
    user,
    accessToken: signAccessToken({ sub: user.id, role: user.role }),
    refreshToken,
  };
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  // New accounts are always users, so registration is closed like a user login.
  await assertAccessDuringMaintenance("USER");
  if (config.ldap.enabled && !config.ldap.allowLocalRegister) {
    throw new HttpError(
      403,
      "Registrierung ist deaktiviert. Bitte das Verzeichnis-Konto verwenden."
    );
  }
  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash: await hashPassword(input.password),
      },
      select: publicUserSelect,
    });
    await recordAudit({
      actorId: user.id,
      action: "USER_REGISTERED",
      entityType: "USER",
      entityId: user.id,
      summary: `${user.name} hat sich registriert`,
      details: { context: { "E-Mail": user.email } },
    });
    return await issueTokens(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "Diese E-Mail-Adresse ist bereits registriert");
    }
    throw error;
  }
}

async function upsertLdapUser(profile: LdapProfile): Promise<PublicUser> {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ ldapDn: profile.dn }, { email: profile.email }] },
  });
  if (!existing) {
    const created = await prisma.user.create({
      data: {
        name: profile.name,
        email: profile.email,
        authSource: "LDAP",
        ldapDn: profile.dn,
        role: profile.isAdmin ? "ADMIN" : "USER",
        passwordHash: null,
      },
      select: publicUserSelect,
    });
    await recordAudit({
      actorId: created.id,
      action: "USER_CREATED",
      entityType: "USER",
      entityId: created.id,
      summary: `Benutzer „${created.name}“ bei der ersten Anmeldung aus dem Verzeichnis übernommen`,
      details: {
        context: { "E-Mail": created.email, Rolle: roleLabel(created.role), DN: profile.dn },
      },
    });
    return created;
  }
  const nextRole: Role =
    config.ldap.adminGroups.length > 0 ? (profile.isAdmin ? "ADMIN" : "USER") : existing.role;
  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: {
      name: profile.name,
      email: profile.email,
      authSource: "LDAP",
      ldapDn: profile.dn,
      role: nextRole,
      passwordHash: null,
    },
    select: publicUserSelect,
  });
  const changes = diff(existing, { ...updated, authSource: "LDAP" }, [
    { key: "name", label: "Name" },
    { key: "email", label: "E-Mail" },
    { key: "role", label: "Rolle", format: (value) => roleLabel(value as Role) },
    {
      key: "authSource",
      label: "Anmeldung",
      format: (value) => (value === "LDAP" ? "Verzeichnis" : "Lokal"),
    },
  ]).filter((change) => change.from !== change.to);
  if (changes.length > 0) {
    await recordAudit({
      actorId: updated.id,
      action: "USER_UPDATED",
      entityType: "USER",
      entityId: updated.id,
      summary: `Benutzer „${updated.name}“ aus dem Verzeichnis aktualisiert`,
      details: { changes },
    });
  }
  return updated;
}

function roleLabel(role: Role): string {
  return role === "ADMIN" ? "Verwaltung" : "Nutzer";
}

export async function login(input: { email: string; password: string }): Promise<AuthResult> {
  const identifier = input.email.trim();
  let result: { user: PublicUser; method: string };
  try {
    result = await authenticate(identifier, input.password);
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      await recordAudit({
        actorName: identifier.slice(0, 120),
        action: "LOGIN_FAILED",
        entityType: "AUTH",
        summary: `Fehlgeschlagene Anmeldung als „${identifier.slice(0, 120)}“`,
        details: { context: { Grund: "Benutzername oder Passwort falsch" } },
      });
    }
    throw error;
  }
  try {
    await assertAccessDuringMaintenance(result.user.role);
  } catch (error) {
    await recordAudit({
      actorId: result.user.id,
      action: "LOGIN_BLOCKED",
      entityType: "AUTH",
      entityId: result.user.id,
      summary: `Anmeldung von ${result.user.name} wegen Wartung abgewiesen`,
      details: { context: { Methode: result.method } },
    });
    throw error;
  }
  await recordAudit({
    actorId: result.user.id,
    action: "LOGIN_SUCCEEDED",
    entityType: "AUTH",
    entityId: result.user.id,
    summary: `${result.user.name} hat sich angemeldet`,
    details: { context: { Methode: result.method } },
  });
  return issueTokens(result.user);
}

async function authenticate(
  identifier: string,
  password: string
): Promise<{ user: PublicUser; method: string }> {
  if (config.ldap.enabled) {
    const profile = await authenticateLdap(identifier, password);
    if (profile) {
      return { user: await upsertLdapUser(profile), method: "Verzeichnis (LDAP)" };
    }
  }

  const user = await prisma.user.findUnique({ where: { email: identifier.toLowerCase() } });
  if (
    !user?.passwordHash ||
    user.authSource === "LDAP" ||
    !(await verifyPassword(password, user.passwordHash))
  ) {
    throw new HttpError(401, "Benutzername oder Passwort ist falsch");
  }
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
    method: "Lokales Konto",
  };
}

export async function refresh(rawToken: string | undefined): Promise<AuthResult> {
  if (!rawToken) {
    throw new HttpError(401, "Keine gültige Sitzung");
  }
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: { select: publicUserSelect } },
  });
  if (!existing || existing.revokedAt || existing.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(401, "Sitzung abgelaufen. Bitte erneut anmelden.");
  }
  // Checked before rotating: the session stays valid and simply continues after maintenance.
  await assertAccessDuringMaintenance(existing.user.role);
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });
  return issueTokens(existing.user);
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
      summary: `${session.user.name} hat sich abgemeldet`,
    });
  }
}

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect });
  if (!user) throw new HttpError(401, "Benutzer nicht gefunden");
  return user;
}
