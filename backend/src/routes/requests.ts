import { Router } from "express";

import { t } from "../i18n/index.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/errors.js";
import { routeParam } from "../lib/params.js";
import { RateLimiter } from "../lib/rateLimit.js";
import { categoryOfRequest, categoryOfUnit } from "../lib/scope.js";
import { assertManageScope, inScope, requireAuth, requirePermission } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import {
  approveRequest,
  cancelRequest,
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

// Generous for real use, but a script cannot fill the calendar in a minute.
const createPerUser = new RateLimiter(30, 60 * 60 * 1000);

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
  requirePermission("requests.view"),
  asyncHandler(async (req, res) => {
    const { status } = requestQuerySchema.parse(req.query);
    res.json(await listRequests(status || undefined, req.user!.manageScope));
  })
);

requestRouter.post(
  "/",
  requirePermission("requests.create"),
  validateBody(createRequestSchema),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    createPerUser.consume(user.id);
    if (!inScope(user.borrowScope, await categoryOfUnit(req.body.unitId))) {
      throw new HttpError(
        403,
        t((m) => m.errors.categoryNotBorrowable)
      );
    }
    res.status(201).json(await createRequest(user.id, req.body, user.rules));
  })
);

requestRouter.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    res.json(await cancelRequest(routeParam(req, "id"), req.user!.id));
  })
);

requestRouter.post(
  "/:id/approve",
  requirePermission("requests.decide"),
  asyncHandler(async (req, res) => {
    assertManageScope(req.user!, await categoryOfRequest(routeParam(req, "id")));
    res.json(await approveRequest(routeParam(req, "id"), req.user!.id));
  })
);

requestRouter.post(
  "/:id/reject",
  requirePermission("requests.decide"),
  validateBody(rejectRequestSchema),
  asyncHandler(async (req, res) => {
    assertManageScope(req.user!, await categoryOfRequest(routeParam(req, "id")));
    res.json(await rejectRequest(routeParam(req, "id"), req.body.rejectionReason, req.user!.id));
  })
);

requestRouter.post(
  "/:id/return",
  requirePermission("loans.manage"),
  asyncHandler(async (req, res) => {
    assertManageScope(req.user!, await categoryOfRequest(routeParam(req, "id")));
    res.json(await returnRequest(routeParam(req, "id"), req.user!.id));
  })
);
