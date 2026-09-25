import { z } from "zod";

export const createRequestSchema = z.object({
  unitId: z.string().min(1, "validation.unitMissing"),
  // Required or not depends on the company's form settings (requestService checks it).
  roomId: z.string().max(60).optional().default(""),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "validation.startFormat"),
  desiredUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "validation.endFormat"),
  comment: z.string().trim().max(1000).optional().default(""),
  /**
   * Answers to the company's own fields by field id.
   */
  fields: z
    .record(z.string().max(40), z.union([z.string().trim().max(500), z.boolean()]))
    .optional()
    .default({}),
});

export const rejectOpenSchema = z.object({
  reason: z.string().trim().max(1000).optional().default(""),
});

export const rejectRequestSchema = z.object({
  rejectionReason: z.string().trim().max(1000).optional().default(""),
});

export const requestQuerySchema = z.object({
  status: z.enum(["OPEN", "APPROVED", "REJECTED", "RETURNED", "CANCELLED", ""]).optional(),
});
