import { Router } from "express";

import { asyncHandler } from "../lib/asyncHandler.js";
import { routeParam } from "../lib/params.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import {
  approveRequest,
  createRequest,
  listMyRequests,
  listRequests,
  rejectRequest,
  returnRequest,
} from "../services/requestService.js";
import {
  createRequestSchema,
  rejectRequestSchema,
  requestQuerySchema,
} from "../validators/request.js";

export const requestRouter = Router();

requestRouter.use(requireAuth);

requestRouter.get(
  "/mine",
  asyncHandler(async (req, res) => {
    res.json(await listMyRequests(req.user!.id));
  })
);

requestRouter.get(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status } = requestQuerySchema.parse(req.query);
    res.json(await listRequests(status || undefined));
  })
);

requestRouter.post(
  "/",
  validateBody(createRequestSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createRequest(req.user!.id, req.body));
  })
);

requestRouter.post(
  "/:id/approve",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await approveRequest(routeParam(req, "id"), req.user!.id));
  })
);

requestRouter.post(
  "/:id/reject",
  requireAdmin,
  validateBody(rejectRequestSchema),
  asyncHandler(async (req, res) => {
    res.json(await rejectRequest(routeParam(req, "id"), req.body.rejectionReason, req.user!.id));
  })
);

requestRouter.post(
  "/:id/return",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await returnRequest(routeParam(req, "id"), req.user!.id));
  })
);
