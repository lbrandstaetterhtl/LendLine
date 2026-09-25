import type { MailMessage } from "./format.js";

import { createTransport } from "nodemailer";

import { config } from "../config.js";
import { getSetting } from "../services/settingsService.js";

/**
 * SMTP_FROM with the company's display name, if one is set. The address itself stays in the server
 * configuration: it must match what the mail server allows to send.
 */
async function sender(): Promise<string | { name: string; address: string }> {
  const { senderName } = await getSetting("mail");
  const name = senderName.replaceAll(/[\r\n"<>]/g, "").trim();
  if (!name) return config.smtp.from;
  const address = /<([^>]+)>/.exec(config.smtp.from)?.[1] ?? config.smtp.from;
  return { name, address };
}

function smtpConfigured(): boolean {
  return Boolean(config.smtp.host);
}

export async function sendMail(to: string, message: MailMessage): Promise<void> {
  if (!smtpConfigured()) {
    console.info(
      `[mail] SMTP nicht konfiguriert. Nachricht an ${to}: ${message.subject}\n${message.text}`
    );
    return;
  }

  const transporter = createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });

  await transporter.sendMail({
    from: await sender(),
    to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
