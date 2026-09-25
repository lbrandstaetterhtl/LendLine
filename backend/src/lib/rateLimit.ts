import type { Request } from "express";

import { HttpError } from "./errors.js";

/**
 * Fixed-window counter per key, kept in memory. With several API processes each counts on its own,
 * so the effective limit is multiplied by the number of processes.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /**
   * Counts one attempt for `key`; throws 429 once the limit for the current window is used up.
   */
  consume(key: string): void {
    const now = Date.now();
    if (this.hits.size > 10_000) this.prune(now);
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }
    entry.count += 1;
    if (entry.count > this.limit) {
      const minutes = Math.ceil((entry.resetAt - now) / 60_000);
      throw new HttpError(
        429,
        `Zu viele Versuche. Bitte in ${minutes} Minute${minutes === 1 ? "" : "n"} erneut versuchen.`,
        "RATE_LIMITED"
      );
    }
  }

  /**
   * Takes back one attempt, e.g. after a successful login, so legitimate use never adds up.
   * Counting first and refunding later keeps parallel requests from slipping past the limit.
   */
  refund(key: string): void {
    const entry = this.hits.get(key);
    if (entry && entry.count > 0) entry.count -= 1;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private prune(now: number): void {
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(key);
    }
  }
}

/**
 * The key for per-address limits. One IPv6 connection usually gets a whole /64 network, so the key
 * is that network; otherwise every new address would start with a fresh limit.
 */
export function clientIp(req: Request): string {
  const ip = req.ip ?? "unknown";
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped?.[1]) return mapped[1];
  if (!ip.includes(":")) return ip;
  const [head = "", tail = ""] = ip.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  const groups = [...headGroups, ...Array<string>(Math.max(missing, 0)).fill("0"), ...tailGroups];
  return `${groups
    .slice(0, 4)
    .map((group) => group.toLowerCase().replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}
