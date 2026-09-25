import type { AuditChange } from "./auditService.js";
import type { DeviceStatus } from "@prisma/client";

import { Prisma } from "@prisma/client";

import { de } from "../i18n/de.js";
import { format, t } from "../i18n/index.js";
import { HttpError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { diff, recordAudit } from "./auditService.js";
import { deleteDeviceFiles } from "./imageService.js";
import { refreshUnitStatuses } from "./unitStatus.js";

const deviceInclude = {
  category: true,
  images: { orderBy: { createdAt: "asc" as const } },
  units: { orderBy: { serialNumber: "asc" as const } },
} as const;

type UnitInput = { id?: string; serialNumber: string; status: "AVAILABLE" | "DEFECTIVE" };

export type DeviceField = { name: string; value: string };

export function readFields(value: Prisma.JsonValue): DeviceField[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    item &&
    typeof item === "object" &&
    !Array.isArray(item) &&
    typeof item.name === "string" &&
    typeof item.value === "string"
      ? [{ name: item.name, value: item.value }]
      : []
  );
}

/**
 * Prisma filter for "has this property with this value" (JSONB containment).
 */
export function fieldFilter(field?: string, value?: string): Prisma.DeviceWhereInput {
  return field && value ? { fields: { array_contains: [{ name: field, value }] } } : {};
}

/**
 * Audit entries for added, changed and removed properties.
 */
function compareFields(before: DeviceField[], after: DeviceField[]): AuditChange[] {
  const old = new Map(before.map((field) => [field.name, field.value]));
  const next = new Map(after.map((field) => [field.name, field.value]));
  return [...new Set([...old.keys(), ...next.keys()])]
    .filter((name) => old.get(name) !== next.get(name))
    .map((name) => ({ field: name, from: old.get(name) ?? null, to: next.get(name) ?? null }));
}

function counts(units: { status: DeviceStatus }[]) {
  return {
    quantityTotal: units.length,
    quantityAvailable: units.filter((unit) => unit.status === "AVAILABLE").length,
    quantityBorrowed: units.filter((unit) => unit.status === "BORROWED").length,
    quantityDefective: units.filter((unit) => unit.status === "DEFECTIVE").length,
  };
}

type DeviceWithRelations = Prisma.DeviceGetPayload<{ include: typeof deviceInclude }>;

function toPublic(device: DeviceWithRelations, includePieces: boolean) {
  // Normal users never see defective pieces, not even in the totals.
  const stock = counts(
    includePieces ? device.units : device.units.filter((unit) => unit.status !== "DEFECTIVE")
  );
  return {
    id: device.id,
    name: device.name,
    categoryId: device.categoryId,
    description: device.description,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
    category: device.category.name,
    fields: readFields(device.fields),
    quantityTotal: stock.quantityTotal,
    quantityAvailable: stock.quantityAvailable,
    units: includePieces
      ? device.units
      : device.units
          .filter((unit) => unit.status === "AVAILABLE")
          .map((unit) => ({ id: unit.id, serialNumber: unit.serialNumber, status: unit.status })),
    ...(includePieces
      ? {
          quantityBorrowed: stock.quantityBorrowed,
          quantityDefective: stock.quantityDefective,
        }
      : {}),
    images: device.images.map((image) => ({
      id: image.id,
      url: `/api/uploads/devices/${image.fileName}`,
    })),
  };
}

export async function listDevices(
  filter: { categoryId?: string; status?: DeviceStatus | ""; field?: string; value?: string },
  includePieces: boolean,
  /**
   * Categories the caller may see; null = all.
   */
  scope: string[] | null = null
) {
  if (!includePieces && filter.status === "DEFECTIVE") return [];
  await refreshUnitStatuses();
  const unitFilter: Prisma.DeviceUnitListRelationFilter | undefined = filter.status
    ? { some: { status: filter.status } }
    : includePieces
      ? undefined
      : { some: { status: { not: "DEFECTIVE" } } };
  const rows = await prisma.device.findMany({
    where: {
      AND: [
        { categoryId: filter.categoryId || undefined },
        scope ? { categoryId: { in: scope } } : {},
      ],
      units: unitFilter,
      ...fieldFilter(filter.field, filter.value),
    },
    include: deviceInclude,
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  });
  return rows.map((row) => toPublic(row, includePieces));
}

async function assertCategory(categoryId: string) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category)
    throw new HttpError(
      400,
      t((m) => m.errors.categoryNotFound)
    );
}

function assertUniqueSerials(units: UnitInput[]) {
  const serials = units.map((unit) => unit.serialNumber.toLowerCase());
  if (new Set(serials).size !== serials.length) {
    throw new HttpError(
      400,
      t((m) => m.errors.serialsUnique)
    );
  }
}

