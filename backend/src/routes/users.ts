import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "../lib/asyncHandler.js";
import { routeParam } from "../lib/params.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import {
  createUser,
  deleteUser,
  getUserProfile,
  listUsers,
  revokeUserSessions,
  updateUser,
} from "../services/userAdminService.js";
import { newPassword } from "../validators/auth.js";

const role = z.enum(["USER", "ADMIN"]);

const createSchema = z.object({
  name: z.string().trim().min(2, "Name muss mindestens 2 Zeichen haben").max(120),
  email: z.string().trim().email("Ungültige E-Mail-Adresse").max(200),
  password: newPassword,
  role: role.default("USER"),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  role: role.optional(),
  password: newPassword.optional(),
});

export const userRouter = Router();

userRouter.use(requireAuth, requireAdmin);

userRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await listUsers());
  })
);

userRouter.post(
  "/",
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createUser(req.body, req.user!.id));
  })
);

userRouter.patch(
  "/:id",
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateUser(routeParam(req, "id"), req.user!.id, req.body));
  })
);

userRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await deleteUser(routeParam(req, "id"), req.user!.id);
    res.status(204).send();
  })
);

userRouter.get(
  "/:id/profile",
  asyncHandler(async (req, res) => {
    res.json(await getUserProfile(routeParam(req, "id")));
  })
);

userRouter.post(
  "/:id/sessions/revoke",
  asyncHandler(async (req, res) => {
    res.json(await revokeUserSessions(routeParam(req, "id"), req.user!.id));
  })
);
