import { prisma } from "../lib/prisma.js";
import { getMaintenance } from "./maintenanceService.js";

export async function adminSummary() {
  const [users, categories, units, openRequests, activeLoans] = await Promise.all([
    prisma.user.count(),
    prisma.category.count(),
    prisma.deviceUnit.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.borrowRequest.count({ where: { status: "OPEN" } }),
    prisma.borrowRequest.count({ where: { status: "APPROVED" } }),
  ]);
  const byStatus = Object.fromEntries(units.map((row) => [row.status, row._count._all]));
  const deviceCount = await prisma.device.count();
  const maintenance = await getMaintenance();
  return {
    maintenance: maintenance.enabled,
    users,
    categories,
    devices: deviceCount,
    devicesAvailable: byStatus.AVAILABLE ?? 0,
    devicesBorrowed: byStatus.BORROWED ?? 0,
    devicesDefective: byStatus.DEFECTIVE ?? 0,
    openRequests,
    activeLoans,
  };
}