export async function createDevice(
  input: {
    name: string;
    categoryId: string;
    description: string;
    units: UnitInput[];
    fields: DeviceField[];
  },
  actorId: string
) {
  await assertCategory(input.categoryId);
  assertUniqueSerials(input.units);
  if (input.units.some((unit) => (unit.status as string) === "BORROWED")) {
    throw new HttpError(
      400,
      t((m) => m.errors.borrowedOnlyByRequest)
    );
  }
  try {
    const device = await prisma.device.create({
      data: {
        name: input.name,
        categoryId: input.categoryId,
        description: input.description,
        fields: input.fields,
        units: {
          create: input.units.map((unit) => ({
            serialNumber: unit.serialNumber,
            status: unit.status,
          })),
        },
      },
      include: deviceInclude,
    });
    const created = toPublic(device, true);
    await recordAudit({
      actorId,
      action: "DEVICE_CREATED",
      entityType: "DEVICE",
      entityId: created.id,
      summary: {
        key: "audit.deviceCreated",
        params: { name: created.name, count: created.quantityTotal },
      },
      details: {
        context: {
          Kategorie: created.category,
          Stücke: unitList(device.units),
          Beschreibung: created.description,
          ...Object.fromEntries(created.fields.map((field) => [field.name, field.value])),
        },
      },
    });
    return created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(
        409,
        t((m) => m.errors.serialTaken)
      );
    }
    throw error;
  }
}

export async function updateDevice(
  id: string,
  input: {
    name?: string;
    categoryId?: string;
    description?: string;
    units?: UnitInput[];
    fields?: DeviceField[];
  },
  actorId: string
) {
  const device = await prisma.device.findUnique({
    where: { id },
    include: { units: true, category: true },
  });
  if (!device)
    throw new HttpError(
      404,
      t((m) => m.errors.deviceNotFound)
    );
  if (input.categoryId) await assertCategory(input.categoryId);
  if (input.units) assertUniqueSerials(input.units);

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (input.units) {
        const incomingIds = new Set(input.units.flatMap((unit) => (unit.id ? [unit.id] : [])));
        for (const existing of device.units) {
          if (!incomingIds.has(existing.id)) {
            if (existing.status === "BORROWED") {
              throw new HttpError(
                409,
                t((m) => m.errors.unitBorrowedCannotRemove, { serial: existing.serialNumber })
              );
            }
            const used = await tx.borrowRequest.count({ where: { unitId: existing.id } });
            if (used > 0) {
              throw new HttpError(
                409,
                t((m) => m.errors.unitHasLoans, { serial: existing.serialNumber })
              );
            }
            await tx.deviceUnit.delete({ where: { id: existing.id } });
          }
        }
        for (const unit of input.units) {
          if (!unit.id) {
            if ((unit.status as string) === "BORROWED") {
              throw new HttpError(
                400,
                t((m) => m.errors.borrowedOnlyByRequest)
              );
            }
            await tx.deviceUnit.create({
              data: { deviceId: id, serialNumber: unit.serialNumber, status: unit.status },
            });
            continue;
          }
          const existing = device.units.find((item) => item.id === unit.id);
          if (!existing || existing.deviceId !== id)
            throw new HttpError(
              400,
              t((m) => m.errors.unitNotOfDevice)
            );
          if (existing.status === "BORROWED") {
            await tx.deviceUnit.update({
              where: { id: existing.id },
              data: { serialNumber: unit.serialNumber },
            });
            continue;
          }
          if ((unit.status as string) === "BORROWED") {
            throw new HttpError(
              400,
              t((m) => m.errors.borrowedOnlyByRequest)
            );
          }
          await tx.deviceUnit.update({
            where: { id: existing.id },
            data: { serialNumber: unit.serialNumber, status: unit.status },
          });
        }
      }
      return tx.device.update({
        where: { id },
        data: {
          name: input.name,
          categoryId: input.categoryId,
          description: input.description,
          fields: input.fields,
        },
        include: deviceInclude,
      });
    });
    const result = toPublic(updated, true);
    const unitChanges = compareUnits(device.units, updated.units);
    await recordAudit({
      actorId,
      action: "DEVICE_UPDATED",
      entityType: "DEVICE",
      entityId: result.id,
      summary: { key: "audit.deviceUpdated", params: { name: result.name } },
      details: {
        changes: [
          ...diff(
            { name: device.name, category: device.category.name, description: device.description },
            {
              name: updated.name,
              category: updated.category.name,
              description: updated.description,
            },
            [
              { key: "name", label: "Name" },
              { key: "category", label: "Kategorie" },
              { key: "description", label: "Beschreibung" },
            ]
          ),
          ...compareFields(readFields(device.fields), result.fields),
          ...unitChanges,
        ],
        context: {
          Bestand: format(
            de.auditPatterns.stock,
            { total: result.quantityTotal, available: result.quantityAvailable },
            "de"
          ),
        },
      },
    });
    return result;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(
        409,
        t((m) => m.errors.serialTaken)
      );
    }
    throw error;
  }
}

