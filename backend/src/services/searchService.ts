import { HttpError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

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
}) {
  const startsAt = parseLocal(input.startsAt, "Startzeit");
  const desiredUntil = parseLocal(input.desiredUntil, "Endzeit");
  if (desiredUntil <= startsAt)
    throw new HttpError(400, "Die Endzeit muss nach der Startzeit liegen");

  const units = await prisma.deviceUnit.findMany({
    where: {
      status: { not: "DEFECTIVE" },
      device: {
        categoryId: input.categoryId || undefined,
        ...(input.q ? { name: { contains: input.q, mode: "insensitive" } } : {}),
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
      images: unit.device.images.map((image) => ({
        id: image.id,
        url: `/api/uploads/devices/${image.fileName}`,
      })),
    }));
}
