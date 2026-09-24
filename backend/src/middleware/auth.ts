import type { Role } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";

import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
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
 * Valid access token required; during maintenance only admins get through (503 otherwise). The role
 * comes from the database, not the token: a deleted or demoted account loses access at once instead
 * of when its token expires.
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
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true },
  });
  if (!user) throw new HttpError(401, "Sitzung abgelaufen. Bitte erneut anmelden.");
  await assertAccessDuringMaintenance(user.role);
  req.user = { id: user.id, role: user.role };
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
