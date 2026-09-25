import type { AuthUser } from "../middleware/auth.js";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { config } from "../config.js";
import { HttpError } from "../lib/errors.js";
import { allPermissions, permissionSections, withImplied } from "../lib/permissions.js";
import { prisma } from "../lib/prisma.js";
import { recordAudit } from "./auditService.js";
import { normalizeDn } from "./ldapService.js";

type Db = typeof prisma | Prisma.TransactionClient;

export const groupInputSchema = z.object({
  name: z.string().trim().min(2, "Name muss mindestens 2 Zeichen haben").max(60),
  description: z.string().trim().max(300).default(""),
  permissions: z.array(z.string().max(60)).max(100).default([]),
  borrowCategoryIds: z.array(z.string().max(60)).max(200).default([]),
  manageCategoryIds: z.array(z.string().max(60)).max(200).default([]),
  maxDays: z.number().int().min(1).max(365).nullable().default(null),
  maxOpenPerUser: z.number().int().min(1).max(100).nullable().default(null),
  autoApprove: z.boolean().nullable().default(null),
  ldapGroupDns: z
    .array(
      z
        .string()
        .trim()
        .max(300)
        .refine(
          (dn) => /^cn=/i.test(dn) && dn.includes(","),
          "Verzeichnisgruppen als vollständige DN angeben"
        )
    )
    .max(20)
    .default([]),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});
type GroupInput = z.infer<typeof groupInputSchema>;

const permissionLabel = new Map<string, string>(
  permissionSections.flatMap((section) =>
    section.permissions.map((permission) => [permission.key, permission.label] as const)
  )
);

export function permissionCatalog() {
  return permissionSections;
}

