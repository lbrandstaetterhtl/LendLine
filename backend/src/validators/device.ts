import { z } from "zod";

const status = z.enum(["AVAILABLE", "BORROWED", "DEFECTIVE"]);

const unitSchema = z.object({
  id: z.string().min(1).optional(),
  serialNumber: z.string().trim().min(2, "Seriennummer muss mindestens 2 Zeichen haben").max(80),
  status: z.enum(["AVAILABLE", "DEFECTIVE", "BORROWED"]),
});

export const deviceCreateSchema = z.object({
  name: z.string().trim().min(2, "Name muss mindestens 2 Zeichen haben").max(160),
  categoryId: z.string().min(1, "Kategorie fehlt"),
  description: z.string().trim().max(2000).optional().default(""),
  units: z.array(unitSchema).min(1, "Mindestens ein Stück anlegen"),
});

export const deviceUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  categoryId: z.string().min(1).optional(),
  description: z.string().trim().max(2000).optional(),
  units: z.array(unitSchema).min(1).optional(),
});

export const deviceQuerySchema = z.object({
  categoryId: z.string().trim().optional(),
  status: z.union([status, z.literal("")]).optional(),
});
