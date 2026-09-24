import { Prisma } from "@prisma/client";

import { HttpError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { diff, recordAudit } from "./auditService.js";

export async function listCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}

export async function updateCategory(id: string, name: string, actorId: string) {
  try {
    const before = await prisma.category.findUnique({ where: { id } });
    if (!before) throw new HttpError(404, "Kategorie nicht gefunden");
    const updated = await prisma.category.update({ where: { id }, data: { name } });
    await recordAudit({
      actorId,
      action: "CATEGORY_UPDATED",
      entityType: "CATEGORY",
      entityId: updated.id,
      summary:
        before.name === updated.name
          ? `Kategorie „${updated.name}“ gespeichert (keine Änderung)`
          : `Kategorie „${before.name}“ in „${updated.name}“ umbenannt`,
      details: { changes: diff(before, updated, [{ key: "name", label: "Name" }]) },
    });
    return updated;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new HttpError(404, "Kategorie nicht gefunden");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "Diese Kategorie gibt es bereits");
    }
    throw error;
  }
}

export async function deleteCategory(id: string, actorId: string) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { devices: true } } },
  });
  if (!category) throw new HttpError(404, "Kategorie nicht gefunden");
  if (category._count.devices > 0) {
    throw new HttpError(409, "Kategorie wird von Geräten verwendet und kann nicht gelöscht werden");
  }
  await prisma.category.delete({ where: { id } });
  await recordAudit({
    actorId,
    action: "CATEGORY_DELETED",
    entityType: "CATEGORY",
    entityId: id,
    summary: `Kategorie „${category.name}“ gelöscht`,
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
      summary: `Kategorie „${created.name}“ angelegt`,
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
