import type { AuthUser } from "../middleware/auth.js";

import { Prisma } from "@prisma/client";

import { t } from "../i18n/index.js";
import { HttpError } from "../lib/errors.js";
import { hashPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { diff, recordAudit } from "./auditService.js";
import { assertGrantable, assertGroupManagerRemains, defaultGroupId } from "./groupService.js";
import { listMyRequests } from "./requestService.js";
import { endAllSessions } from "./sessionService.js";

const publicSelect = {
  id: true,
  name: true,
  email: true,
  authSource: true,
  createdAt: true,
  mustChangePassword: true,
  group: { select: { id: true, name: true } },
} as const;

export async function listUsers() {
  return prisma.user.findMany({
    select: publicSelect,
    orderBy: [{ group: { sortOrder: "asc" } }, { name: "asc" }],
  });
}

async function groupOrThrow(db: Prisma.TransactionClient | typeof prisma, id: string) {
  const group = await db.group.findUnique({ where: { id } });
  if (!group)
    throw new HttpError(
      400,
      t((m) => m.errors.groupNotFound)
    );
  return group;
}

/**
 * Working on someone with more rights (resetting their password, moving or deleting them) would be
 * a way to those rights: only people whose group has no permission beyond the actor's own.
 */
function assertNotAbove(actor: AuthUser, target: { group: { permissions: string[] } }): void {
  try {
    assertGrantable(actor, target.group.permissions);
  } catch {
    throw new HttpError(
      403,
      t((m) => m.errors.personAbove)
    );
  }
}

export async function createUser(
  input: { name: string; email: string; password: string; groupId?: string },
  actor: AuthUser
) {
  const group = await groupOrThrow(prisma, input.groupId ?? (await defaultGroupId()));
  assertGrantable(actor, group.permissions);
  try {
    const created = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash: await hashPassword(input.password),
        groupId: group.id,
        authSource: "LOCAL",
        // The admin knows this password: the person replaces it at the first login.
        mustChangePassword: true,
      },
      select: publicSelect,
    });
    await recordAudit({
      actorId: actor.id,
      action: "USER_CREATED",
      entityType: "USER",
      entityId: created.id,
      summary: { key: "audit.userCreated", params: { name: created.name } },
      details: {
        context: { "E-Mail": created.email, Gruppe: created.group.name, Anmeldung: "Lokal" },
      },
    });
    return created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(
        409,
        t((m) => m.errors.emailTaken)
      );
    }
    throw error;
  }
}

export async function updateUser(
  id: string,
  actor: AuthUser,
  input: { name?: string; groupId?: string; password?: string }
) {
  const passwordHash = input.password ? await hashPassword(input.password) : undefined;
  const { user, updated } = await serializable(async (tx) => {
    const before = await tx.user.findUnique({ where: { id }, include: { group: true } });
    if (!before)
      throw new HttpError(
        404,
        t((m) => m.errors.userNotFound)
      );
    if (id !== actor.id) assertNotAbove(actor, before);
    const moving = input.groupId !== undefined && input.groupId !== before.groupId;
    if (moving) {
      if (id === actor.id)
        throw new HttpError(
          409,
          t((m) => m.errors.ownGroup)
        );
      assertGrantable(actor, (await groupOrThrow(tx, input.groupId!)).permissions);
    }
    const after = await tx.user.update({
      where: { id },
      data: {
        name: input.name,
        groupId: moving ? input.groupId : undefined,
        passwordHash,
        authSource: passwordHash ? "LOCAL" : undefined,
        ldapDn: passwordHash ? null : undefined,
        mustChangePassword: passwordHash ? true : undefined,
      },
      select: publicSelect,
    });
    if (moving) await assertGroupManagerRemains(tx);
    // A reset password usually means the account was compromised, and a new group must apply now:
    // both end the sessions.
    if (passwordHash || moving) await endAllSessions(tx, { id });
    return { user: before, updated: after };
  });
  const moved = user.groupId !== updated.group.id;
  await recordAudit({
    actorId: actor.id,
    action: "USER_UPDATED",
    entityType: "USER",
    entityId: updated.id,
    summary: moved
      ? { key: "audit.userMoved", params: { name: updated.name, group: updated.group.name } }
      : { key: "audit.userUpdated", params: { name: updated.name } },
    details: {
      changes: [
        ...diff({ ...user, group: user.group.name }, { ...updated, group: updated.group.name }, [
          { key: "name", label: "Name" },
          { key: "group", label: "Gruppe" },
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

export async function deleteUser(id: string, actor: AuthUser) {
  if (id === actor.id)
    throw new HttpError(
      409,
      t((m) => m.errors.ownAccountDelete)
    );
  const user = await serializable(async (tx) => {
    const found = await tx.user.findUnique({
      where: { id },
      include: { group: true, _count: { select: { requests: true } } },
    });
    if (!found)
      throw new HttpError(
        404,
        t((m) => m.errors.userNotFound)
      );
    assertNotAbove(actor, found);
    if (found._count.requests > 0) {
      throw new HttpError(
        409,
        t((m) => m.errors.userHasRequests)
      );
    }
    await tx.user.delete({ where: { id } });
    await assertGroupManagerRemains(tx);
    return found;
  });
  await recordAudit({
    actorId: actor.id,
    action: "USER_DELETED",
    entityType: "USER",
    entityId: id,
    summary: { key: "audit.userDeleted", params: { name: user.name } },
    details: { context: { "E-Mail": user.email, Gruppe: user.group.name } },
  });
}

/**
 * Runs the group-manager check and the change it guards as one unit: two people removing each other
 * at the same moment would otherwise both see a second manager and leave none.
 */
async function serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(work, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new HttpError(
        409,
        t((m) => m.errors.userConcurrent)
      );
    }
    throw error;
  }
}

/**
 * Everything the admin profile page shows about one person.
 */
export async function getUserProfile(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: publicSelect });
  if (!user)
    throw new HttpError(
      404,
      t((m) => m.errors.userNotFound)
    );
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
    throw new HttpError(
      409,
      t((m) => m.errors.ownSession)
    );
  }
  const user = await prisma.user.findUnique({ where: { id }, select: { name: true } });
  if (!user)
    throw new HttpError(
      404,
      t((m) => m.errors.userNotFound)
    );
  const count = await endAllSessions(prisma, { id });
  await recordAudit({
    actorId,
    action: "USER_SESSIONS_REVOKED",
    entityType: "USER",
    entityId: id,
    summary: { key: "audit.sessionsRevoked", params: { count, name: user.name } },
  });
  return { revoked: count };
}
