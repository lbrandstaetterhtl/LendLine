export function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(value);
}

export type MailDevice = {
  name: string;
  category: string;
  serialNumber: string;
};

export type MailMessage = {
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function layout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<body style="font-family: Arial, Helvetica, sans-serif; color: #1c1f24; font-size: 14px; line-height: 1.45;">
  <p style="margin: 0 0 12px; letter-spacing: -0.02em;"><strong>Lend</strong><span style="color: #52525b;">Line</span> <span style="color: #71717a; letter-spacing: 0;">· IT-Geräteausleihe</span></p>
  <h1 style="font-size: 16px; margin: 0 0 12px;">${escapeHtml(title)}</h1>
  ${bodyHtml}
  <p style="margin-top: 20px; color: #5c6370;">Diese Nachricht wurde automatisch erzeugt. Bitte antworten Sie nicht auf diese E-Mail.</p>
</body>
</html>`;
}

export { escapeHtml };
