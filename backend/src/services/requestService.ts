import type { MailContext, MailMessage } from "../emails/format.js";
import type { RequestStatus } from "@prisma/client";

import { Prisma } from "@prisma/client";

import { formatDate } from "../emails/format.js";
import { sendMail } from "../emails/mailer.js";
import {
  deviceReturnedTemplate,
  mailContext,
  requestApprovedTemplate,
  requestRejectedTemplate,
} from "../emails/templates.js";
import { de } from "../i18n/de.js";
import { type Locale, defaultLocale, format, isLocale, t } from "../i18n/index.js";
import { HttpError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { formatPeriod, recordAudit } from "./auditService.js";
import { type FormField, getSetting } from "./settingsService.js";
import { refreshUnitStatuses } from "./unitStatus.js";

const requestInclude = {
  user: { select: { id: true, name: true, email: true, locale: true } },
  unit: { select: { id: true, serialNumber: true, status: true } },
  room: { select: { id: true, name: true, building: true } },
  device: { select: { id: true, name: true, category: { select: { name: true } } } },
} as const;

// Built only when sent, with the company's mail settings of that moment.
type PendingMail = {
  to: string;
  locale: string | null;
  build: (ctx: MailContext) => MailMessage;
};

const UNASSIGNED_ROOM = "room-unassigned";

export type FieldAnswer = { label: string; value: string };

/**
 * Checks the answers against the company's current fields and keeps them with their labels, so an
 * old request still reads correctly after a field was renamed or removed.
 */
function collectFields(defs: FormField[], input: Record<string, string | boolean>): FieldAnswer[] {
  const answers: FieldAnswer[] = [];
  for (const def of defs) {
    const raw = input[def.id];
    let value: string;
    if (def.type === "checkbox") {
      if (def.required && raw !== true)
        throw new HttpError(
          400,
          t((m) => m.errors.fieldMustConfirm, { label: def.label })
        );
      value = raw === true ? "Ja" : "Nein";
    } else {
      value = typeof raw === "string" ? raw.trim() : "";
      if (def.required && !value)
        throw new HttpError(
          400,
          t((m) => m.errors.fieldMissing, { label: def.label })
        );
      if (def.type === "select" && value && !def.options.includes(value)) {
        throw new HttpError(
          400,
          t((m) => m.errors.fieldInvalidChoice, { label: def.label })
        );
      }
    }
    if (value) answers.push({ label: def.label, value });
  }
  return answers;
}

function asAnswers(value: Prisma.JsonValue): FieldAnswer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    item && typeof item === "object" && !Array.isArray(item) && typeof item.label === "string"
      ? [{ label: item.label, value: typeof item.value === "string" ? item.value : "" }]
      : []
  );
}

function mailDevice(device: { name: string; category: { name: string } }, serialNumber: string) {
  return { name: device.name, category: device.category.name, serialNumber };
}

function presentRequest<
  T extends {
    device: { id: string; name: string; category: { name: string } };
    unit: { serialNumber: string; status: "AVAILABLE" | "BORROWED" | "DEFECTIVE" } | null;
    fields: Prisma.JsonValue;
  },
>(row: T) {
  return {
    ...row,
    fields: asAnswers(row.fields),
    device: {
      id: row.device.id,
      name: row.device.name,
      category: row.device.category.name,
      serialNumber: row.unit?.serialNumber ?? "–",
      status: row.unit?.status ?? "AVAILABLE",
    },
  };
}

function parseLocalDateTime(value: string, which: "start" | "end"): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new HttpError(
      400,
      t((m) => (which === "start" ? m.errors.startInvalid : m.errors.endInvalid))
    );
  return date;
}

async function dispatch(mails: PendingMail[]): Promise<void> {
  if (mails.length === 0) return;
  const contexts = new Map<Locale, MailContext>();
  for (const mail of mails) {
    try {
      const locale = isLocale(mail.locale) ? mail.locale : defaultLocale;
      const ctx = contexts.get(locale) ?? (await mailContext(locale));
      contexts.set(locale, ctx);
      await sendMail(mail.to, mail.build(ctx));
    } catch (error) {
      console.error("E-Mail-Versand fehlgeschlagen", error);
    }
  }
}

