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
  if (isBodyParserError(err)) {
    res
      .status(err.status)
      .json({ error: err.status === 413 ? "Anfrage ist zu groß" : "Ungültiger Anfrage-Inhalt" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Interner Serverfehler" });
}

/**
 * Errors from express.json() (malformed JSON, body too large): client errors, no stack trace.
 */
function isBodyParserError(err: unknown): err is { status: number } {
  return (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    typeof err.type === "string" &&
    err.type.startsWith("entity.") &&
    "status" in err &&
    typeof err.status === "number" &&
    err.status >= 400 &&
    err.status < 500
  );
}
