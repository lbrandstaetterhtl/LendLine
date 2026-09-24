import type { Request } from "express";

import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/errors.js";
import { routeParam } from "../lib/params.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { uploadLogo } from "../middleware/upload.js";
import { validateBody } from "../middleware/validate.js";
import { adminSummary } from "../services/adminSummaryService.js";
import { listAudit, listAuditActors } from "../services/auditService.js";
import {
  type LogoVariant,
  logoVariants,
  removeLogo,
  setAccent,
  setLogo,
} from "../services/brandingService.js";
import { setMaintenance } from "../services/maintenanceService.js";
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

const brandingSchema = z.object({
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Farbe im Format #RRGGBB angeben")
    .transform((value) => value.toLowerCase())
    .nullable(),
});

function logoVariant(req: Request): LogoVariant {
  const variant = logoVariants.find((name) => name === routeParam(req, "variant"));
  if (!variant) throw new HttpError(404, "Unbekannte Logo-Variante");
  return variant;
}

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    res.json(await adminSummary());
  })
);

adminRouter.get(
  "/audit",
  asyncHandler(async (req, res) => {
    res.json(await listAudit(auditQuerySchema.parse(req.query)));
  })
);

adminRouter.get(
  "/audit/actors",
  asyncHandler(async (_req, res) => {
    res.json(await listAuditActors());
  })
);

adminRouter.get(
  "/maintenance",
  asyncHandler(async (_req, res) => {
    res.json(await systemStatus());
  })
);

adminRouter.put(
  "/maintenance/mode",
  validateBody(maintenanceSchema),
  asyncHandler(async (req, res) => {
    res.json(await setMaintenance(req.body, req.user!.id));
  })
);

adminRouter.post(
  "/maintenance/tasks/:task",
  asyncHandler(async (req, res) => {
    const task = maintenanceTasks.find((name) => name === routeParam(req, "task"));
    if (!task) throw new HttpError(404, "Unbekannte Wartungsaufgabe");
    res.json({ message: await runMaintenanceTask(task, req.user!.id) });
  })
);

adminRouter.put(
  "/branding",
  validateBody(brandingSchema),
  asyncHandler(async (req, res) => {
    res.json(await setAccent(req.body.accent, req.user!.id));
  })
);

adminRouter.post(
  "/branding/logo/:variant",
  // Checked before multer writes the file, so a wrong URL leaves nothing on disk.
  (req, _res, next) => {
    logoVariant(req);
    next();
  },
  uploadLogo,
  asyncHandler(async (req, res) => {
    res.json(await setLogo(logoVariant(req), req.file, req.user!.id));
  })
);

adminRouter.delete(
  "/branding/logo/:variant",
  asyncHandler(async (req, res) => {
    res.json(await removeLogo(logoVariant(req), req.user!.id));
  })
);
