import type { NextFunction, Request, Response } from "express";

import { AsyncLocalStorage } from "node:async_hooks";

type RequestContext = { ip: string | null; userAgent: string | null };

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Makes the caller's IP and user agent available to code deeper in the request (the audit log).
 */
export function requestContext(req: Request, _res: Response, next: NextFunction): void {
  const userAgent = req.header("user-agent") ?? null;
  storage.run({ ip: req.ip ?? null, userAgent: userAgent?.slice(0, 300) ?? null }, next);
}

export function currentRequest(): RequestContext {
  return storage.getStore() ?? { ip: null, userAgent: null };
}
