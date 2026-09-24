import type { NextFunction, Request, Response } from "express";

import { ZodError } from "zod";

import { HttpError } from "../lib/errors.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues.map((issue) => issue.message).join(" ") });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Interner Serverfehler" });
}
