import type { Prisma } from "@prisma/client";

import { formatDate } from "../emails/format.js";
import { prisma } from "../lib/prisma.js";
import { currentRequest } from "../lib/requestContext.js";

/**
 * One changed field, as shown in the log: "Rolle: Nutzer → Verwaltung".
 */
export type AuditChange = { field: string; from: string | null; to: string | null };

export type AuditDetails = {
  changes?: AuditChange[];
  /**
   * Facts about the event in display order, e.g. { Seriennummer: "LT-1001", Raum: "A101" }.
   */
  context?: Record<string, string>;
};

/**
 * Entity types, which the log groups into categories for filtering.
 */
export type AuditEntity = "REQUEST" | "DEVICE" | "CATEGORY" | "ROOM" | "USER" | "AUTH" | "SYSTEM";

export async function recordAudit(input: {
  actorId?: string | null;
  /**
   * Name to show when there is no actor account (e.g. a failed login).
   */
  actorName?: string;
  action: string;
  entityType: AuditEntity;
  entityId?: string | null;
  summary: string;
  details?: AuditDetails;
}) {
  try {
    const actor = input.actorId
      ? await prisma.user.findUnique({ where: { id: input.actorId }, select: { name: true } })
      : null;
    const { ip, userAgent } = currentRequest();
    const details = compactDetails(input.details);
    await prisma.auditEvent.create({
      data: {
        actorId: input.actorId ?? null,
        actorName: actor?.name ?? input.actorName ?? "System",
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        summary: input.summary,
        details: details ?? undefined,
        ip,
        userAgent,
      },
    });
  } catch (error) {
    console.error("Protokoll konnte nicht geschrieben werden", error);
  }
}

function compactDetails(details: AuditDetails | undefined): Prisma.InputJsonObject | null {
  if (!details) return null;
  const changes = details.changes?.filter((change) => change.from !== change.to) ?? [];
  const context = Object.entries(details.context ?? {}).filter(([, value]) => value !== "");
  if (changes.length === 0 && context.length === 0) return null;
  return {
    ...(changes.length > 0 ? { changes } : {}),
    ...(context.length > 0 ? { context: Object.fromEntries(context) } : {}),
  };
}

type Scalar = string | number | boolean | null | undefined;

/**
 * Builds the changes between two versions of a record for the listed fields.
 */
export function diff<K extends string>(
  before: Record<K, Scalar>,
  after: Record<K, Scalar>,
  fields: { key: K; label: string; format?: (value: string) => string }[]
): AuditChange[] {
  return fields.map(({ key, label, format }) => {
    const show = (value: Scalar) => {
      if (value === null || value === undefined || value === "") return null;
      const text = String(value);
      return format ? format(text) : text;
    };
    return { field: label, from: show(before[key]), to: show(after[key]) };
  });
}

/**
 * "25.09.2026, 08:00 – 25.09.2026, 17:00" in the office time zone.
 */
export function formatPeriod(from: Date, to: Date): string {
  return `${formatDate(from)} – ${formatDate(to)}`;
}

const categoryEntities: Record<string, AuditEntity[]> = {
  requests: ["REQUEST"],
  devices: ["DEVICE"],
  masterdata: ["CATEGORY", "ROOM"],
  users: ["USER"],
  auth: ["AUTH"],
  system: ["SYSTEM"],
};

export type AuditFilter = {
  q?: string;
  category?: string;
  action?: string;
  actorId?: string;
  /**
   * Everything concerning one person: their own actions, their account and their requests.
   */
  userId?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit: number;
};

/**
 * Newest first, `limit` per page; `nextCursor` continues after the last entry.
 */
export async function listAudit(filter: AuditFilter) {
  const and: Prisma.AuditEventWhereInput[] = [];
  if (filter.q) {
    and.push({
      OR: [
        { summary: { contains: filter.q, mode: "insensitive" } },
        { actorName: { contains: filter.q, mode: "insensitive" } },
      ],
    });
  }
  if (filter.userId) {
    const requests = await prisma.borrowRequest.findMany({
      where: { userId: filter.userId },
      select: { id: true },
    });
    and.push({
      OR: [
        { actorId: filter.userId },
        { entityId: filter.userId },
        { entityType: "REQUEST", entityId: { in: requests.map((request) => request.id) } },
      ],
    });
  }
  const where: Prisma.AuditEventWhereInput = {
    action: filter.action || undefined,
    actorId: filter.actorId || undefined,
    entityType: filter.category ? { in: categoryEntities[filter.category] ?? [] } : undefined,
    createdAt: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
    AND: and,
  };
  const rows = await prisma.auditEvent.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: filter.limit + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
  });
  const items = rows.slice(0, filter.limit);
  return { items, nextCursor: rows.length > filter.limit ? (items.at(-1)?.id ?? null) : null };
}

/**
 * People who appear in the log, for the person filter.
 */
export async function listAuditActors() {
  const rows = await prisma.auditEvent.findMany({
    where: { actorId: { not: null } },
    distinct: ["actorId"],
    select: { actorId: true, actorName: true },
    orderBy: { actorId: "asc" },
  });
  return rows
    .flatMap((row) => (row.actorId ? [{ id: row.actorId, name: row.actorName }] : []))
    .toSorted((a, b) => a.name.localeCompare(b.name, "de"));
}
