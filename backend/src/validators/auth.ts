import { z } from "zod";

/**
 * Bcrypt only uses the first 72 bytes; a longer password would silently be cut short.
 */
export const newPassword = z
  .string()
  .min(8, "Passwort muss mindestens 8 Zeichen haben")
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Passwort darf höchstens 72 Byte lang sein (ca. 72 Zeichen ohne Umlaute)"
  );

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name muss mindestens 2 Zeichen haben").max(120),
  email: z.string().trim().email("Ungültige E-Mail-Adresse").max(200),
  password: newPassword,
});

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Benutzername oder E-Mail fehlt").max(200),
  password: z.string().min(1, "Passwort fehlt").max(200),
});
