import type { Request } from "express";

import { Router } from "express";

import { config } from "../config.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/errors.js";
import { clientIp, RateLimiter } from "../lib/rateLimit.js";
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

// Password guessing: per address overall, and per address + account so one person's typos
// don't lock out colleagues behind the same NAT. Successful logins are refunded (see below).
const loginPerIp = new RateLimiter(50, 15 * 60 * 1000);
const loginPerAccount = new RateLimiter(10, 15 * 60 * 1000);
const registerPerIp = new RateLimiter(10, 60 * 60 * 1000);

/**
 * The cookie endpoints rely on SameSite=Lax; a cross-origin Origin header is refused as well.
 */
function assertSameOrigin(req: Request): void {
  const origin = req.header("origin");
  if (!origin || origin === config.frontendOrigin) return;
  try {
    if (new URL(origin).host === req.header("host")) return;
  } catch {
    // Malformed Origin: refused below.
  }
  throw new HttpError(403, "Anfrage von fremder Herkunft abgelehnt");
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
    registerPerIp.consume(clientIp(req));
    const result = await register(req.body);
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions());
    res.status(201).json({ user: result.user, accessToken: result.accessToken });
  })
);

authRouter.post(
  "/login",
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const ip = clientIp(req);
    const accountKey = `${ip}|${req.body.email.toLowerCase()}`;
    loginPerIp.consume(ip);
    loginPerAccount.consume(accountKey);
    const result = await login(req.body);
    loginPerIp.refund(ip);
    loginPerAccount.reset(accountKey);
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions());
    res.json({ user: result.user, accessToken: result.accessToken });
  })
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    assertSameOrigin(req);
    const result = await refresh(refreshCookie(req.cookies));
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions());
    res.json({ user: result.user, accessToken: result.accessToken });
  })
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    assertSameOrigin(req);
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
