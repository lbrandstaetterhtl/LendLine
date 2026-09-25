import { z } from "zod";

const status = z.enum(["AVAILABLE", "BORROWED", "DEFECTIVE"]);

const unitSchema = z.object({
  id: z.string().min(1).optional(),
  serialNumber: z.string().trim().min(2, "validation.serialMin").max(80),
  status: z.enum(["AVAILABLE", "DEFECTIVE", "BORROWED"]),
});

/**
 * Free properties of a device model ("RAM: 16 GB"). Names are unique per device regardless of case,
 * so "RAM" and "ram" cannot both appear.
 */
const deviceFieldsSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1, "validation.propertyName").max(40),
      value: z.string().trim().min(1, "validation.propertyValue").max(200),
    })
  )
  .max(30, "validation.propertiesMax")
  .refine(
    (fields) => new Set(fields.map((field) => field.name.toLowerCase())).size === fields.length,
    "validation.propertyUnique"
  );

export const deviceCreateSchema = z.object({
  name: z.string().trim().min(2, "validation.nameMin").max(160),
  categoryId: z.string().min(1, "validation.categoryMissing"),
  description: z.string().trim().max(2000).optional().default(""),
  units: z.array(unitSchema).min(1, "validation.unitsMin"),
  fields: deviceFieldsSchema.optional().default([]),
});

export const deviceUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  categoryId: z.string().min(1).optional(),
  description: z.string().trim().max(2000).optional(),
  units: z.array(unitSchema).min(1).optional(),
  fields: deviceFieldsSchema.optional(),
});

export const deviceQuerySchema = z.object({
  categoryId: z.string().trim().optional(),
  status: z.union([status, z.literal("")]).optional(),
  // Property filter: both parts needed, the value must match exactly.
  field: z.string().trim().max(40).optional(),
  value: z.string().trim().max(200).optional(),
});
