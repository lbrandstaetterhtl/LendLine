import type { MailDevice, MailMessage } from "../format.js";

import { formatDate, layout, escapeHtml } from "../format.js";

export function deviceReturnedTemplate(input: {
  recipientName: string;
  device: MailDevice;
  returnedAt: Date;
}): MailMessage {
  const returned = formatDate(input.returnedAt);
  const subject = `Rückgabe erfasst: ${input.device.name}`;
  const text = [
    `Guten Tag ${input.recipientName},`,
    "",
    "Die Rückgabe des folgenden Geräts wurde erfasst.",
    "",
    `Gerät: ${input.device.name}`,
    `Kategorie: ${input.device.category}`,
    `Seriennummer: ${input.device.serialNumber}`,
    `Rückgabe am: ${returned}`,
    "",
    "Damit ist die Ausleihe abgeschlossen.",
    "",
    "Mit freundlichen Grüßen",
    "IT-Geräteausleihe",
  ].join("\n");

  const html = layout(
    "Rückgabe erfasst",
    `<p>Guten Tag ${escapeHtml(input.recipientName)},</p>
     <p>Die Rückgabe des folgenden Geräts wurde erfasst. Die Ausleihe ist damit abgeschlossen.</p>
     <table cellpadding="4" cellspacing="0" style="border-collapse: collapse;">
       <tr><td>Gerät</td><td>${escapeHtml(input.device.name)}</td></tr>
       <tr><td>Kategorie</td><td>${escapeHtml(input.device.category)}</td></tr>
       <tr><td>Seriennummer</td><td>${escapeHtml(input.device.serialNumber)}</td></tr>
       <tr><td>Rückgabe am</td><td>${escapeHtml(returned)}</td></tr>
     </table>`
  );

  return { subject, text, html };
}
