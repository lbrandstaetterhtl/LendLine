import type { MailMessage } from "../emails/format.js";
import type { RequestStatus } from "@prisma/client";

import { Prisma } from "@prisma/client";

import { formatDate } from "../emails/format.js";
import { sendMail } from "../emails/mailer.js";
import { deviceReturnedTemplate } from "../emails/templates/deviceReturned.js";
import { requestApprovedTemplate } from "../emails/templates/requestApproved.js";
import { requestRejectedTemplate } from "../emails/templates/requestRejected.js";
import { HttpError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { formatPeriod, recordAudit } from "./auditService.js";
import { refreshUnitStatuses } from "./unitStatus.js";

const requestInclude = {
  user: { select: { id: true, name: true, email: true } },
  unit: { select: { id: true, serialNumber: true, status: true } },
  room: { select: { id: true, name: true, building: true } },
  device: { select: { id: true, name: true, category: { select: { name: true } } } },
} as const;

type PendingMail = { to: string; message: MailMessage };

function mailDevice(device: { name: string; category: { name: string } }, serialNumber: string) {
  return { name: device.name, category: device.category.name, serialNumber };
}

function presentRequest<
  T extends {
    device: { id: string; name: string; category: { name: string } };
    unit: { serialNumber: string; status: "AVAILABLE" | "BORROWED" | "DEFECTIVE" } | null;
  },
>(row: T) {
  return {
    ...row,
    device: {
      id: row.device.id,
      name: row.device.name,
      category: row.device.category.name,
      serialNumber: row.unit?.serialNumber ?? "–",
      status: row.unit?.status ?? "AVAILABLE",
    },
  };
}

function parseLocalDateTime(value: string, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `${label} ist ungültig`);
  return date;
}

async function dispatch(mails: PendingMail[]): Promise<void> {
  for (const mail of mails) {
    try {
      await sendMail(mail.to, mail.message);
    } catch (error) {
      console.error("E-Mail-Versand fehlgeschlagen", error);
    }
  }
}

