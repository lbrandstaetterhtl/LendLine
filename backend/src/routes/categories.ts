import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "../lib/asyncHandler.js";
import { routeParam } from "../lib/params.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "../services/categoryService.js";

const categorySchema = z.object({
  name: z.string().trim().min(2, "Kategorie muss mindestens 2 Zeichen haben").max(80),
});

export const categoryRouter = Router();

categoryRouter.use(requireAuth);

categoryRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await listCategories());
  })
);

categoryRouter.post(
  "/",
  requireAdmin,
  validateBody(categorySchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createCategory(req.body.name, req.user!.id));
  })
);

categoryRouter.patch(
  "/:id",
  requireAdmin,
  validateBody(categorySchema),
  asyncHandler(async (req, res) => {
    res.json(await updateCategory(routeParam(req, "id"), req.body.name, req.user!.id));
  })
);

categoryRouter.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await deleteCategory(routeParam(req, "id"), req.user!.id);
    res.status(204).send();
  })
);
