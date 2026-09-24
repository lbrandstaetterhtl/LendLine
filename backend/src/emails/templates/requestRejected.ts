import type { MailDevice, MailMessage } from "../format.js";

import { layout, escapeHtml } from "../format.js";

export function requestRejectedTemplate(input: {
  recipientName: string;
  device: MailDevice;
  rejectionReason: string;
}): MailMessage {
  const reason = input.rejectionReason.trim() || "Es wurde kein Ablehnungsgrund angegeben.";
  const subject = `Ausleihe abgelehnt: ${input.device.name}`;
  const text = [
    `Guten Tag ${input.recipientName},`,
    "",
    "Ihre Ausleihanfrage wurde abgelehnt.",
    "",
    `Gerät: ${input.device.name}`,
    `Kategorie: ${input.device.category}`,
    `Seriennummer: ${input.device.serialNumber}`,
    `Grund: ${reason}`,
    "",
    "Mit freundlichen Grüßen",
    "IT-Geräteausleihe",
  ].join("\n");

  const html = layout(
    "Ausleihe abgelehnt",
    `<p>Guten Tag ${escapeHtml(input.recipientName)},</p>
     <p>Ihre Ausleihanfrage wurde abgelehnt.</p>
     <table cellpadding="4" cellspacing="0" style="border-collapse: collapse;">
       <tr><td>Gerät</td><td>${escapeHtml(input.device.name)}</td></tr>
       <tr><td>Kategorie</td><td>${escapeHtml(input.device.category)}</td></tr>
       <tr><td>Seriennummer</td><td>${escapeHtml(input.device.serialNumber)}</td></tr>
       <tr><td>Grund</td><td>${escapeHtml(reason)}</td></tr>
     </table>`
  );

  return { subject, text, html };
}
