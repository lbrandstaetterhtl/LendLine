import fs from "node:fs/promises";
import path from "node:path";

import { config } from "../config.js";
import { escapeHtml, formatDate, layout } from "../emails/format.js";
import { sendMail } from "../emails/mailer.js";
import { HttpError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { recordAudit } from "./auditService.js";
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

/**
 * Upload files on disk that no DeviceImage row points to (left over from failed or old uploads).
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
    names.map(async (name) => ({ name, bytes: (await fs.stat(path.join(uploadDir, name))).size }))
  );
  return {
    files: sizes.length,
    bytes: sizes.reduce((sum, file) => sum + file.bytes, 0),
    orphans: sizes.filter((file) => !known.has(file.name)),
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
  let result: string;
  let context: Record<string, string> = {};
  switch (task) {
    case "cleanup-sessions": {
      const { count } = await prisma.refreshToken.deleteMany({
        where: { OR: [{ revokedAt: { not: null } }, { expiresAt: { lte: new Date() } }] },
      });
      result = `${count} abgelaufene oder beendete Sitzungen gelöscht.`;
      break;
    }
    case "cleanup-uploads": {
      const { orphans } = await uploadFiles();
      await Promise.all(orphans.map(async (file) => fs.unlink(path.join(uploadDir, file.name))));
      const bytes = orphans.reduce((sum, file) => sum + file.bytes, 0);
      result = `${orphans.length} verwaiste Bilddateien gelöscht (${megabytes(bytes)}).`;
      context = { Dateien: orphans.map((file) => file.name).join(", ") };
      break;
    }
    case "refresh-units": {
      await refreshUnitStatuses();
      result = "Status aller Stücke anhand der bestätigten Ausleihen neu berechnet.";
      break;
    }
    case "end-sessions": {
      const count = await endAllSessions(prisma, { id: { not: actorId } });
      result = `${count} Sitzungen beendet. Alle anderen müssen sich neu anmelden; Ihre eigene Sitzung bleibt bestehen.`;
      break;
    }
    case "test-mail": {
      const actor = await prisma.user.findUnique({ where: { id: actorId } });
      if (!actor) throw new HttpError(404, "Benutzer nicht gefunden");
      const sentAt = formatDate(new Date());
      await sendMail(actor.email, {
        subject: "LendLine: Test-E-Mail",
        text: `Guten Tag ${actor.name},\n\ndiese Test-E-Mail wurde am ${sentAt} aus dem Wartungsbereich gesendet. Der E-Mail-Versand funktioniert.`,
        html: layout(
          "Test-E-Mail",
          `<p>Guten Tag ${escapeHtml(actor.name)},</p><p>diese Test-E-Mail wurde am ${sentAt} aus dem Wartungsbereich gesendet. Der E-Mail-Versand funktioniert.</p>`
        ),
      });
      result = config.smtp.host
        ? `Test-E-Mail an ${actor.email} gesendet.`
        : `SMTP ist nicht eingerichtet: Die Test-E-Mail an ${actor.email} wurde nur in der Server-Konsole ausgegeben.`;
      context = { Empfänger: actor.email, Versand: config.smtp.host ? "SMTP" : "nur Konsole" };
      break;
    }
  }
  await recordAudit({
    actorId,
    action: "MAINTENANCE_TASK",
    entityType: "SYSTEM",
    summary: result,
    details: { context: { Aufgabe: task, ...context } },
  });
  return result;
}