export async function createRequest(
  userId: string,
  input: {
    unitId: string;
    roomId: string;
    startsAt: string;
    desiredUntil: string;
    comment: string;
    fields: Record<string, string | boolean>;
  },
  /**
   * The requester's group rules; null values fall back to the company-wide setting.
   */
  groupRules: {
    maxDays: number | null;
    maxOpenPerUser: number | null;
    autoApprove: boolean | null;
  } = { maxDays: null, maxOpenPerUser: null, autoApprove: null }
) {
  const policy = await getSetting("policy");
  const { form } = policy;
  const rules = {
    maxDays: groupRules.maxDays ?? policy.rules.maxDays,
    maxOpenPerUser: groupRules.maxOpenPerUser ?? policy.rules.maxOpenPerUser,
    autoApprove: groupRules.autoApprove ?? policy.rules.autoApprove,
  };
  const startsAt = parseLocalDateTime(input.startsAt, "start");
  const desiredUntil = parseLocalDateTime(input.desiredUntil, "end");
  if (desiredUntil <= startsAt)
    throw new HttpError(
      400,
      t((m) => m.errors.endAfterStart)
    );
  if (desiredUntil.getTime() < Date.now())
    throw new HttpError(
      400,
      t((m) => m.errors.endInFuture)
    );
  // Today counts from midnight, so "Heute" still works in the afternoon.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (startsAt < today)
    throw new HttpError(
      400,
      t((m) => m.errors.startInPast)
    );
  if (desiredUntil.getTime() - startsAt.getTime() > rules.maxDays * 24 * 60 * 60 * 1000) {
    throw new HttpError(
      400,
      t((m) => m.errors.maxDays, { count: rules.maxDays })
    );
  }
  const comment = form.comment === "hidden" ? "" : input.comment;
  if (form.comment === "required" && !comment) {
    throw new HttpError(
      400,
      t((m) => m.errors.fieldMissing, { label: form.commentLabel })
    );
  }
  const roomId = form.room === "hidden" ? "" : input.roomId;
  if (form.room === "required" && (!roomId || roomId === UNASSIGNED_ROOM)) {
    throw new HttpError(
      400,
      t((m) => m.errors.roomMissing)
    );
  }
  const fields = collectFields(form.fields, input.fields);
  let request;
  try {
    request = await prisma.$transaction(
      async (tx) => {
        const unit = await tx.deviceUnit.findUnique({
          where: { id: input.unitId },
          include: { device: true },
        });
        if (!unit)
          throw new HttpError(
            404,
            t((m) => m.errors.unitNotFound)
          );
        if (unit.status === "DEFECTIVE")
          throw new HttpError(
            409,
            t((m) => m.errors.defectiveNotRequestable)
          );
        const open = await tx.borrowRequest.count({ where: { userId, status: "OPEN" } });
        if (open >= rules.maxOpenPerUser) {
          throw new HttpError(
            409,
            t((m) => m.errors.tooManyOpen, { count: open, max: rules.maxOpenPerUser })
          );
        }
        const room = await tx.room.findUnique({ where: { id: roomId || UNASSIGNED_ROOM } });
        if (!room)
          throw new HttpError(
            404,
            t((m) => m.errors.roomNotFound)
          );
        const overlapping = await tx.borrowRequest.count({
          where: {
            unitId: unit.id,
            status: { in: ["OPEN", "APPROVED"] },
            startsAt: { lt: desiredUntil },
            desiredUntil: { gt: startsAt },
          },
        });
        if (overlapping > 0)
          throw new HttpError(
            409,
            t((m) => m.errors.unitTaken)
          );
        const created = await tx.borrowRequest.create({
          data: {
            userId,
            deviceId: unit.deviceId,
            unitId: unit.id,
            roomId: room.id,
            startsAt,
            desiredUntil,
            comment,
            fields,
          },
          include: requestInclude,
        });
        const presented = presentRequest(created);
        await recordAudit({
          actorId: userId,
          action: "REQUEST_CREATED",
          entityType: "REQUEST",
          entityId: presented.id,
          summary: {
            key: "audit.requestCreated",
            params: { device: presented.device.name, serial: presented.device.serialNumber },
          },
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
        t((m) => m.errors.requestConcurrent)
      );
    }
    throw error;
  }
  // Checked again by approveRequest, e.g. a unit that became defective in the meantime.
  if (rules.autoApprove) return approveRequest(request.id, userId, { automatic: true });
  return request;
}

/**
 * The requester takes back an open request; it frees the unit at once.
 */
export async function cancelRequest(id: string, userId: string) {
  const current = await prisma.borrowRequest.findUnique({ where: { id }, include: requestInclude });
  // Someone else's request looks exactly like a missing one.
  if (!current || current.userId !== userId)
    throw new HttpError(
      404,
      t((m) => m.errors.requestNotFound)
    );
  if (current.status !== "OPEN") {
    throw new HttpError(
      409,
      t((m) => m.errors.onlyOpenCancel)
    );
  }
  const changed = await prisma.borrowRequest.updateMany({
    where: { id, status: "OPEN" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  if (changed.count !== 1)
    throw new HttpError(
      409,
      t((m) => m.errors.alreadyProcessed)
    );
  const result = presentRequest(
    await prisma.borrowRequest.findUniqueOrThrow({ where: { id }, include: requestInclude })
  );
  await recordAudit({
    actorId: userId,
    action: "REQUEST_CANCELLED",
    entityType: "REQUEST",
    entityId: id,
    summary: {
      key: "audit.requestCancelled",
      params: { device: result.device.name, serial: result.device.serialNumber },
    },
    details: {
      changes: [{ field: "Status", from: "Offen", to: "Zurückgezogen" }],
      context: auditContext(result),
    },
  });
  return result;
}

/**
 * Clears a flood of requests from one account in one go. No e-mails: the address may not even
 * belong to the person who sent them.
 */
export async function rejectOpenRequestsOfUser(userId: string, reason: string, actorId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user)
    throw new HttpError(
      404,
      t((m) => m.errors.userNotFound)
    );
  const { count } = await prisma.borrowRequest.updateMany({
    where: { userId, status: "OPEN" },
    data: { status: "REJECTED", rejectionReason: reason },
  });
  await recordAudit({
    actorId,
    action: "REQUESTS_BULK_REJECTED",
    entityType: "USER",
    entityId: userId,
    summary: { key: "audit.requestsBulkRejected", params: { count, name: user.name } },
    details: { context: { Grund: reason || "ohne Angabe", "E-Mails": "keine" } },
  });
  return { rejected: count };
}

export async function listMyRequests(userId: string) {
  const rows = await prisma.borrowRequest.findMany({
    where: { userId },
    include: requestInclude,
    orderBy: { requestedAt: "desc" },
  });
  return rows.map(presentRequest);
}

export async function listRequests(status?: RequestStatus, scope: string[] | null = null) {
  const rows = await prisma.borrowRequest.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(scope ? { device: { categoryId: { in: scope } } } : {}),
    },
    include: requestInclude,
    orderBy: { requestedAt: "asc" },
  });
  return rows.map(presentRequest);
}

export async function approveRequest(
  id: string,
  actorId: string,
  options: { automatic?: boolean } = {}
) {
  const mails: PendingMail[] = [];
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.borrowRequest.findUnique({
      where: { id },
      include: requestInclude,
    });
    if (!current)
      throw new HttpError(
        404,
        t((m) => m.errors.requestNotFound)
      );
    if (current.status !== "OPEN")
      throw new HttpError(
        409,
        t((m) => m.errors.onlyOpenApprove)
      );

    if (!current.unitId || !current.unit)
      throw new HttpError(
        409,
        t((m) => m.errors.requestNoUnit)
      );
    const conflict = await tx.borrowRequest.findFirst({
      where: {
        id: { not: current.id },
        unitId: current.unitId,
        status: { in: ["OPEN", "APPROVED"] },
        startsAt: { lt: current.desiredUntil },
        desiredUntil: { gt: current.startsAt },
      },
    });
    if (conflict)
      throw new HttpError(
        409,
        t((m) => m.errors.unitNoLongerFree)
      );
    if (current.unit.status === "DEFECTIVE")
      throw new HttpError(
        409,
        t((m) => m.errors.unitDefective)
      );
    const unit = current.unit;

    const approvedAt = new Date();
    const changed = await tx.borrowRequest.updateMany({
      where: { id, status: "OPEN" },
      data: { status: "APPROVED", approvedAt },
    });
    if (changed.count !== 1)
      throw new HttpError(
        409,
        t((m) => m.errors.alreadyProcessed)
      );

    mails.push({
      to: current.user.email,
      locale: current.user.locale,
      build: (ctx) =>
        requestApprovedTemplate(ctx, {
          recipientName: current.user.name,
          device: mailDevice(current.device, unit.serialNumber),
          startsAt: current.startsAt,
          desiredUntil: current.desiredUntil,
          roomName: current.room.id === UNASSIGNED_ROOM ? undefined : current.room.name,
          fields: asAnswers(current.fields),
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
    summary: {
      key: options.automatic ? "audit.requestAutoApproved" : "audit.requestApproved",
      params: {
        device: result.device.name,
        serial: result.device.serialNumber,
        name: result.user.name,
      },
    },
    details: {
      changes: [{ field: "Status", from: "Offen", to: "Bestätigt" }],
      context: auditContext(result),
    },
  });
  return result;
}

export async function rejectRequest(id: string, rejectionReason: string, actorId: string) {
  const current = await prisma.borrowRequest.findUnique({ where: { id }, include: requestInclude });
  if (!current)
    throw new HttpError(
      404,
      t((m) => m.errors.requestNotFound)
    );
  if (current.status !== "OPEN")
    throw new HttpError(
      409,
      t((m) => m.errors.onlyOpenReject)
    );

  const changed = await prisma.borrowRequest.updateMany({
    where: { id, status: "OPEN" },
    data: { status: "REJECTED", rejectionReason },
  });
  if (changed.count !== 1)
    throw new HttpError(
      409,
      t((m) => m.errors.alreadyProcessed)
    );

  const updated = await prisma.borrowRequest.findUniqueOrThrow({
    where: { id },
    include: requestInclude,
  });
  await dispatch([
    {
      to: updated.user.email,
      locale: updated.user.locale,
      build: (ctx) =>
        requestRejectedTemplate(ctx, {
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
    summary: {
      key: "audit.requestRejected",
      params: {
        device: result.device.name,
        serial: result.device.serialNumber,
        name: result.user.name,
      },
    },
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
    if (!request)
      throw new HttpError(
        404,
        t((m) => m.errors.requestNotFound)
      );
    if (request.status !== "APPROVED")
      throw new HttpError(
        409,
        t((m) => m.errors.onlyApprovedReturn)
      );

    const changed = await tx.borrowRequest.updateMany({
      where: { id, status: "APPROVED" },
      data: { status: "RETURNED", returnedAt },
    });
    if (changed.count !== 1)
      throw new HttpError(
        409,
        t((m) => m.errors.loanClosed)
      );

    return tx.borrowRequest.findUniqueOrThrow({ where: { id }, include: requestInclude });
  });

  await refreshUnitStatuses(current.deviceId);
  await dispatch([
    {
      to: current.user.email,
      locale: current.user.locale,
      build: (ctx) =>
        deviceReturnedTemplate(ctx, {
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
    summary: {
      key: "audit.requestReturned",
      params: {
        device: result.device.name,
        serial: result.device.serialNumber,
        name: result.user.name,
      },
    },
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
  fields: FieldAnswer[];
}): Record<string, string> {
  return {
    ...Object.fromEntries(request.fields.map((answer) => [answer.label, answer.value])),
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
  const late = de.auditPatterns;
  if (lateMinutes < 60) return format(late.lateMinutes, { count: lateMinutes }, "de");
  const hours = Math.round(lateMinutes / 60);
  if (hours < 48) return format(late.lateHours, { count: hours }, "de");
  return format(late.lateDays, { count: Math.round(hours / 24) }, "de");
}
