import { z } from "zod";

export const createRequestSchema = z.object({
  unitId: z.string().min(1, "Stück fehlt"),
  roomId: z.string().min(1, "Raum fehlt"),
  startsAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Startzeit im Format JJJJ-MM-TTTHH:MM angeben"),
  desiredUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Endzeit im Format JJJJ-MM-TTTHH:MM angeben"),
  comment: z.string().trim().max(1000).optional().default(""),
});

export const rejectRequestSchema = z.object({
  rejectionReason: z.string().trim().max(1000).optional().default(""),
});

export const requestQuerySchema = z.object({
  status: z.enum(["OPEN", "APPROVED", "REJECTED", "RETURNED", ""]).optional(),
});
