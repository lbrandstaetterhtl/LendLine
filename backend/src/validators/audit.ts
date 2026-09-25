import { z } from "zod";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "validation.dateFormat");

export const auditQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    category: z
      .enum(["requests", "devices", "masterdata", "users", "auth", "system", ""])
      .optional(),
    action: z.string().trim().max(60).optional(),
    actorId: z.string().trim().max(60).optional(),
    userId: z.string().trim().max(60).optional(),
    /**
     * Whole days in local time: `from` counts from 00:00, `to` up to 23:59:59.
     */
    from: day.optional(),
    to: day.optional(),
    cursor: z.string().trim().max(60).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .transform(({ from, to, ...rest }) => ({
    ...rest,
    from: from ? new Date(`${from}T00:00:00`) : undefined,
    to: to ? new Date(`${to}T23:59:59.999`) : undefined,
  }));
