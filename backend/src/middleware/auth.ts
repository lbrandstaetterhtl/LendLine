import type { Role } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";

import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/tokens.js";
import { assertAccessDuringMaintenance } from "../services/maintenanceService.js";

export type AuthUser = {
  id: string;
  role: Role;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Valid access token required; during maintenance only admins get through (503 otherwise).
 */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new HttpError(401, "Anmeldung erforderlich");
  }
  let payload: ReturnType<typeof verifyAccessToken>;
  try {
    payload = verifyAccessToken(header.slice(7));
  } catch {
    throw new HttpError(401, "Sitzung abgelaufen. Bitte erneut anmelden.");
  }
  await assertAccessDuringMaintenance(payload.role);
  req.user = { id: payload.sub, role: payload.role };
  next();
});

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new HttpError(401, "Anmeldung erforderlich"));
    return;
  }
  if (req.user.role !== "ADMIN") {
    next(new HttpError(403, "Keine Berechtigung"));
    return;
  }
  next();
}