export async function createRequest(
  userId: string,
  input: { unitId: string; roomId: string; startsAt: string; desiredUntil: string; comment: string }
) {
  const startsAt = parseLocalDateTime(input.startsAt, "Startzeit");
  const desiredUntil = parseLocalDateTime(input.desiredUntil, "Endzeit");
  if (desiredUntil <= startsAt)
    throw new HttpError(400, "Die Endzeit muss nach der Startzeit liegen");
  if (desiredUntil.getTime() < Date.now())
    throw new HttpError(400, "Die Endzeit muss in der Zukunft liegen");
  try {
    return await prisma.$transaction(
      async (tx) => {
        const unit = await tx.deviceUnit.findUnique({
          where: { id: input.unitId },
          include: { device: true },
        });
        if (!unit) throw new HttpError(404, "Stück nicht gefunden");
        if (unit.status === "DEFECTIVE")
          throw new HttpError(409, "Defekte Stücke können nicht angefragt werden");
        const room = await tx.room.findUnique({ where: { id: input.roomId } });
        if (!room) throw new HttpError(404, "Raum nicht gefunden");
        const overlapping = await tx.borrowRequest.count({
          where: {
            unitId: unit.id,
            status: { in: ["OPEN", "APPROVED"] },
            startsAt: { lt: desiredUntil },
            desiredUntil: { gt: startsAt },
          },
        });
        if (overlapping > 0)
          throw new HttpError(409, "Dieses Stück ist im Zeitraum schon vergeben oder angefragt");
        const created = await tx.borrowRequest.create({
          data: {
            userId,
            deviceId: unit.deviceId,
            unitId: unit.id,
            roomId: room.id,
            startsAt,
            desiredUntil,
            comment: input.comment,
          },
          include: requestInclude,
        });
        const presented = presentRequest(created);
        await recordAudit({
          actorId: userId,
          action: "REQUEST_CREATED",
          entityType: "REQUEST",
          entityId: presented.id,
          summary: `Ausleihe von „${presented.device.name}“ (${presented.device.serialNumber}) angefragt`,
          details: { context: auditContext(presented) },
        });
        return presented;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new HttpError(
        409,
        "Das Gerät wurde gerade anderweitig angefragt. Bitte erneut versuchen."
      );
    }
    throw error;
  }
}

export async function listMyRequests(userId: string) {
  const rows = await prisma.borrowRequest.findMany({
    where: { userId },
    include: requestInclude,
    orderBy: { requestedAt: "desc" },
  });
  return rows.map(presentRequest);
}

export async function listRequests(status?: RequestStatus) {
  const rows = await prisma.borrowRequest.findMany({
    where: status ? { status } : undefined,
    include: requestInclude,
    orderBy: { requestedAt: "asc" },
  });
  return rows.map(presentRequest);
}

export async function approveRequest(id: string, actorId: string) {
  const mails: PendingMail[] = [];
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.borrowRequest.findUnique({
      where: { id },
      include: requestInclude,
    });
    if (!current) throw new HttpError(404, "Anfrage nicht gefunden");
    if (current.status !== "OPEN")
      throw new HttpError(409, "Nur offene Anfragen können bestätigt werden");

    if (!current.unitId || !current.unit) throw new HttpError(409, "Anfrage hat kein Stück");
    const conflict = await tx.borrowRequest.findFirst({
      where: {
        id: { not: current.id },
        unitId: current.unitId,
        status: { in: ["OPEN", "APPROVED"] },
        startsAt: { lt: current.desiredUntil },
        desiredUntil: { gt: current.startsAt },
      },
    });
    if (conflict) throw new HttpError(409, "Dieses Stück ist im Zeitraum nicht mehr frei");
    if (current.unit.status === "DEFECTIVE") throw new HttpError(409, "Stück ist defekt");
    const unit = current.unit;

    const approvedAt = new Date();
    const changed = await tx.borrowRequest.updateMany({
      where: { id, status: "OPEN" },
      data: { status: "APPROVED", approvedAt },
    });
    if (changed.count !== 1) throw new HttpError(409, "Anfrage wurde bereits bearbeitet");

    mails.push({
      to: current.user.email,
      message: requestApprovedTemplate({
        recipientName: current.user.name,
        device: mailDevice(current.device, unit.serialNumber),
        startsAt: current.startsAt,
        desiredUntil: current.desiredUntil,
        roomName: current.room.name,
      }),
    });

    return tx.borrowRequest.findUniqueOrThrow({ where: { id }, include: requestInclude });
  });

  await refreshUnitStatuses(updated.deviceId);
  await dispatch(mails);
  const result = presentRequest(updated);
  await recordAudit({
    actorId,
    action: "REQUEST_APPROVED",
    entityType: "REQUEST",
    entityId: result.id,
    summary: `Ausleihe von „${result.device.name}“ (${result.device.serialNumber}) für ${result.user.name} bestätigt`,
    details: {
      changes: [{ field: "Status", from: "Offen", to: "Bestätigt" }],
      context: auditContext(result),
    },
  });
  return result;
}

