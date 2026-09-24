import type { MailMessage } from "./format.js";

import nodemailer from "nodemailer";

import { config } from "../config.js";

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

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });

  await transporter.sendMail({
    from: config.smtp.from,
    to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
