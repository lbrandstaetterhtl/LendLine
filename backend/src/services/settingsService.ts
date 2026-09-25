import { z } from "zod";

import { de } from "../i18n/de.js";
import { type Locale, currentLocale, localizedDefault, messages } from "../i18n/index.js";
import { prisma } from "../lib/prisma.js";
import { uiFeatureKeys, uiModes } from "../lib/uiFeatures.js";
import { recordAudit } from "./auditService.js";

/**
 * Company settings in `SystemSetting`, one row per key. Every field has a default, so a new
 * installation (no rows) and rows written by an older version both parse.
 */

const fieldTypes = ["text", "textarea", "select", "checkbox"] as const;

export const formFieldSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/, "validation.fieldIdFormat"),
  label: z.string().trim().min(1, "validation.fieldNameMissing").max(60),
  type: z.enum(fieldTypes),
  required: z.boolean().default(false),
  /**
   * Choices for `select`; ignored for the other types.
   */
  options: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  hint: z.string().trim().max(160).default(""),
});
export type FormField = z.infer<typeof formFieldSchema>;

const fieldMode = z.enum(["required", "optional", "hidden"]);

export const policySchema = z.object({
  registration: z
    .object({
      /**
       * Off by default: an internet-facing installation must not accept strangers.
       */
      enabled: z.boolean().default(false),
      /**
       * Allowed e-mail domains such as "company.com"; empty = any.
       */
      domains: z
        .array(
          z
            .string()
            .trim()
            .toLowerCase()
            .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "validation.domainFormat")
        )
        .max(20)
        .default([]),
    })
    .default({}),
  rules: z
    .object({
      maxDays: z.number().int().min(1).max(365).default(30),
      maxOpenPerUser: z.number().int().min(1).max(100).default(10),
      autoApprove: z.boolean().default(false),
    })
    .default({}),
  form: z
    .object({
      room: fieldMode.default("required"),
      comment: fieldMode.default("optional"),
      commentLabel: z.string().trim().min(1).max(40).default("Kommentar"),
      commentHint: z.string().trim().max(120).default("z. B. Zweck oder Zubehörwunsch"),
      fields: z
        .array(formFieldSchema)
        .max(10)
        .default([])
        .refine(
          (fields) => new Set(fields.map((field) => field.id)).size === fields.length,
          "validation.fieldIdsUnique"
        )
        .refine(
          (fields) => fields.every((field) => field.type !== "select" || field.options.length > 0),
          "validation.selectNeedsOptions"
        ),
    })
    .default({}),
});

export const mailSchema = z.object({
  /**
   * Display name before the SMTP_FROM address, e.g. "IT Service Example Ltd".
   */
  senderName: z.string().trim().max(80).default(""),
  /**
   * Shows the uploaded logo (PNG/JPG/WEBP; SVG is not supported by many mail programs).
   */
  showLogo: z.boolean().default(true),
  // The defaults are the German texts; mails and the editor show them in the reader's language.
  greeting: z.string().trim().max(80).default(de.defaults.greeting),
  signature: z.string().trim().max(400).default(de.defaults.signature),
  footer: z.string().trim().max(400).default(de.defaults.footer),
  approvedText: z.string().trim().max(1000).default(de.defaults.approvedText),
  rejectedText: z.string().trim().max(1000).default(de.defaults.rejectedText),
  returnedText: z.string().trim().max(1000).default(de.defaults.returnedText),
});
export type MailSettings = z.infer<typeof mailSchema>;

const mailTexts = [
  "greeting",
  "signature",
  "footer",
  "approvedText",
  "rejectedText",
  "returnedText",
] as const;

/**
 * The mail settings as the editor shows them: texts still at the built-in default in the reader's
 * language.
 */
export function mailForEditing(settings: MailSettings, locale: Locale = currentLocale()) {
  const shown = { ...settings };
  for (const key of mailTexts) {
    shown[key] = localizedDefault(settings[key], (m) => m.defaults[key], locale);
  }
  return shown;
}

/**
 * Back from the editor: a text equal to the translated default is stored as the built-in one, so it
 * stays translated for every recipient.
 */
export function mailFromEditing(input: unknown, locale: Locale = currentLocale()): unknown {
  if (typeof input !== "object" || input === null) return input;
  const record: Record<string, unknown> = { ...input };
  const translated = messages(locale).defaults;
  for (const key of mailTexts) {
    if (typeof record[key] === "string" && record[key].trim() === translated[key].trim()) {
      record[key] = de.defaults[key];
    }
  }
  return record;
}

export const uiSchema = z.object({
  /**
   * "full" for installations that existed before the mode: nothing they use disappears.
   */
  mode: z.enum(uiModes).default("full"),
  /**
   * The own selection for "custom" (kept when switching to a preset and back).
   */
  custom: z
    .record(z.string(), z.boolean())
    .default({})
    .transform((value) =>
      Object.fromEntries(
        Object.entries(value).filter(([key]) => (uiFeatureKeys as string[]).includes(key))
      )
    ),
});

const schemas = { policy: policySchema, mail: mailSchema, ui: uiSchema } as const;
type Key = keyof typeof schemas;
type Value<K extends Key> = z.infer<(typeof schemas)[K]>;

// Read on every request and every mail; changed only by admins.
const CACHE_MS = 5000;
const cache = new Map<Key, { value: unknown; at: number }>();

export async function getSetting<K extends Key>(key: K): Promise<Value<K>> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as Value<K>;
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  const parsed = schemas[key].safeParse(row?.value ?? {});
  // A row that no longer validates (e.g. edited by hand) falls back to the defaults.
  const value = (parsed.success ? parsed.data : schemas[key].parse({})) as Value<K>;
  cache.set(key, { value, at: Date.now() });
  return value;
}

const summaryKey = {
  policy: "audit.settingsPolicy",
  mail: "audit.settingsMail",
  ui: "audit.settingsUi",
} as const satisfies Record<Key, string>;

export async function setSetting<K extends Key>(
  key: K,
  input: unknown,
  actorId: string
): Promise<Value<K>> {
  const before = await getSetting(key);
  const value = schemas[key].parse(input) as Value<K>;
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value, updatedById: actorId },
    update: { value, updatedById: actorId },
  });
  cache.delete(key);
  await recordAudit({
    actorId,
    action: "SETTINGS_UPDATED",
    entityType: "SYSTEM",
    summary: { key: summaryKey[key] },
    details: { changes: changedPaths(before, value) },
  });
  return value;
}

/**
 * Flat list of changed leaves ("rules.maxDays: 30 → 14") for the audit log.
 */
function changedPaths(
  before: unknown,
  after: unknown,
  prefix = ""
): { field: string; from: string | null; to: string | null }[] {
  const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
  if (isObject(before) && isObject(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap((key) =>
      changedPaths(before[key], after[key], prefix ? `${prefix}.${key}` : key)
    );
  }
  const from = before === undefined ? null : JSON.stringify(before);
  const to = after === undefined ? null : JSON.stringify(after);
  return from === to ? [] : [{ field: prefix, from, to }];
}

/**
 * What the request dialog needs; readable by every signed-in user.
 */
export async function requestFormConfig(
  groupRules: { maxDays: number | null; autoApprove: boolean | null } = {
    maxDays: null,
    autoApprove: null,
  }
) {
  const { form, rules } = await getSetting("policy");
  return {
    ...form,
    maxDays: groupRules.maxDays ?? rules.maxDays,
    autoApprove: groupRules.autoApprove ?? rules.autoApprove,
  };
}
