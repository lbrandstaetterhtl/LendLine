import fs from "node:fs/promises";
import path from "node:path";

import { config } from "../config.js";
import { sendMail } from "../emails/mailer.js";
import { mailContext, testMailTemplate } from "../emails/templates.js";
import { isLocale, t } from "../i18n/index.js";
import { HttpError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { type AuditSummary, describe, recordAudit } from "./auditService.js";
import { uploadDir } from "./imageService.js";
import { getMaintenance } from "./maintenanceService.js";
import { endAllSessions } from "./sessionService.js";
import { refreshUnitStatuses } from "./unitStatus.js";

const startedAt = new Date();

async function appVersion(): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "package.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && "version" in parsed
      ? String(parsed.version)
      : "unbekannt";
  } catch {
    return "unbekannt";
  }
}

// Multer writes the file before addImages creates its row: a younger file may still be in flight.
const ORPHAN_MIN_AGE_MS = 10 * 60 * 1000;

/**
 * Upload files on disk that no DeviceImage row points to (left over from failed or old uploads).
 * Only files older than ORPHAN_MIN_AGE_MS count, so a running upload is never deleted.
 */
async function uploadFiles() {
  let names: string[];
  try {
    names = await fs.readdir(uploadDir);
  } catch {
    return { files: 0, bytes: 0, orphans: [] as { name: string; bytes: number }[] };
  }
  const known = new Set(
    (await prisma.deviceImage.findMany({ select: { fileName: true } })).map((row) => row.fileName)
  );
  const sizes = await Promise.all(
    names.map(async (name) => {
      const stat = await fs.stat(path.join(uploadDir, name));
      return { name, bytes: stat.size, modifiedAt: stat.mtimeMs };
    })
  );
  const cutoff = Date.now() - ORPHAN_MIN_AGE_MS;
  return {
    files: sizes.length,
    bytes: sizes.reduce((sum, file) => sum + file.bytes, 0),
    orphans: sizes
      .filter((file) => !known.has(file.name) && file.modifiedAt < cutoff)
      .map(({ name, bytes }) => ({ name, bytes })),
  };
}

export async function systemStatus() {
  const dbStart = Date.now();
  let database: { ok: boolean; latencyMs: number | null };
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = { ok: true, latencyMs: Date.now() - dbStart };
  } catch {
    database = { ok: false, latencyMs: null };
  }
  const now = new Date();
  const [users, devices, units, requests, auditEvents, oldestAudit, activeSessions, staleSessions] =
    await Promise.all([
      prisma.user.count(),
      prisma.device.count(),
      prisma.deviceUnit.count(),
      prisma.borrowRequest.count(),
      prisma.auditEvent.count(),
      prisma.auditEvent.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      prisma.refreshToken.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
      prisma.refreshToken.count({
        where: { OR: [{ revokedAt: { not: null } }, { expiresAt: { lte: now } }] },
      }),
    ]);
  const uploads = await uploadFiles();
  return {
    maintenance: await getMaintenance(),
    database,
    app: {
      version: await appVersion(),
      node: process.version,
      environment: config.nodeEnv,
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    },
    integrations: {
      smtp: config.smtp.host ? `${config.smtp.host}:${config.smtp.port}` : null,
      ldap: config.ldap.enabled ? config.ldap.url : null,
    },
    counts: { users, devices, units, requests },
    sessions: { active: activeSessions, stale: staleSessions },
    uploads: {
      files: uploads.files,
      bytes: uploads.bytes,
      orphans: uploads.orphans.length,
      orphanBytes: uploads.orphans.reduce((sum, file) => sum + file.bytes, 0),
    },
    audit: { events: auditEvents, since: oldestAudit?.createdAt.toISOString() ?? null },
  };
}

export const maintenanceTasks = [
  "cleanup-sessions",
  "cleanup-uploads",
  "refresh-units",
  "end-sessions",
  "test-mail",
] as const;
export type MaintenanceTask = (typeof maintenanceTasks)[number];

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Runs one task and returns a sentence for the admin; every run is written to the audit log.
 */
export async function runMaintenanceTask(task: MaintenanceTask, actorId: string): Promise<string> {
  let summary: AuditSummary;
  let context: Record<string, string> = {};
  switch (task) {
    case "cleanup-sessions": {
      const { count } = await prisma.refreshToken.deleteMany({
        where: { OR: [{ revokedAt: { not: null } }, { expiresAt: { lte: new Date() } }] },
      });
      summary = { key: "tasks.cleanupSessions", params: { count } };
      break;
    }
    case "cleanup-uploads": {
      const { orphans } = await uploadFiles();
      await Promise.all(orphans.map(async (file) => fs.unlink(path.join(uploadDir, file.name))));
      const bytes = orphans.reduce((sum, file) => sum + file.bytes, 0);
      summary = {
        key: "tasks.cleanupUploads",
        params: { count: orphans.length, size: megabytes(bytes) },
      };
      context = { Dateien: orphans.map((file) => file.name).join(", ") };
      break;
    }
    case "refresh-units": {
      await refreshUnitStatuses();
      summary = { key: "tasks.refreshUnits" };
      break;
    }
    case "end-sessions": {
      const count = await endAllSessions(prisma, { id: { not: actorId } });
      summary = { key: "tasks.endSessions", params: { count } };
      break;
    }
    case "test-mail": {
      const actor = await prisma.user.findUnique({ where: { id: actorId } });
      if (!actor)
        throw new HttpError(
          404,
          t((m) => m.errors.userNotFound)
        );
      await sendMail(
        actor.email,
        testMailTemplate(await mailContext(isLocale(actor.locale) ? actor.locale : undefined), {
          recipientName: actor.name,
        })
      );
      summary = {
        key: config.smtp.host ? "tasks.testMailSent" : "tasks.testMailConsole",
        params: { email: actor.email },
      };
      context = { Empfänger: actor.email, Versand: config.smtp.host ? "SMTP" : "nur Konsole" };
      break;
    }
  }
  await recordAudit({
    actorId,
    action: "MAINTENANCE_TASK",
    entityType: "SYSTEM",
    summary,
    details: { context: { Aufgabe: task, ...context } },
  });
  return describe(summary);
}
