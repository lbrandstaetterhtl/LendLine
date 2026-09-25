import type { Request } from "express";

import { t } from "../i18n/index.js";
import { HttpError } from "./errors.js";

/**
 * Reads a required route parameter such as `:id`; a missing one is a client error.
 */
export function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value)
    throw new HttpError(
      400,
      t((m) => m.errors.paramMissing, { name })
    );
  return value;
}
