import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { HttpError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { recordAudit } from "./auditService.js";

const KEY = "branding";

export const brandingDir = path.join(process.cwd(), "uploads", "branding");

export const logoVariants = ["light", "dark"] as const;
export type LogoVariant = (typeof logoVariants)[number];

const storedSchema = z.object({
  accent: z.string().nullable(),
  logo: z.string().nullable(),
  logoDark: z.string().nullable(),
});
type Stored = z.infer<typeof storedSchema>;

const EMPTY: Stored = { accent: null, logo: null, logoDark: null };

export type Branding = {
  /**
   * Accent colour as "#rrggbb"; null keeps the built-in black/white accent.
   */
  accent: string | null;
  logoUrl: string | null;
  /**
   * Variant for dark mode; the frontend falls back to `logoUrl`.
   */
  logoDarkUrl: string | null;
};

function fileUrl(fileName: string | null): string | null {
  return fileName ? `/api/uploads/branding/${fileName}` : null;
}

async function readStored(): Promise<Stored> {
  const row = await prisma.systemSetting.findUnique({ where: { key: KEY } });
  const parsed = storedSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : EMPTY;
}

function toBranding(stored: Stored): Branding {
  return {
    accent: stored.accent,
    logoUrl: fileUrl(stored.logo),
    logoDarkUrl: fileUrl(stored.logoDark),
  };
}

async function writeStored(value: Stored, actorId: string): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value, updatedById: actorId },
    update: { value, updatedById: actorId },
  });
}

async function removeFile(fileName: string | null): Promise<void> {
  if (fileName) await fs.unlink(path.join(brandingDir, fileName)).catch(() => undefined);
}

function variantLabel(variant: LogoVariant): string {
  return variant === "light" ? "Logo" : "Logo für den Dunkelmodus";
}

export async function getBranding(): Promise<Branding> {
  return toBranding(await readStored());
}

export async function setAccent(accent: string | null, actorId: string): Promise<Branding> {
  const before = await readStored();
  const value = { ...before, accent };
  await writeStored(value, actorId);
  await recordAudit({
    actorId,
    action: "BRANDING_UPDATED",
    entityType: "SYSTEM",
    summary: accent ? `Akzentfarbe auf ${accent} geändert` : "Akzentfarbe zurückgesetzt",
    details: {
      changes: [
        { field: "Akzentfarbe", from: before.accent ?? "Standard", to: accent ?? "Standard" },
      ],
    },
  });
  return toBranding(value);
}

/**
 * Stores an uploaded logo file and deletes the one it replaces.
 */
export async function setLogo(
  variant: LogoVariant,
  file: Express.Multer.File | undefined,
  actorId: string
): Promise<Branding> {
  if (!file) throw new HttpError(400, "Keine Datei ausgewählt");
  const before = await readStored();
  const field = variant === "light" ? "logo" : "logoDark";
  const value = { ...before, [field]: file.filename };
  await writeStored(value, actorId);
  await removeFile(before[field]);
  await recordAudit({
    actorId,
    action: "BRANDING_UPDATED",
    entityType: "SYSTEM",
    summary: `${variantLabel(variant)} ${before[field] ? "ersetzt" : "hochgeladen"}`,
    details: {
      context: { Datei: file.originalname, Größe: `${Math.ceil(file.size / 1024)} KB` },
    },
  });
  return toBranding(value);
}

export async function removeLogo(variant: LogoVariant, actorId: string): Promise<Branding> {
  const before = await readStored();
  const field = variant === "light" ? "logo" : "logoDark";
  if (!before[field]) return toBranding(before);
  const value = { ...before, [field]: null };
  await writeStored(value, actorId);
  await removeFile(before[field]);
  await recordAudit({
    actorId,
    action: "BRANDING_UPDATED",
    entityType: "SYSTEM",
    summary: `${variantLabel(variant)} entfernt`,
  });
  return toBranding(value);
}
