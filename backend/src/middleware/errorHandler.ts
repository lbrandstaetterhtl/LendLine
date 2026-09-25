import type { NextFunction, Request, Response } from "express";

import { type ZodIssue, ZodError } from "zod";

import { messages, t } from "../i18n/index.js";
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
    res.status(400).json({ error: unique(err.issues.map(describeIssue)).join(" ") });
    return;
  }
  if (isBodyParserError(err)) {
    res.status(err.status).json({
      error:
        err.status === 413 ? t((m) => m.errors.requestTooLarge) : t((m) => m.errors.invalidBody),
    });
    return;
  }
  console.error(err);
  res.status(500).json({ error: t((m) => m.errors.internal) });
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

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Own checks carry a key ("validation.nameMin"); everything else gets a generic message by kind, in
 * the language of the request (Zod's own defaults are English).
 */
function describeIssue(issue: ZodIssue): string {
  const m = messages();
  if (issue.message.startsWith("validation.")) {
    const key = issue.message.slice("validation.".length);
    if (key in m.validation) return m.validation[key as keyof typeof m.validation];
  }
  if (issue.code === "invalid_type") {
    return issue.received === "undefined" || issue.received === "null"
      ? m.zod.required
      : m.zod.invalid;
  }
  if (issue.code === "too_small") {
    const min = Number(issue.minimum);
    if (issue.type === "string") return t((d) => d.zod.tooShort, { min });
    if (issue.type === "array") return t((d) => d.zod.tooFewItems, { min });
    return t((d) => d.zod.tooSmall, { min });
  }
  if (issue.code === "too_big") {
    const max = Number(issue.maximum);
    if (issue.type === "string") return t((d) => d.zod.tooLong, { max });
    if (issue.type === "array") return t((d) => d.zod.tooManyItems, { max });
    return t((d) => d.zod.tooBig, { max });
  }
  if (
    issue.code === "invalid_enum_value" ||
    issue.code === "invalid_union" ||
    issue.code === "invalid_literal"
  ) {
    return m.zod.invalidChoice;
  }
  return m.zod.invalid;
}
