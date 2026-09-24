import type { MailDevice, MailMessage } from "../format.js";

import { formatDate, layout, escapeHtml } from "../format.js";

export function requestApprovedTemplate(input: {
  recipientName: string;
  device: MailDevice;
  startsAt: Date;
  desiredUntil: Date;
  roomName?: string;
}): MailMessage {
  const from = formatDate(input.startsAt);
  const until = formatDate(input.desiredUntil);
  const subject = `Ausleihe bestätigt: ${input.device.name}`;
  const text = [
    `Guten Tag ${input.recipientName},`,
    "",
    "Ihre Ausleihanfrage wurde bestätigt.",
    "",
    `Gerät: ${input.device.name}`,
    `Kategorie: ${input.device.category}`,
    `Seriennummer: ${input.device.serialNumber}`,
    `Zeitraum: ${from} bis ${until}`,
    `Raum: ${input.roomName || "–"}`,
    "",
    "Bitte holen Sie das Gerät in der IT-Ausleihe ab und bringen Sie einen Lichtbildausweis mit.",
    "Geben Sie das Gerät spätestens am genannten Datum vollständig und unbeschädigt zurück.",
    "",
    "Mit freundlichen Grüßen",
    "IT-Geräteausleihe",
  ].join("\n");

  const html = layout(
    "Ausleihe bestätigt",
    `<p>Guten Tag ${escapeHtml(input.recipientName)},</p>
     <p>Ihre Ausleihanfrage wurde bestätigt.</p>
     <table cellpadding="4" cellspacing="0" style="border-collapse: collapse;">
       <tr><td>Gerät</td><td>${escapeHtml(input.device.name)}</td></tr>
       <tr><td>Kategorie</td><td>${escapeHtml(input.device.category)}</td></tr>
       <tr><td>Seriennummer</td><td>${escapeHtml(input.device.serialNumber)}</td></tr>
       <tr><td>Zeitraum</td><td>${escapeHtml(from)} bis ${escapeHtml(until)}</td></tr>
       <tr><td>Raum</td><td>${escapeHtml(input.roomName || "–")}</td></tr>
     </table>
     <p>Bitte holen Sie das Gerät in der IT-Ausleihe ab und bringen Sie einen Lichtbildausweis mit.</p>
     <p>Geben Sie das Gerät spätestens am genannten Datum vollständig und unbeschädigt zurück.</p>`
  );

  return { subject, text, html };
}
