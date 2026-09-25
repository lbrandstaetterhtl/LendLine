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

// With a password chosen by an admin, only these work until the user picks their own.
const allowedWithTemporaryPassword = new Set(["/api/auth/me", "/api/auth/password"]);

/**
 * Valid access token required; during maintenance only admins get through (503 otherwise). Role and
 * session version come from the database, not the token: a deleted, demoted or signed-out account
 * loses access at once instead of when its token expires.
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
    select: { id: true, role: true, sessionVersion: true, mustChangePassword: true },
  });
  if (!user || user.sessionVersion !== payload.sv) {
    throw new HttpError(401, "Sitzung abgelaufen. Bitte erneut anmelden.");
  }
  await assertAccessDuringMaintenance(user.role);
  if (user.mustChangePassword && !allowedWithTemporaryPassword.has(req.baseUrl + req.path)) {
    throw new HttpError(
      403,
      "Bitte legen Sie zuerst ein eigenes Passwort fest.",
      "PASSWORD_CHANGE_REQUIRED"
    );
  }
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
