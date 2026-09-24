import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name muss mindestens 2 Zeichen haben").max(120),
  email: z.string().trim().email("Ungültige E-Mail-Adresse").max(200),
  password: z.string().min(8, "Passwort muss mindestens 8 Zeichen haben").max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Benutzername oder E-Mail fehlt").max(200),
  password: z.string().min(1, "Passwort fehlt"),
});
