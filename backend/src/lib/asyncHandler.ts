import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Adapts an async route handler or middleware to Express 4, which ignores returned promises: a
 * rejection is forwarded to the error handler instead of becoming an unhandled rejection.
 * Middleware calls `next()` itself at the end of its body.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch((error: unknown) => {
      // oxlint-disable-next-line promise/no-callback-in-promise -- the one bridge from promises to Express 4's next()
      next(error);
    });
  };
}