export async function listGroups() {
  const groups = await prisma.group.findMany({
    include: { _count: { select: { users: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return groups.map(({ _count, ...group }) => ({
    ...group,
    permissions: withImplied(group.permissions),
    members: _count.users,
  }));
}

/**
 * Where new accounts land: the group marked as default, else the first one.
 */
export async function defaultGroupId(db: Db = prisma): Promise<string> {
  const group =
    (await db.group.findFirst({ where: { isDefault: true } })) ??
    (await db.group.findFirst({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }));
  if (!group) throw new HttpError(500, "Es gibt keine Benutzergruppe");
  return group.id;
}

/**
 * The group a directory user belongs in, from their `memberOf`. Groups with directory DNs are
 * checked in their order; `LDAP_ADMIN_GROUP` still maps to the built-in "Verwaltung" group. As soon
 * as any mapping exists, a user without a matching membership goes to the default group, so a
 * removal in the directory also removes the rights here.
 */
export async function groupForDirectoryUser(
  memberOf: string[],
  current: string | null
): Promise<string> {
  const memberships = new Set(memberOf);
  const groups = await prisma.group.findMany({
    where: { ldapGroupDns: { isEmpty: false } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const match = groups.find((group) =>
    group.ldapGroupDns.some((dn) => memberships.has(normalizeDn(dn)))
  );
  if (match) return match.id;
  const adminDns = config.ldap.adminGroups.map(normalizeDn);
  if (adminDns.some((dn) => memberships.has(dn))) {
    const admin = await prisma.group.findUnique({ where: { id: "group-admin" } });
    if (admin) return admin.id;
  }
  if (groups.length > 0 || adminDns.length > 0 || !current) return defaultGroupId();
  return current;
}

/**
 * Nobody hands out more than they have: every permission of the target group must be one the acting
 * person holds. Used for editing groups and for putting people into groups.
 */
export function assertGrantable(
  actor: AuthUser,
  permissions: Iterable<string>,
  before: Iterable<string> = []
): void {
  const had = new Set(withImplied(before));
  const missing = withImplied(permissions).filter(
    (permission) => !had.has(permission) && !actor.permissions.has(permission)
  );
  if (missing.length > 0) {
    throw new HttpError(
      403,
      `Diese Rechte haben Sie selbst nicht und können sie nicht vergeben: ${missing
        .map((permission) => permissionLabel.get(permission) ?? permission)
        .join(", ")}`
    );
  }
}

/**
 * Somebody must always be able to manage groups, or no one could ever fix the rights again.
 */
export async function assertGroupManagerRemains(db: Db): Promise<void> {
  const managers = await db.user.count({
    where: { group: { permissions: { has: "groups.manage" } } },
  });
  if (managers === 0) {
    throw new HttpError(
      409,
      "Danach könnte niemand mehr Gruppen verwalten. Mindestens eine Person muss das Recht „Gruppen und Rechte verwalten“ behalten."
    );
  }
}

async function serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(work, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2034") {
        throw new HttpError(
          409,
          "Die Gruppe wurde gerade anderweitig geändert. Bitte erneut versuchen."
        );
      }
      if (error.code === "P2002")
        throw new HttpError(409, "Eine Gruppe mit diesem Namen gibt es schon");
    }
    throw error;
  }
}

/**
 * Stored form: known permissions with everything they imply, only existing categories.
 */
async function normalize(input: GroupInput) {
  const categories = new Set(
    (await prisma.category.findMany({ select: { id: true } })).map((category) => category.id)
  );
  return {
    ...input,
    permissions: withImplied(input.permissions),
    borrowCategoryIds: input.borrowCategoryIds.filter((id) => categories.has(id)),
    manageCategoryIds: input.manageCategoryIds.filter((id) => categories.has(id)),
  };
}

function describeChanges(before: GroupInput | null, after: GroupInput) {
  const old = new Set(before?.permissions ?? []);
  const next = new Set(after.permissions);
  const label = (permission: string) => permissionLabel.get(permission) ?? permission;
  const plain = (key: keyof GroupInput, field: string) => {
    const from = before ? JSON.stringify(before[key]) : null;
    const to = JSON.stringify(after[key]);
    return from === to ? [] : [{ field, from, to }];
  };
  return [
    ...plain("name", "Name"),
    ...plain("description", "Beschreibung"),
    ...allPermissions
      .filter((permission) => old.has(permission) !== next.has(permission))
      .map((permission) => ({
        field: label(permission),
        from: old.has(permission) ? "ja" : "nein",
        to: next.has(permission) ? "ja" : "nein",
      })),
    ...plain("borrowCategoryIds", "Ausleihen aus Kategorien"),
    ...plain("manageCategoryIds", "Verwaltet Kategorien"),
    ...plain("maxDays", "Höchstdauer (Tage)"),
    ...plain("maxOpenPerUser", "Offene Anfragen pro Person"),
    ...plain("autoApprove", "Automatisch bestätigen"),
    ...plain("ldapGroupDns", "Verzeichnisgruppen"),
    ...plain("isDefault", "Standardgruppe"),
  ];
}

export async function createGroup(input: GroupInput, actor: AuthUser) {
  const data = await normalize(input);
  assertGrantable(actor, data.permissions);
  const group = await serializable(async (tx) => {
    if (data.isDefault) await tx.group.updateMany({ data: { isDefault: false } });
    return tx.group.create({ data });
  });
  await recordAudit({
    actorId: actor.id,
    action: "GROUP_CREATED",
    entityType: "GROUP",
    entityId: group.id,
    summary: `Gruppe „${group.name}“ mit ${group.permissions.length} Rechten angelegt`,
    details: { changes: describeChanges(null, data) },
  });
  return group;
}

export async function updateGroup(id: string, input: GroupInput, actor: AuthUser) {
  const data = await normalize(input);
  const { before, after } = await serializable(async (tx) => {
    const existing = await tx.group.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Gruppe nicht gefunden");
    assertGrantable(actor, data.permissions, existing.permissions);
    if (existing.isDefault && !data.isDefault) {
      throw new HttpError(
        409,
        "Eine Standardgruppe muss es immer geben. Legen Sie eine andere Gruppe als Standard fest."
      );
    }
    if (data.isDefault && !existing.isDefault) {
      await tx.group.updateMany({ data: { isDefault: false } });
    }
    const updated = await tx.group.update({ where: { id }, data });
    await assertGroupManagerRemains(tx);
    return { before: existing, after: updated };
  });
  const changes = describeChanges(
    { ...before, permissions: withImplied(before.permissions) },
    data
  );
  await recordAudit({
    actorId: actor.id,
    action: "GROUP_UPDATED",
    entityType: "GROUP",
    entityId: id,
    summary: `Gruppe „${after.name}“ geändert`,
    details: { changes },
  });
  return after;
}

/**
 * Members move to `moveTo` first; a group with members cannot simply vanish.
 */
export async function deleteGroup(id: string, moveTo: string | undefined, actor: AuthUser) {
  const { group, moved, target } = await serializable(async (tx) => {
    const existing = await tx.group.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!existing) throw new HttpError(404, "Gruppe nicht gefunden");
    if (existing.isDefault) {
      throw new HttpError(409, "Die Standardgruppe kann nicht gelöscht werden");
    }
    let targetGroup = null;
    if (existing._count.users > 0) {
      if (!moveTo || moveTo === id) {
        throw new HttpError(
          409,
          "Die Gruppe hat Mitglieder. Bitte eine Gruppe wählen, in die sie wechseln."
        );
      }
      targetGroup = await tx.group.findUnique({ where: { id: moveTo } });
      if (!targetGroup) throw new HttpError(404, "Zielgruppe nicht gefunden");
      assertGrantable(actor, targetGroup.permissions);
      await tx.user.updateMany({ where: { groupId: id }, data: { groupId: moveTo } });
    }
    await tx.group.delete({ where: { id } });
    await assertGroupManagerRemains(tx);
    return { group: existing, moved: existing._count.users, target: targetGroup };
  });
  await recordAudit({
    actorId: actor.id,
    action: "GROUP_DELETED",
    entityType: "GROUP",
    entityId: id,
    summary: `Gruppe „${group.name}“ gelöscht`,
    details: {
      context: {
        Mitglieder: String(moved),
        ...(target ? { "Gewechselt zu": target.name } : {}),
      },
    },
  });
}
