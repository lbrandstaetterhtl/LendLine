import type { Request } from "express";

import { Router } from "express";
import { z } from "zod";

import { mailContext, previewTemplate } from "../emails/templates.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/errors.js";
import { routeParam } from "../lib/params.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { uploadBrandingImage } from "../middleware/upload.js";
import { validateBody } from "../middleware/validate.js";
import { adminSummary } from "../services/adminSummaryService.js";
import { listAudit, listAuditActors } from "../services/auditService.js";
import {
  brandingPatchSchema,
  type ImageSlot,
  imageSlots,
  removeImage,
  setImage,
  updateBranding,
} from "../services/brandingService.js";
import { setMaintenance } from "../services/maintenanceService.js";
import { mailSchema, getSetting, setSetting } from "../services/settingsService.js";
import { maintenanceTasks, runMaintenanceTask, systemStatus } from "../services/systemService.js";
import { auditQuerySchema } from "../validators/audit.js";

const maintenanceSchema = z.object({
  enabled: z.boolean(),
  message: z.string().trim().max(500).default(""),
  until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Zeit im Format JJJJ-MM-TTTHH:MM angeben")
    .nullable()
    .default(null)
    .transform((value) => (value ? new Date(value).toISOString() : null)),
});

function imageSlot(req: Request): ImageSlot {
  const slot = imageSlots.find((name) => name === routeParam(req, "slot"));
  if (!slot) throw new HttpError(404, "Unbekanntes Bild");
  return slot;
}

export const adminRouter = Router();

// Every route names its own permission below.
adminRouter.use(requireAuth);

adminRouter.get(
  "/summary",
  requirePermission("dashboard.view"),
  asyncHandler(async (_req, res) => {
    res.json(await adminSummary());
  })
);

adminRouter.get(
  "/audit",
  requirePermission("audit.view"),
  asyncHandler(async (req, res) => {
    res.json(await listAudit(auditQuerySchema.parse(req.query)));
  })
);

adminRouter.get(
  "/audit/actors",
  requirePermission("audit.view"),
  asyncHandler(async (_req, res) => {
    res.json(await listAuditActors());
  })
);

adminRouter.get(
  "/maintenance",
  requirePermission("maintenance.manage"),
  asyncHandler(async (_req, res) => {
    res.json(await systemStatus());
  })
);

adminRouter.put(
  "/maintenance/mode",
  requirePermission("maintenance.manage"),
  validateBody(maintenanceSchema),
  asyncHandler(async (req, res) => {
    res.json(await setMaintenance(req.body, req.user!.id));
  })
);

adminRouter.post(
  "/maintenance/tasks/:task",
  requirePermission("maintenance.manage"),
  asyncHandler(async (req, res) => {
    const task = maintenanceTasks.find((name) => name === routeParam(req, "task"));
    if (!task) throw new HttpError(404, "Unbekannte Wartungsaufgabe");
    res.json({ message: await runMaintenanceTask(task, req.user!.id) });
  })
);

const settingKeys = ["policy", "mail"] as const;

const settingPermission = { policy: "settings.rules", mail: "settings.mail" } as const;

function settingKey(req: Request) {
  const key = settingKeys.find((name) => name === routeParam(req, "key"));
  if (!key) throw new HttpError(404, "Unbekannte Einstellung");
  if (!req.user?.permissions.has(settingPermission[key])) {
    throw new HttpError(403, "Keine Berechtigung");
  }
  return key;
}

// Before the generic route: shows unsaved mail settings with sample data.
adminRouter.post(
  "/settings/mail/preview",
  requirePermission("settings.mail"),
  asyncHandler(async (req, res) => {
    const ctx = await mailContext();
    res.json(previewTemplate({ ...ctx, settings: mailSchema.parse(req.body) }));
  })
);

adminRouter.get(
  "/settings/:key",
  asyncHandler(async (req, res) => {
    res.json(await getSetting(settingKey(req)));
  })
);

adminRouter.put(
  "/settings/:key",
  asyncHandler(async (req, res) => {
    res.json(await setSetting(settingKey(req), req.body, req.user!.id));
  })
);

adminRouter.put(
  "/branding",
  requirePermission("settings.appearance"),
  validateBody(brandingPatchSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateBranding(req.body, req.user!.id));
  })
);

adminRouter.post(
  "/branding/image/:slot",
  requirePermission("settings.appearance"),
  // Checked before multer writes the file, so a wrong URL leaves nothing on disk.
  (req, _res, next) => {
    imageSlot(req);
    next();
  },
  uploadBrandingImage,
  asyncHandler(async (req, res) => {
    res.json(await setImage(imageSlot(req), req.file, req.user!.id));
  })
);

adminRouter.delete(
  "/branding/image/:slot",
  requirePermission("settings.appearance"),
  asyncHandler(async (req, res) => {
    res.json(await removeImage(imageSlot(req), req.user!.id));
  })
);
