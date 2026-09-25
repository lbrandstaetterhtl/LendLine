import { Router } from "express";

import { asyncHandler } from "../lib/asyncHandler.js";
import { routeParam } from "../lib/params.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { uploadDeviceImages } from "../middleware/upload.js";
import { validateBody } from "../middleware/validate.js";
import {
  createDevice,
  deleteDevice,
  deviceCalendar,
  fieldOptions,
  listDevices,
  updateDevice,
} from "../services/deviceService.js";
import { addImages, deleteImage, imageUrl } from "../services/imageService.js";
import { searchFreeUnits } from "../services/searchService.js";
import { deviceCreateSchema, deviceQuerySchema, deviceUpdateSchema } from "../validators/device.js";

function queryString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export const deviceRouter = Router();

deviceRouter.use(requireAuth);

deviceRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = deviceQuerySchema.parse(req.query);
    res.json(await listDevices(query, req.user!.role === "ADMIN"));
  })
);

deviceRouter.get(
  "/search",
  asyncHandler(async (req, res) => {
    res.json(
      await searchFreeUnits({
        startsAt: queryString(req.query.startsAt),
        desiredUntil: queryString(req.query.desiredUntil),
        categoryId: queryString(req.query.categoryId),
        q: queryString(req.query.q),
        field: queryString(req.query.field).slice(0, 40),
        value: queryString(req.query.value).slice(0, 200),
      })
    );
  })
);

deviceRouter.get(
  "/fields",
  asyncHandler(async (_req, res) => {
    res.json(await fieldOptions());
  })
);

deviceRouter.get(
  "/:id/calendar",
  asyncHandler(async (req, res) => {
    res.json(await deviceCalendar(routeParam(req, "id"), req.user!.role === "ADMIN"));
  })
);

deviceRouter.post(
  "/",
  requireAdmin,
  validateBody(deviceCreateSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createDevice(req.body, req.user!.id));
  })
);

deviceRouter.patch(
  "/:id",
  requireAdmin,
  validateBody(deviceUpdateSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateDevice(routeParam(req, "id"), req.body, req.user!.id));
  })
);

deviceRouter.post(
  "/:id/images",
  requireAdmin,
  uploadDeviceImages,
  asyncHandler(async (req, res) => {
    const files = Array.isArray(req.files) ? req.files : [];
    const images = await addImages(routeParam(req, "id"), files, req.user!.id);
    res.status(201).json(images.map((image) => ({ id: image.id, url: imageUrl(image.fileName) })));
  })
);

deviceRouter.delete(
  "/:id/images/:imageId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await deleteImage(routeParam(req, "id"), routeParam(req, "imageId"), req.user!.id);
    res.status(204).send();
  })
);

deviceRouter.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await deleteDevice(routeParam(req, "id"), req.user!.id);
    res.status(204).send();
  })
);
