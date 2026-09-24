import { prisma } from "../lib/prisma.js";

export async function refreshUnitStatuses(deviceId?: string) {
  const now = new Date();
  const units = await prisma.deviceUnit.findMany({
    where: {
      status: { not: "DEFECTIVE" },
      ...(deviceId ? { deviceId } : {}),
    },
    select: { id: true, status: true },
  });
  if (units.length === 0) return;
  const active = await prisma.borrowRequest.findMany({
    where: {
      status: "APPROVED",
      unitId: { in: units.map((unit) => unit.id) },
      startsAt: { lte: now },
      desiredUntil: { gt: now },
    },
    select: { unitId: true },
  });
  const busy = new Set(active.map((row) => row.unitId));
  await Promise.all(
    units
      .filter((unit) => (busy.has(unit.id) ? "BORROWED" : "AVAILABLE") !== unit.status)
      .map(async (unit) =>
        prisma.deviceUnit.update({
          where: { id: unit.id },
          data: { status: busy.has(unit.id) ? "BORROWED" : "AVAILABLE" },
        })
      )
  );
}
