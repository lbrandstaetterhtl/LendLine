import type { Locale } from "../i18n/locales.js";
import type { NextFunction, Request, Response } from "express";

import { AsyncLocalStorage } from "node:async_hooks";

import { resolveLocale } from "../i18n/locales.js";

type RequestContext = {
  ip: string | null;
  userAgent: string | null;
  /**
   * The language the client asked for (Accept-Language); errors and messages use it.
   */
  locale: Locale | null;
};

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Makes the caller's IP and user agent available to code deeper in the request (the audit log).
 */
export function requestContext(req: Request, _res: Response, next: NextFunction): void {
  const userAgent = req.header("user-agent") ?? null;
  storage.run(
    {
      ip: req.ip ?? null,
      userAgent: userAgent?.slice(0, 300) ?? null,
      locale: resolveLocale(req.header("accept-language")),
    },
    next
  );
}

export function currentRequest(): RequestContext {
  return storage.getStore() ?? { ip: null, userAgent: null, locale: null };
}