export async function deviceCalendar(deviceId: string, includeNames: boolean) {
  await refreshUnitStatuses(deviceId);
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    include: { units: { orderBy: { serialNumber: "asc" } } },
  });
  if (!device)
    throw new HttpError(
      404,
      t((m) => m.errors.deviceNotFound)
    );
  const bookings = await prisma.borrowRequest.findMany({
    where: {
      deviceId,
      status: { in: ["OPEN", "APPROVED", "RETURNED"] },
      unitId: { not: null },
    },
    include: { user: { select: { name: true } } },
    orderBy: { startsAt: "asc" },
  });
  return {
    deviceId: device.id,
    name: device.name,
    units: device.units
      .filter((unit) => includeNames || unit.status !== "DEFECTIVE")
      .map((unit) => ({
        id: unit.id,
        serialNumber: unit.serialNumber,
        status: unit.status,
        bookings: bookings
          .filter((booking) => booking.unitId === unit.id)
          .map((booking) => ({
            id: booking.id,
            startsAt: booking.startsAt,
            endsAt:
              booking.status === "RETURNED" && booking.returnedAt
                ? booking.returnedAt
                : booking.desiredUntil,
            state: booking.status,
            ...(includeNames ? { borrower: booking.user.name } : {}),
          })),
      })),
  };
}

export async function deleteDevice(id: string, actorId: string): Promise<void> {
  const device = await prisma.device.findUnique({
    where: { id },
    include: { units: true, category: true, _count: { select: { requests: true } } },
  });
  if (!device)
    throw new HttpError(
      404,
      t((m) => m.errors.deviceNotFound)
    );
  if (device.units.some((unit) => unit.status === "BORROWED") || device._count.requests > 0) {
    throw new HttpError(
      409,
      t((m) => m.errors.deviceInUse)
    );
  }
  await deleteDeviceFiles(id);
  await prisma.device.delete({ where: { id } });
  await recordAudit({
    actorId,
    action: "DEVICE_DELETED",
    entityType: "DEVICE",
    entityId: id,
    summary: { key: "audit.deviceDeleted", params: { name: device.name } },
    details: { context: { Kategorie: device.category.name, Stücke: unitList(device.units) } },
  });
}

const statusLabel: Record<DeviceStatus, string> = {
  AVAILABLE: "Verfügbar",
  BORROWED: "Ausgeliehen",
  DEFECTIVE: "Defekt",
};

/**
 * The pieces with their status for the audit log, e.g. "LT-1001 (Verfügbar), LT-1002 (Defekt)".
 */
function unitList(units: { serialNumber: string; status: DeviceStatus }[]): string {
  return units
    .map((unit) => `${unit.serialNumber} (${statusLabel[unit.status]})`)
    .toSorted((a, b) => a.localeCompare(b, "de"))
    .join(", ");
}

type UnitSnapshot = { id: string; serialNumber: string; status: DeviceStatus };

const unitField = (serial: string) => format(de.auditPatterns.unit, { serial }, "de");

/**
 * Per-piece changes for the audit log.
 */
function compareUnits(before: UnitSnapshot[], after: UnitSnapshot[]) {
  const changes: AuditChange[] = [];
  const afterById = new Map(after.map((unit) => [unit.id, unit]));
  const beforeIds = new Set(before.map((unit) => unit.id));

  for (const old of before) {
    const now = afterById.get(old.id);
    if (!now) {
      changes.push({
        field: unitField(old.serialNumber),
        from: statusLabel[old.status],
        to: "entfernt",
      });
      continue;
    }
    if (now.serialNumber !== old.serialNumber) {
      changes.push({ field: "Seriennummer", from: old.serialNumber, to: now.serialNumber });
    }
    if (now.status !== old.status) {
      changes.push({
        field: unitField(now.serialNumber),
        from: statusLabel[old.status],
        to: statusLabel[now.status],
      });
    }
  }
  for (const unit of after.filter((item) => !beforeIds.has(item.id))) {
    changes.push({
      field: unitField(unit.serialNumber),
      from: null,
      to: format(de.auditPatterns.newUnit, { status: statusLabel[unit.status] }, "de"),
    });
  }

  return changes;
}

/**
 * Property names with the values in use, for suggestions in the editor and the filters.
 */
export async function fieldOptions(): Promise<{ name: string; values: string[] }[]> {
  const rows = await prisma.device.findMany({ select: { fields: true } });
  const byName = new Map<string, Set<string>>();
  for (const field of rows.flatMap((row) => readFields(row.fields))) {
    const values = byName.get(field.name) ?? new Set<string>();
    values.add(field.value);
    byName.set(field.name, values);
  }
  const sort = (a: string, b: string) => a.localeCompare(b, "de", { numeric: true });
  return [...byName.entries()]
    .map(([name, values]) => ({ name, values: [...values].toSorted(sort) }))
    .toSorted((a, b) => sort(a.name, b.name));
}