export async function rejectRequest(id: string, rejectionReason: string, actorId: string) {
  const current = await prisma.borrowRequest.findUnique({ where: { id }, include: requestInclude });
  if (!current) throw new HttpError(404, "Anfrage nicht gefunden");
  if (current.status !== "OPEN")
    throw new HttpError(409, "Nur offene Anfragen können abgelehnt werden");

  const changed = await prisma.borrowRequest.updateMany({
    where: { id, status: "OPEN" },
    data: { status: "REJECTED", rejectionReason },
  });
  if (changed.count !== 1) throw new HttpError(409, "Anfrage wurde bereits bearbeitet");

  const updated = await prisma.borrowRequest.findUniqueOrThrow({
    where: { id },
    include: requestInclude,
  });
  await dispatch([
    {
      to: updated.user.email,
      message: requestRejectedTemplate({
        recipientName: updated.user.name,
        device: mailDevice(updated.device, updated.unit?.serialNumber ?? "–"),
        rejectionReason,
      }),
    },
  ]);
  const result = presentRequest(updated);
  await recordAudit({
    actorId,
    action: "REQUEST_REJECTED",
    entityType: "REQUEST",
    entityId: result.id,
    summary: `Ausleihe von „${result.device.name}“ (${result.device.serialNumber}) für ${result.user.name} abgelehnt`,
    details: {
      changes: [{ field: "Status", from: "Offen", to: "Abgelehnt" }],
      context: { Grund: rejectionReason || "ohne Angabe", ...auditContext(result) },
    },
  });
  return result;
}

export async function returnRequest(id: string, actorId: string) {
  const returnedAt = new Date();
  const current = await prisma.$transaction(async (tx) => {
    const request = await tx.borrowRequest.findUnique({ where: { id }, include: requestInclude });
    if (!request) throw new HttpError(404, "Anfrage nicht gefunden");
    if (request.status !== "APPROVED")
      throw new HttpError(409, "Nur bestätigte Ausleihen können zurückgegeben werden");

    const changed = await tx.borrowRequest.updateMany({
      where: { id, status: "APPROVED" },
      data: { status: "RETURNED", returnedAt },
    });
    if (changed.count !== 1) throw new HttpError(409, "Ausleihe wurde bereits abgeschlossen");

    return tx.borrowRequest.findUniqueOrThrow({ where: { id }, include: requestInclude });
  });

  await refreshUnitStatuses(current.deviceId);
  await dispatch([
    {
      to: current.user.email,
      message: deviceReturnedTemplate({
        recipientName: current.user.name,
        device: mailDevice(current.device, current.unit?.serialNumber ?? "–"),
        returnedAt,
      }),
    },
  ]);
  const result = presentRequest(current);
  await recordAudit({
    actorId,
    action: "REQUEST_RETURNED",
    entityType: "REQUEST",
    entityId: result.id,
    summary: `Rückgabe von „${result.device.name}“ (${result.device.serialNumber}) durch ${result.user.name} erfasst`,
    details: {
      changes: [{ field: "Status", from: "Bestätigt", to: "Zurückgegeben" }],
      context: {
        "Zurück am": formatDate(returnedAt),
        Pünktlichkeit: punctuality(result.desiredUntil, returnedAt),
        ...auditContext(result),
      },
    },
  });
  return result;
}

/**
 * Facts every request entry carries, in the order the log shows them.
 */
function auditContext(request: {
  device: { name: string; serialNumber: string; category: string };
  user: { name: string; email: string };
  room: { name: string; building: string } | null;
  startsAt: Date;
  desiredUntil: Date;
  comment: string;
}): Record<string, string> {
  return {
    Gerät: `${request.device.name} (${request.device.serialNumber}), ${request.device.category}`,
    Person: `${request.user.name} <${request.user.email}>`,
    Zeitraum: formatPeriod(request.startsAt, request.desiredUntil),
    Raum: request.room
      ? `${request.room.name}${request.room.building ? `, ${request.room.building}` : ""}`
      : "",
    Kommentar: request.comment,
  };
}

/**
 * "rechtzeitig" or how late the device came back, e.g. "3 Std. verspätet".
 */
function punctuality(due: Date, returnedAt: Date): string {
  const lateMinutes = Math.round((returnedAt.getTime() - due.getTime()) / 60_000);
  if (lateMinutes <= 0) return "rechtzeitig";
  if (lateMinutes < 60) return `${lateMinutes} Min. verspätet`;
  const hours = Math.round(lateMinutes / 60);
  if (hours < 48) return `${hours} Std. verspätet`;
  return `${Math.round(hours / 24)} Tage verspätet`;
}
