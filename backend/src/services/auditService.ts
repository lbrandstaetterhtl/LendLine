import type { Messages } from "../i18n/de.js";
import type { Prisma } from "@prisma/client";

import { formatDate } from "../emails/format.js";
import { de } from "../i18n/de.js";
import { type Locale, type Text, format, messages } from "../i18n/index.js";
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
export type AuditEntity =
  | "REQUEST"
  | "DEVICE"
  | "CATEGORY"
  | "ROOM"
  | "USER"
  | "GROUP"
  | "AUTH"
  | "SYSTEM";

/**
 * The summary as a message key ("audit.requestApproved", "tasks.cleanupSessions") with its values.
 * A value "@audit.slotLight" is itself a message and is translated too.
 */
export type AuditSummary = {
  key: `audit.${keyof Messages["audit"]}` | `tasks.${keyof Messages["tasks"]}`;
  params?: Record<string, string | number>;
};

function lookup(dictionary: Messages, key: string): Text | undefined {
  const [group, name] = key.split(".") as [string, string];
  const section = (dictionary as unknown as Record<string, Record<string, Text> | undefined>)[
    group
  ];
  return section?.[name];
}

function render(summary: AuditSummary, locale: Locale): string {
  const dictionary = messages(locale);
  const params = Object.fromEntries(
    Object.entries(summary.params ?? {}).map(([name, value]) => {
      if (typeof value === "string" && value.startsWith("@")) {
        const text = lookup(dictionary, value.slice(1));
        return [name, typeof text === "string" ? text : value];
      }
      return [name, value];
    })
  );
  const text = lookup(dictionary, summary.key);
  return text === undefined ? summary.key : format(text, params, locale);
}

/**
 * A summary in the language of the current request, e.g. the result of a maintenance task.
 */
export function describe(summary: AuditSummary): string {
  return render(summary, currentRequest().locale ?? "de");
}

export async function recordAudit(input: {
  actorId?: string | null;
  /**
   * Name to show when there is no actor account (e.g. a failed login).
   */
  actorName?: string;
  action: string;
  entityType: AuditEntity;
  entityId?: string | null;
  summary: AuditSummary;
  details?: AuditDetails;
}) {
  try {
    const actor = input.actorId
      ? await prisma.user.findUnique({ where: { id: input.actorId }, select: { name: true } })
      : null;
    const { ip, userAgent } = currentRequest();
    const details = compactDetails(input.details, input.summary);
    await prisma.auditEvent.create({
      data: {
        actorId: input.actorId ?? null,
        actorName: actor?.name ?? input.actorName ?? "System",
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        // German, for the search and for versions that do not know the key.
        summary: render(input.summary, "de"),
        details,
        ip,
        userAgent,
      },
    });
  } catch (error) {
    console.error("Protokoll konnte nicht geschrieben werden", error);
  }
}

function compactDetails(
  details: AuditDetails | undefined,
  summary: AuditSummary
): Prisma.InputJsonObject {
  const changes = details?.changes?.filter((change) => change.from !== change.to) ?? [];
  const context = Object.entries(details?.context ?? {}).filter(([, value]) => value !== "");
  return {
    i18n: { key: summary.key, params: summary.params ?? {} },
    ...(changes.length > 0 ? { changes } : {}),
    ...(context.length > 0 ? { context: Object.fromEntries(context) } : {}),
  };
}

// The German patterns as expressions: "Stück {serial}" matches "Stück LT-1001".
const patternList = (Object.keys(de.auditPatterns) as (keyof Messages["auditPatterns"])[]).map(
  (key) => {
    const source = de.auditPatterns[key]
      .split(/(\{\w+\})/)
      .map((part) =>
        /^\{\w+\}$/.test(part)
          ? `(?<${part.slice(1, -1)}>.+?)`
          : part.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")
      )
      .join("");
    return [key, new RegExp(`^${source}$`)] as const;
  }
);

/**
 * An entry as the reader sees it: summary in their language (entries written before the translation
 * keep their German text), field names and fixed values through `auditTerms`.
 */
function localize<T extends { summary: string; details: Prisma.JsonValue }>(row: T): T {
  const dictionary = messages();
  const terms = dictionary.auditTerms as Record<string, string>;
  const word = (value: string | null): string | null => {
    if (value === null) return null;
    const known = terms[value];
    if (known !== undefined) return known;
    for (const [key, pattern] of patternList) {
      const match = pattern.exec(value);
      if (!match?.groups) continue;
      const params = Object.fromEntries(
        Object.entries(match.groups).map(([name, part]) => [name, terms[part] ?? part])
      );
      return format(dictionary.auditPatterns[key], params);
    }
    // Lists such as "LT-1001 (Verfügbar), LT-1002 (Defekt)": the words in brackets.
    return value.replaceAll(/\(([^()]+)\)/g, (all, inner: string) =>
      terms[inner] === undefined ? all : `(${terms[inner]})`
    );
  };
  const details = row.details as {
    i18n?: AuditSummary;
    changes?: AuditChange[];
    context?: Record<string, string>;
  } | null;
  if (!details) return row;
  const summary = details.i18n
    ? render(details.i18n, currentRequest().locale ?? "de")
    : row.summary;
  return {
    ...row,
    summary,
    details: {
      ...(details.changes
        ? {
            changes: details.changes.map((change) => ({
              field: word(change.field) ?? change.field,
              from: word(change.from),
              to: word(change.to),
            })),
          }
        : {}),
      ...(details.context
        ? {
            context: Object.fromEntries(
              Object.entries(details.context).map(([key, value]) => [
                word(key) ?? key,
                word(value) ?? value,
              ])
            ),
          }
        : {}),
    },
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
  return fields.map(({ key, label, format: shown }) => {
    const show = (value: Scalar) => {
      if (value === null || value === undefined || value === "") return null;
      const text = String(value);
      return shown ? shown(text) : text;
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
  users: ["USER", "GROUP"],
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
  const items = rows.slice(0, filter.limit).map(localize);
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
