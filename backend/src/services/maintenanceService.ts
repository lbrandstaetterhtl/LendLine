import { z } from "zod";

import { formatDate } from "../emails/format.js";
import { HttpError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { recordAudit } from "./auditService.js";

const KEY = "maintenance";
const DEFAULT_MESSAGE = "LendLine wird gerade gewartet. Bitte versuchen Sie es später erneut.";

const storedSchema = z.object({
  enabled: z.boolean(),
  message: z.string(),
  until: z.string().nullable(),
});

export type MaintenanceMode = {
  enabled: boolean;
  message: string;
  /**
   * Expected end as ISO string, shown to users; informational only.
   */
  until: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

// Checked on every authenticated request, so the setting is read at most every few seconds.
const CACHE_MS = 5000;
let cache: { value: MaintenanceMode; at: number } | null = null;

export async function getMaintenance(): Promise<MaintenanceMode> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const row = await prisma.systemSetting.findUnique({ where: { key: KEY } });
  const parsed = storedSchema.safeParse(row?.value);
  let updatedBy: string | null = null;
  if (row?.updatedById) {
    const user = await prisma.user.findUnique({
      where: { id: row.updatedById },
      select: { name: true },
    });
    updatedBy = user?.name ?? null;
  }
  const value: MaintenanceMode = parsed.success
    ? { ...parsed.data, updatedAt: row?.updatedAt.toISOString() ?? null, updatedBy }
    : { enabled: false, message: DEFAULT_MESSAGE, until: null, updatedAt: null, updatedBy: null };
  cache = { value, at: Date.now() };
  return value;
}

export async function setMaintenance(
  input: { enabled: boolean; message: string; until: string | null },
  actorId: string
): Promise<MaintenanceMode> {
  const before = await getMaintenance();
  const value = {
    enabled: input.enabled,
    message: input.message.trim() || DEFAULT_MESSAGE,
    until: input.until,
  };
  await prisma.systemSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value, updatedById: actorId },
    update: { value, updatedById: actorId },
  });
  cache = null;
  const until = value.until ? formatDate(new Date(value.until)) : "";
  await recordAudit({
    actorId,
    action:
      value.enabled === before.enabled
        ? "MAINTENANCE_UPDATED"
        : value.enabled
          ? "MAINTENANCE_ON"
          : "MAINTENANCE_OFF",
    entityType: "SYSTEM",
    summary:
      value.enabled === before.enabled
        ? "Hinweis zum Wartungsmodus geändert"
        : value.enabled
          ? "Wartungsmodus eingeschaltet, Nutzer können sich nicht mehr anmelden"
          : "Wartungsmodus beendet",
    details: {
      changes: [
        { field: "Hinweis", from: before.message, to: value.message },
        {
          field: "Voraussichtlich bis",
          from: before.until ? formatDate(new Date(before.until)) : null,
          to: until || null,
        },
      ],
    },
  });
  return getMaintenance();
}

/**
 * Rejects everyone without `maintenance.bypass` with 503 while maintenance is on.
 */
export async function assertAccessDuringMaintenance(
  permissions: ReadonlySet<string>
): Promise<void> {
  if (permissions.has("maintenance.bypass")) return;
  const mode = await getMaintenance();
  if (!mode.enabled) return;
  throw new HttpError(503, mode.message, "MAINTENANCE");
}
