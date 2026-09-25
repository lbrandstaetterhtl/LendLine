import type { Permission } from "../lib/permissions.js";
import type { NextFunction, Request, Response } from "express";

import { t } from "../i18n/index.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/errors.js";
import { withImplied } from "../lib/permissions.js";
import { prisma } from "../lib/prisma.js";
import { verifyAccessToken } from "../lib/tokens.js";
import { assertAccessDuringMaintenance } from "../services/maintenanceService.js";

export type AuthUser = {
  id: string;
  groupId: string;
  permissions: Set<Permission>;
  /**
   * Categories the user may borrow from; null = all.
   */
  borrowScope: string[] | null;
  /**
   * Categories whose requests, loans and devices the user manages; null = all.
   */
  manageScope: string[] | null;
  /**
   * The group's own loan rules; null = the company-wide setting.
   */
  rules: { maxDays: number | null; maxOpenPerUser: number | null; autoApprove: boolean | null };
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function can(user: AuthUser | undefined, permission: Permission): boolean {
  return Boolean(user?.permissions.has(permission));
}

export function inScope(scope: string[] | null, categoryId: string): boolean {
  return scope === null || scope.includes(categoryId);
}

/**
 * For work on requests, loans and devices of one category: outside the group's scope it looks like
 * a missing permission.
 */
export function assertManageScope(user: AuthUser, categoryId: string): void {
  if (!inScope(user.manageScope, categoryId)) {
    throw new HttpError(
      403,
      t((m) => m.errors.categoryNotManaged)
    );
  }
}

// With a password chosen by an admin, only these work until the user picks their own.
const allowedWithTemporaryPassword = new Set([
  "/api/auth/me",
  "/api/auth/password",
  "/api/auth/locale",
]);

/**
 * Valid access token required; during maintenance only groups with `maintenance.bypass` get through
 * (503 otherwise). Group, permissions and session version come from the database on every request:
 * a deleted, moved or signed-out account loses access at once instead of when its token expires.
 */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new HttpError(
      401,
      t((m) => m.errors.loginRequired)
    );
  }
  let payload: ReturnType<typeof verifyAccessToken>;
  try {
    payload = verifyAccessToken(header.slice(7));
  } catch {
    throw new HttpError(
      401,
      t((m) => m.errors.sessionExpired)
    );
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, sessionVersion: true, mustChangePassword: true, group: true },
  });
  if (!user || user.sessionVersion !== payload.sv) {
    throw new HttpError(
      401,
      t((m) => m.errors.sessionExpired)
    );
  }
  const permissions = new Set(withImplied(user.group.permissions));
  await assertAccessDuringMaintenance(permissions);
  if (user.mustChangePassword && !allowedWithTemporaryPassword.has(req.baseUrl + req.path)) {
    throw new HttpError(
      403,
      t((m) => m.errors.passwordChangeRequired),
      "PASSWORD_CHANGE_REQUIRED"
    );
  }
  const { group } = user;
  req.user = {
    id: user.id,
    groupId: group.id,
    permissions,
    borrowScope: group.borrowCategoryIds.length > 0 ? group.borrowCategoryIds : null,
    manageScope: group.manageCategoryIds.length > 0 ? group.manageCategoryIds : null,
    rules: {
      maxDays: group.maxDays,
      maxOpenPerUser: group.maxOpenPerUser,
      autoApprove: group.autoApprove,
    },
  };
  next();
});

/**
 * Route guard: the user's group must hold `permission` (any of them, if several are given).
 */
export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(
        new HttpError(
          401,
          t((m) => m.errors.loginRequired)
        )
      );
      return;
    }
    if (!permissions.some((permission) => req.user!.permissions.has(permission))) {
      next(
        new HttpError(
          403,
          t((m) => m.errors.forbidden)
        )
      );
      return;
    }
    next();
  };
}
