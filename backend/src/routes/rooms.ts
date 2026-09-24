import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "../lib/asyncHandler.js";
import { routeParam } from "../lib/params.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { createRoom, deleteRoom, listRooms, updateRoom } from "../services/roomService.js";

const roomSchema = z.object({
  name: z.string().trim().min(1, "Raumname fehlt").max(80),
  building: z.string().trim().max(80).optional().default(""),
  description: z.string().trim().max(500).optional().default(""),
});

export const roomRouter = Router();
roomRouter.use(requireAuth);

roomRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await listRooms());
  })
);

roomRouter.post(
  "/",
  requireAdmin,
  validateBody(roomSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createRoom(req.body, req.user!.id));
  })
);

roomRouter.patch(
  "/:id",
  requireAdmin,
  validateBody(roomSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateRoom(routeParam(req, "id"), req.body, req.user!.id));
  })
);

roomRouter.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await deleteRoom(routeParam(req, "id"), req.user!.id);
    res.status(204).end();
  })
);
