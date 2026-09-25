import { Prisma } from "@prisma/client";

import { t } from "../i18n/index.js";
import { HttpError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { diff, recordAudit } from "./auditService.js";

export async function listRooms() {
  return prisma.room.findMany({ orderBy: { name: "asc" } });
}

export async function createRoom(
  input: { name: string; building: string; description: string },
  actorId: string
) {
  try {
    const created = await prisma.room.create({ data: input });
    await recordAudit({
      actorId,
      action: "ROOM_CREATED",
      entityType: "ROOM",
      entityId: created.id,
      summary: { key: "audit.roomCreated", params: { name: created.name } },
      details: { context: { Gebäude: created.building, Beschreibung: created.description } },
    });
    return created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(
        409,
        t((m) => m.errors.roomExists)
      );
    }
    throw error;
  }
}

export async function updateRoom(
  id: string,
  input: { name: string; building: string; description: string },
  actorId: string
) {
  try {
    const before = await prisma.room.findUnique({ where: { id } });
    if (!before)
      throw new HttpError(
        404,
        t((m) => m.errors.roomNotFound)
      );
    const updated = await prisma.room.update({ where: { id }, data: input });
    await recordAudit({
      actorId,
      action: "ROOM_UPDATED",
      entityType: "ROOM",
      entityId: updated.id,
      summary: { key: "audit.roomUpdated", params: { name: updated.name } },
      details: {
        changes: diff(before, updated, [
          { key: "name", label: "Name" },
          { key: "building", label: "Gebäude" },
          { key: "description", label: "Beschreibung" },
        ]),
      },
    });
    return updated;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")
      throw new HttpError(
        404,
        t((m) => m.errors.roomNotFound)
      );
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new HttpError(
        409,
        t((m) => m.errors.roomExists)
      );
    throw error;
  }
}

export async function deleteRoom(id: string, actorId: string) {
  const room = await prisma.room.findUnique({
    where: { id },
    include: { _count: { select: { requests: true } } },
  });
  if (!room)
    throw new HttpError(
      404,
      t((m) => m.errors.roomNotFound)
    );
  if (room._count.requests > 0)
    throw new HttpError(
      409,
      t((m) => m.errors.roomInUse)
    );
  await prisma.room.delete({ where: { id } });
  await recordAudit({
    actorId,
    action: "ROOM_DELETED",
    entityType: "ROOM",
    entityId: id,
    summary: { key: "audit.roomDeleted", params: { name: room.name } },
    details: { context: { Gebäude: room.building, Beschreibung: room.description } },
  });
}
