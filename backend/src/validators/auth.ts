import { z } from "zod";

/**
 * Bcrypt only uses the first 72 bytes; a longer password would silently be cut short.
 */
export const newPassword = z
  .string()
  .min(8, "validation.passwordMin")
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "validation.passwordMaxBytes");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "validation.nameMin").max(120),
  email: z.string().trim().email("validation.emailInvalid").max(200),
  password: newPassword,
});

export const loginSchema = z.object({
  email: z.string().trim().min(1, "validation.identifierMissing").max(200),
  password: z.string().min(1, "validation.passwordMissing").max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "validation.currentPasswordMissing").max(200),
  newPassword: newPassword,
});
