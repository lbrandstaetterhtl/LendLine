import { HttpError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { fieldFilter, readFields } from "./deviceService.js";

function parseLocal(value: string, label: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `${label} ist ungültig`);
  return date;
}

export async function searchFreeUnits(input: {
  startsAt: string;
  desiredUntil: string;
  categoryId?: string;
  q?: string;
  field?: string;
  value?: string;
  /**
   * Categories the caller's group may borrow from; null = all.
   */
  scope?: string[] | null;
}) {
  const startsAt = parseLocal(input.startsAt, "Startzeit");
  const desiredUntil = parseLocal(input.desiredUntil, "Endzeit");
  if (desiredUntil <= startsAt)
    throw new HttpError(400, "Die Endzeit muss nach der Startzeit liegen");

  const units = await prisma.deviceUnit.findMany({
    where: {
      status: { not: "DEFECTIVE" },
      device: {
        AND: [
          { categoryId: input.categoryId || undefined },
          input.scope ? { categoryId: { in: input.scope } } : {},
        ],
        ...(input.q ? { name: { contains: input.q, mode: "insensitive" } } : {}),
        ...fieldFilter(input.field, input.value),
      },
    },
    include: {
      device: { include: { category: true, images: { orderBy: { createdAt: "asc" } } } },
    },
    orderBy: [{ device: { name: "asc" } }, { serialNumber: "asc" }],
  });
  const busy = await prisma.borrowRequest.findMany({
    where: {
      unitId: { in: units.map((unit) => unit.id) },
      status: { in: ["OPEN", "APPROVED"] },
      startsAt: { lt: desiredUntil },
      desiredUntil: { gt: startsAt },
    },
    select: { unitId: true },
  });
  const blocked = new Set(busy.map((row) => row.unitId));
  return units
    .filter((unit) => !blocked.has(unit.id))
    .map((unit) => ({
      unitId: unit.id,
      serialNumber: unit.serialNumber,
      deviceId: unit.device.id,
      name: unit.device.name,
      category: unit.device.category.name,
      description: unit.device.description,
      fields: readFields(unit.device.fields),
      images: unit.device.images.map((image) => ({
        id: image.id,
        url: `/api/uploads/devices/${image.fileName}`,
      })),
    }));
}
