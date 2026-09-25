import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { t } from "../i18n/index.js";
import { HttpError } from "../lib/errors.js";
import { looksLikeImage } from "../lib/imageSniff.js";
import { prisma } from "../lib/prisma.js";
import { recordAudit } from "./auditService.js";

const KEY = "branding";

export const brandingDir = path.join(process.cwd(), "uploads", "branding");

/**
 * Uploadable images: logo for light and dark backgrounds, browser icon, login page picture.
 */
export const imageSlots = ["light", "dark", "favicon", "login"] as const;
export type ImageSlot = (typeof imageSlots)[number];

const slotField = {
  light: "logo",
  dark: "logoDark",
  favicon: "favicon",
  login: "loginImage",
} as const satisfies Record<ImageSlot, string>;

// Audit parameters that are messages themselves (see AuditSummary).
const slotKey: Record<ImageSlot, string> = {
  light: "@audit.slotLight",
  dark: "@audit.slotDark",
  favicon: "@audit.slotFavicon",
  login: "@audit.slotLogin",
};

const term = (fallback: string) => z.string().trim().min(1).max(40).default(fallback);

export const appearanceSchema = z.object({
  font: z.enum(["standard", "system", "humanist", "serif", "rounded"]).default("standard"),
  fontSize: z.enum(["small", "normal", "large"]).default("normal"),
  radius: z.enum(["square", "standard", "round"]).default("standard"),
  sidebar: z.enum(["standard", "tinted", "accent"]).default("standard"),
});

/**
 * Words the interface uses for the company's things, e.g. "Ausrüstung" instead of "Gerät".
 */
export const termsSchema = z.object({
  subtitle: z.string().trim().max(60).default("IT-Geräteausleihe"),
  catalog: term("Gerätekatalog"),
  device: term("Gerät"),
  devices: term("Geräte"),
  unit: term("Stück"),
  units: term("Stücke"),
  room: term("Raum"),
  rooms: term("Räume"),
});

export const loginTextSchema = z.object({
  title: z.string().trim().min(1).max(80).default("Anmelden"),
  text: z.string().trim().max(400).default(""),
});

const storedSchema = z.object({
  accent: z.string().nullable().default(null),
  logo: z.string().nullable().default(null),
  logoDark: z.string().nullable().default(null),
  favicon: z.string().nullable().default(null),
  loginImage: z.string().nullable().default(null),
  appearance: appearanceSchema.default({}),
  terms: termsSchema.default({}),
  login: loginTextSchema.default({}),
});
type Stored = z.infer<typeof storedSchema>;

export const brandingPatchSchema = z.object({
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "validation.colorFormat")
    .transform((value) => value.toLowerCase())
    .nullable()
    .optional(),
  appearance: appearanceSchema.partial().optional(),
  terms: termsSchema.partial().optional(),
  login: loginTextSchema.partial().optional(),
});
type BrandingPatch = z.infer<typeof brandingPatchSchema>;

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
  faviconUrl: string | null;
  loginImageUrl: string | null;
  appearance: Stored["appearance"];
  terms: Stored["terms"];
  login: Stored["login"];
};

function fileUrl(fileName: string | null): string | null {
  return fileName ? `/api/uploads/branding/${fileName}` : null;
}

async function readStored(): Promise<Stored> {
  const row = await prisma.systemSetting.findUnique({ where: { key: KEY } });
  const parsed = storedSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : storedSchema.parse({});
}

function toBranding(stored: Stored): Branding {
  return {
    accent: stored.accent,
    logoUrl: fileUrl(stored.logo),
    logoDarkUrl: fileUrl(stored.logoDark),
    faviconUrl: fileUrl(stored.favicon),
    loginImageUrl: fileUrl(stored.loginImage),
    appearance: stored.appearance,
    terms: stored.terms,
    login: stored.login,
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

export async function getBranding(): Promise<Branding> {
  return toBranding(await readStored());
}

/**
 * The logo file on disk for the e-mails, if it is a format mail programs show (not SVG).
 */
export async function mailLogoFile(): Promise<string | null> {
  const { logo } = await readStored();
  return logo && !logo.endsWith(".svg") ? logo : null;
}

const flat = (value: object) =>
  Object.entries(value).map(([key, item]) => [key, String(item)] as const);

export async function updateBranding(patch: BrandingPatch, actorId: string): Promise<Branding> {
  const before = await readStored();
  const value: Stored = {
    ...before,
    accent: patch.accent === undefined ? before.accent : patch.accent,
    appearance: { ...before.appearance, ...patch.appearance },
    terms: { ...before.terms, ...patch.terms },
    login: { ...before.login, ...patch.login },
  };
  await writeStored(value, actorId);
  const changes = [
    { field: "Akzentfarbe", from: before.accent ?? "Standard", to: value.accent ?? "Standard" },
    ...(["appearance", "terms", "login"] as const).flatMap((group) =>
      flat(value[group]).map(([key, to]) => ({
        field: `${group}.${key}`,
        from: String((before[group] as Record<string, unknown>)[key]),
        to,
      }))
    ),
  ].filter((change) => change.from !== change.to);
  if (changes.length > 0) {
    await recordAudit({
      actorId,
      action: "BRANDING_UPDATED",
      entityType: "SYSTEM",
      summary:
        changes.length === 1 && changes[0]?.field === "Akzentfarbe"
          ? value.accent
            ? { key: "audit.accentChanged", params: { color: value.accent } }
            : { key: "audit.accentReset" }
          : { key: "audit.brandingChanged", params: { count: changes.length } },
      details: { changes },
    });
  }
  return toBranding(value);
}

/**
 * Stores an uploaded image and deletes the one it replaces.
 */
export async function setImage(
  slot: ImageSlot,
  file: Express.Multer.File | undefined,
  actorId: string
): Promise<Branding> {
  if (!file)
    throw new HttpError(
      400,
      t((m) => m.errors.noFile)
    );
  if (!(await looksLikeImage(file.path, path.extname(file.filename)))) {
    await fs.unlink(file.path).catch(() => undefined);
    throw new HttpError(
      400,
      t((m) => m.errors.notAnImage)
    );
  }
  const before = await readStored();
  const field = slotField[slot];
  const value = { ...before, [field]: file.filename };
  await writeStored(value, actorId);
  await removeFile(before[field]);
  await recordAudit({
    actorId,
    action: "BRANDING_UPDATED",
    entityType: "SYSTEM",
    summary: {
      key: before[field] ? "audit.imageReplaced" : "audit.imageUploaded",
      params: { slot: slotKey[slot] },
    },
    details: {
      context: { Datei: file.originalname, Größe: `${Math.ceil(file.size / 1024)} KB` },
    },
  });
  return toBranding(value);
}

export async function removeImage(slot: ImageSlot, actorId: string): Promise<Branding> {
  const before = await readStored();
  const field = slotField[slot];
  if (!before[field]) return toBranding(before);
  const value = { ...before, [field]: null };
  await writeStored(value, actorId);
  await removeFile(before[field]);
  await recordAudit({
    actorId,
    action: "BRANDING_UPDATED",
    entityType: "SYSTEM",
    summary: { key: "audit.imageRemoved", params: { slot: slotKey[slot] } },
  });
  return toBranding(value);
}
