import { Prisma } from "@prisma/client";

import { t } from "../i18n/index.js";
import { HttpError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { diff, recordAudit } from "./auditService.js";

export async function listCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}

export async function updateCategory(id: string, name: string, actorId: string) {
  try {
    const before = await prisma.category.findUnique({ where: { id } });
    if (!before)
      throw new HttpError(
        404,
        t((m) => m.errors.categoryNotFound)
      );
    const updated = await prisma.category.update({ where: { id }, data: { name } });
    await recordAudit({
      actorId,
      action: "CATEGORY_UPDATED",
      entityType: "CATEGORY",
      entityId: updated.id,
      summary:
        before.name === updated.name
          ? { key: "audit.categoryUnchanged", params: { name: updated.name } }
          : { key: "audit.categoryRenamed", params: { from: before.name, to: updated.name } },
      details: { changes: diff(before, updated, [{ key: "name", label: "Name" }]) },
    });
    return updated;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new HttpError(
        404,
        t((m) => m.errors.categoryNotFound)
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(
        409,
        t((m) => m.errors.categoryExists)
      );
    }
    throw error;
  }
}

export async function deleteCategory(id: string, actorId: string) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { devices: true } } },
  });
  if (!category)
    throw new HttpError(
      404,
      t((m) => m.errors.categoryNotFound)
    );
  if (category._count.devices > 0) {
    throw new HttpError(
      409,
      t((m) => m.errors.categoryInUse)
    );
  }
  // An emptied group scope would mean "all categories" and widen the group's rights: the group
  // must be changed first.
  const scoped = await prisma.group.findMany({
    where: {
      OR: [{ borrowCategoryIds: { has: id } }, { manageCategoryIds: { has: id } }],
    },
    select: { name: true },
  });
  if (scoped.length > 0) {
    throw new HttpError(
      409,
      t((m) => m.errors.categoryInGroupScope, {
        groups: scoped.map((group) => `„${group.name}“`).join(", "),
      })
    );
  }
  await prisma.category.delete({ where: { id } });
  await recordAudit({
    actorId,
    action: "CATEGORY_DELETED",
    entityType: "CATEGORY",
    entityId: id,
    summary: { key: "audit.categoryDeleted", params: { name: category.name } },
  });
}

export async function createCategory(name: string, actorId: string) {
  try {
    const created = await prisma.category.create({ data: { name } });
    await recordAudit({
      actorId,
      action: "CATEGORY_CREATED",
      entityType: "CATEGORY",
      entityId: created.id,
      summary: { key: "audit.categoryCreated", params: { name: created.name } },
    });
    return created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.category.findUnique({ where: { name } });
      if (existing) return existing;
    }
    throw error;
  }
}
