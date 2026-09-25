import { Router } from "express";

import { asyncHandler } from "../lib/asyncHandler.js";
import { routeParam } from "../lib/params.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import {
  createGroup,
  deleteGroup,
  groupInputSchema,
  listGroups,
  permissionCatalog,
  updateGroup,
} from "../services/groupService.js";

export const groupRouter = Router();

groupRouter.use(requireAuth);

// The user page shows and assigns groups; the group page edits them.
groupRouter.get(
  "/",
  requirePermission("users.view", "groups.manage"),
  asyncHandler(async (_req, res) => {
    res.json(await listGroups());
  })
);

groupRouter.get("/permissions", requirePermission("users.view", "groups.manage"), (_req, res) => {
  res.json(permissionCatalog());
});

groupRouter.post(
  "/",
  requirePermission("groups.manage"),
  validateBody(groupInputSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createGroup(req.body, req.user!));
  })
);

groupRouter.put(
  "/:id",
  requirePermission("groups.manage"),
  validateBody(groupInputSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateGroup(routeParam(req, "id"), req.body, req.user!));
  })
);

groupRouter.delete(
  "/:id",
  requirePermission("groups.manage"),
  asyncHandler(async (req, res) => {
    const moveTo = typeof req.query.moveTo === "string" ? req.query.moveTo : undefined;
    await deleteGroup(routeParam(req, "id"), moveTo, req.user!);
    res.status(204).send();
  })
);
