import type { Role } from "@prisma/client";

import { Prisma } from "@prisma/client";

import { HttpError } from "../lib/errors.js";
import { hashPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { diff, recordAudit } from "./auditService.js";
import { listMyRequests } from "./requestService.js";

const publicSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  authSource: true,
  createdAt: true,
} as const;

export async function listUsers() {
  return prisma.user.findMany({
    select: publicSelect,
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
}

export async function createUser(
  input: { name: string; email: string; password: string; role: Role },
  actorId: string
) {
  try {
    const created = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash: await hashPassword(input.password),
        role: input.role,
        authSource: "LOCAL",
      },
      select: publicSelect,
    });
    await recordAudit({
      actorId,
      action: "USER_CREATED",
      entityType: "USER",
      entityId: created.id,
      summary: `Benutzer „${created.name}“ angelegt`,
      details: {
        context: { "E-Mail": created.email, Rolle: roleLabel(created.role), Anmeldung: "Lokal" },
      },
    });
    return created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "Diese E-Mail-Adresse ist bereits vergeben");
    }
    throw error;
  }
}

export async function updateUser(
  id: string,
  actorId: string,
  input: { name?: string; role?: Role; password?: string }
) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new HttpError(404, "Benutzer nicht gefunden");
  if (input.role && input.role !== "ADMIN" && user.role === "ADMIN") {
    await assertNotLastAdmin(id, actorId);
  }
  const updated = await prisma.user.update({
    where: { id },
    data: {
      name: input.name,
      role: input.role,
      passwordHash: input.password ? await hashPassword(input.password) : undefined,
      authSource: input.password ? "LOCAL" : undefined,
      ldapDn: input.password ? null : undefined,
    },
    select: publicSelect,
  });
  const roleChanged = user.role !== updated.role;
  await recordAudit({
    actorId,
    action: "USER_UPDATED",
    entityType: "USER",
    entityId: updated.id,
    summary: roleChanged
      ? `Rolle von „${updated.name}“ auf ${roleLabel(updated.role)} geändert`
      : `Benutzer „${updated.name}“ geändert`,
    details: {
      changes: [
        ...diff(user, updated, [
          { key: "name", label: "Name" },
          { key: "role", label: "Rolle", format: (value) => roleLabel(value as Role) },
          {
            key: "authSource",
            label: "Anmeldung",
            format: (value) => (value === "LDAP" ? "Verzeichnis" : "Lokal"),
          },
        ]),
        // The hash itself never goes into the log, only the fact that it was reset.
        ...(input.password ? [{ field: "Passwort", from: null, to: "neu gesetzt" }] : []),
      ],
      context: { "E-Mail": updated.email },
    },
  });
  return updated;
}

export async function deleteUser(id: string, actorId: string) {
  if (id === actorId) throw new HttpError(409, "Das eigene Konto kann nicht gelöscht werden");
  const user = await prisma.user.findUnique({
    where: { id },
    include: { _count: { select: { requests: true } } },
  });
  if (!user) throw new HttpError(404, "Benutzer nicht gefunden");
  if (user.role === "ADMIN") await assertNotLastAdmin(id, actorId);
  if (user._count.requests > 0) {
    throw new HttpError(409, "Benutzer hat Anfragen und kann nicht gelöscht werden");
  }
  await prisma.user.delete({ where: { id } });
  await recordAudit({
    actorId,
    action: "USER_DELETED",
    entityType: "USER",
    entityId: id,
    summary: `Benutzer „${user.name}“ gelöscht`,
    details: { context: { "E-Mail": user.email, Rolle: roleLabel(user.role) } },
  });
}

function roleLabel(role: Role): string {
  return role === "ADMIN" ? "Verwaltung" : "Nutzer";
}

async function assertNotLastAdmin(id: string, actorId: string) {
  if (id === actorId)
    throw new HttpError(409, "Die eigene Administratorrolle kann nicht entzogen werden");
  const admins = await prisma.user.count({ where: { role: "ADMIN" } });
  if (admins <= 1) throw new HttpError(409, "Der letzte Administrator kann nicht entfernt werden");
}

/**
 * Everything the admin profile page shows about one person.
 */
export async function getUserProfile(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: publicSelect });
  if (!user) throw new HttpError(404, "Benutzer nicht gefunden");
  const now = new Date();
  const [requests, activeSessions, lastLogin, lastActivity] = await Promise.all([
    listMyRequests(id),
    prisma.refreshToken.count({ where: { userId: id, revokedAt: null, expiresAt: { gt: now } } }),
    prisma.auditEvent.findFirst({
      where: { actorId: id, action: "LOGIN_SUCCEEDED" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, ip: true, userAgent: true },
    }),
    prisma.auditEvent.findFirst({
      where: { actorId: id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  const byStatus = (status: string) =>
    requests.filter((request) => request.status === status).length;
  return {
    user,
    activeSessions,
    lastLogin,
    lastActivityAt: lastActivity?.createdAt ?? null,
    stats: {
      total: requests.length,
      open: byStatus("OPEN"),
      approved: byStatus("APPROVED"),
      returned: byStatus("RETURNED"),
      rejected: byStatus("REJECTED"),
      overdue: requests.filter(
        (request) => request.status === "APPROVED" && request.desiredUntil < now
      ).length,
    },
    requests,
  };
}

/**
 * Signs a person out everywhere: their refresh tokens stop working at once.
 */
export async function revokeUserSessions(id: string, actorId: string) {
  if (id === actorId) {
    throw new HttpError(409, "Die eigene Sitzung beenden Sie über „Abmelden“.");
  }
  const user = await prisma.user.findUnique({ where: { id }, select: { name: true } });
  if (!user) throw new HttpError(404, "Benutzer nicht gefunden");
  const { count } = await prisma.refreshToken.updateMany({
    where: { userId: id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await recordAudit({
    actorId,
    action: "USER_SESSIONS_REVOKED",
    entityType: "USER",
    entityId: id,
    summary: `${count} Sitzung${count === 1 ? "" : "en"} von „${user.name}“ beendet`,
  });
  return { revoked: count };
}
