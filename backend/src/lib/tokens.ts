import jwt from "jsonwebtoken";
import crypto from "node:crypto";

import { config } from "../config.js";

export type AccessPayload = {
  sub: string;
  /**
   * The user's `sessionVersion` at issue time; raising it invalidates every access token at once.
   */
  sv: number;
};

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, config.jwtAccessSecret, {
    algorithm: "HS256",
    expiresIn: config.jwtAccessTtlSeconds,
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, config.jwtAccessSecret, { algorithms: ["HS256"] });
  if (typeof decoded === "string" || !decoded.sub || typeof decoded.sv !== "number") {
    throw new Error("Ungültiges Access-Token");
  }
  return { sub: decoded.sub, sv: decoded.sv };
}

export function createRefreshToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
