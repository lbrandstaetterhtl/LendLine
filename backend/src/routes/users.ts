import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "../lib/asyncHandler.js";
import { routeParam } from "../lib/params.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { rejectOpenRequestsOfUser } from "../services/requestService.js";
import {
  createUser,
  deleteUser,
  getUserProfile,
  listUsers,
  revokeUserSessions,
  updateUser,
} from "../services/userAdminService.js";
import { newPassword } from "../validators/auth.js";
import { rejectOpenSchema } from "../validators/request.js";

const createSchema = z.object({
  name: z.string().trim().min(2, "validation.nameMin").max(120),
  email: z.string().trim().email("validation.emailInvalid").max(200),
  password: newPassword,
  // Missing: the default group.
  groupId: z.string().min(1).max(60).optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  groupId: z.string().min(1).max(60).optional(),
  password: newPassword.optional(),
});

export const userRouter = Router();

userRouter.use(requireAuth);

userRouter.get(
  "/",
  requirePermission("users.view"),
  asyncHandler(async (_req, res) => {
    res.json(await listUsers());
  })
);

userRouter.post(
  "/",
  requirePermission("users.manage"),
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createUser(req.body, req.user!));
  })
);

userRouter.patch(
  "/:id",
  requirePermission("users.manage"),
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateUser(routeParam(req, "id"), req.user!, req.body));
  })
);

userRouter.delete(
  "/:id",
  requirePermission("users.manage"),
  asyncHandler(async (req, res) => {
    await deleteUser(routeParam(req, "id"), req.user!);
    res.status(204).send();
  })
);

userRouter.get(
  "/:id/profile",
  requirePermission("users.view"),
  asyncHandler(async (req, res) => {
    res.json(await getUserProfile(routeParam(req, "id")));
  })
);

userRouter.post(
  "/:id/requests/reject-open",
  requirePermission("users.emergency"),
  validateBody(rejectOpenSchema),
  asyncHandler(async (req, res) => {
    res.json(await rejectOpenRequestsOfUser(routeParam(req, "id"), req.body.reason, req.user!.id));
  })
);

userRouter.post(
  "/:id/sessions/revoke",
  requirePermission("users.emergency"),
  asyncHandler(async (req, res) => {
    res.json(await revokeUserSessions(routeParam(req, "id"), req.user!.id));
  })
);
