import type { Role } from "@prisma/client";

import jwt from "jsonwebtoken";
import crypto from "node:crypto";

import { config } from "../config.js";

export type AccessPayload = {
  sub: string;
  role: Role;
};

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, config.jwtAccessSecret, {
    expiresIn: config.jwtAccessTtlSeconds,
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, config.jwtAccessSecret);
  if (
    typeof decoded === "string" ||
    !decoded.sub ||
    (decoded.role !== "USER" && decoded.role !== "ADMIN")
  ) {
    throw new Error("Ungültiges Access-Token");
  }
  return { sub: decoded.sub, role: decoded.role };
}

export function createRefreshToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
