import { Router } from "express";

import { asyncHandler } from "../lib/asyncHandler.js";
import { routeParam } from "../lib/params.js";
import { categoryOfDevice } from "../lib/scope.js";
import { assertManageScope, can, requireAuth, requirePermission } from "../middleware/auth.js";
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

deviceRouter.use(requireAuth, requirePermission("catalog.view"));

deviceRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = deviceQuerySchema.parse(req.query);
    const user = req.user!;
    // Managers see all pieces of the categories they manage; everyone else the bookable pieces of
    // the categories their group may borrow from.
    const manager = can(user, "devices.manage");
    res.json(
      await listDevices(
        query,
        manager || can(user, "devices.defective"),
        manager ? user.manageScope : user.borrowScope
      )
    );
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
        scope: req.user!.borrowScope,
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
    res.json(await deviceCalendar(routeParam(req, "id"), can(req.user, "calendar.names")));
  })
);

deviceRouter.post(
  "/",
  requirePermission("devices.manage"),
  validateBody(deviceCreateSchema),
  asyncHandler(async (req, res) => {
    assertManageScope(req.user!, req.body.categoryId);
    res.status(201).json(await createDevice(req.body, req.user!.id));
  })
);

deviceRouter.patch(
  "/:id",
  requirePermission("devices.manage"),
  validateBody(deviceUpdateSchema),
  asyncHandler(async (req, res) => {
    assertManageScope(req.user!, await categoryOfDevice(routeParam(req, "id")));
    if (req.body.categoryId) assertManageScope(req.user!, req.body.categoryId);
    res.json(await updateDevice(routeParam(req, "id"), req.body, req.user!.id));
  })
);

deviceRouter.post(
  "/:id/images",
  requirePermission("devices.images"),
  // Checked before multer writes the files.
  asyncHandler(async (req, _res, next) => {
    assertManageScope(req.user!, await categoryOfDevice(routeParam(req, "id")));
    next();
  }),
  uploadDeviceImages,
  asyncHandler(async (req, res) => {
    const files = Array.isArray(req.files) ? req.files : [];
    const images = await addImages(routeParam(req, "id"), files, req.user!.id);
    res.status(201).json(images.map((image) => ({ id: image.id, url: imageUrl(image.fileName) })));
  })
);

deviceRouter.delete(
  "/:id/images/:imageId",
  requirePermission("devices.images"),
  asyncHandler(async (req, res) => {
    assertManageScope(req.user!, await categoryOfDevice(routeParam(req, "id")));
    await deleteImage(routeParam(req, "id"), routeParam(req, "imageId"), req.user!.id);
    res.status(204).send();
  })
);

deviceRouter.delete(
  "/:id",
  requirePermission("devices.manage"),
  asyncHandler(async (req, res) => {
    assertManageScope(req.user!, await categoryOfDevice(routeParam(req, "id")));
    await deleteDevice(routeParam(req, "id"), req.user!.id);
    res.status(204).send();
  })
);
