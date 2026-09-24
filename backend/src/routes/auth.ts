import { Router } from "express";

import { config } from "../config.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { login, logout, refresh, register, getMe } from "../services/authService.js";
import { getMaintenance } from "../services/maintenanceService.js";
import { loginSchema, registerSchema } from "../validators/auth.js";

export const REFRESH_COOKIE = "refreshToken";

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.nodeEnv === "production",
    path: "/api/auth",
    maxAge: config.jwtRefreshTtlDays * 24 * 60 * 60 * 1000,
  };
}

function refreshCookie(cookies: unknown): string | undefined {
  const value = (cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
  return typeof value === "string" ? value : undefined;
}

export const authRouter = Router();

authRouter.get(
  "/options",
  asyncHandler(async (_req, res) => {
    const maintenance = await getMaintenance();
    res.json({
      ldapEnabled: config.ldap.enabled,
      allowLocalRegister:
        !maintenance.enabled && (!config.ldap.enabled || config.ldap.allowLocalRegister),
      // Public: only what the login page shows, not who switched it on.
      maintenance: maintenance.enabled
        ? { enabled: true, message: maintenance.message, until: maintenance.until }
        : { enabled: false },
    });
  })
);

authRouter.post(
  "/register",
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await register(req.body);
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions());
    res.status(201).json({ user: result.user, accessToken: result.accessToken });
  })
);

authRouter.post(
  "/login",
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await login(req.body);
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions());
    res.json({ user: result.user, accessToken: result.accessToken });
  })
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const result = await refresh(refreshCookie(req.cookies));
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions());
    res.json({ user: result.user, accessToken: result.accessToken });
  })
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    await logout(refreshCookie(req.cookies));
    res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });
    res.status(204).send();
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getMe(req.user!.id));
  })
);
