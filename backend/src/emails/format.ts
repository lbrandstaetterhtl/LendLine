import type { MailSettings } from "../services/settingsService.js";

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

/**
 * Everything a company can adjust in its mails, resolved once per sending.
 */
export type MailContext = {
  settings: MailSettings;
  terms: { device: string; unit: string; room: string; subtitle: string };
  /**
   * Absolute URL of the logo (mail programs load it from the server), or null for text only.
   */
  logoUrl: string | null;
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Company text with line breaks, as HTML paragraphs.
 */
function paragraphs(value: string): string {
  return value
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replaceAll("\n", "<br>")}</p>`)
    .join("\n");
}

function header(ctx: MailContext): string {
  if (ctx.logoUrl) {
    return `<p style="margin: 0 0 16px;"><img src="${escapeHtml(ctx.logoUrl)}" alt="" style="max-height: 40px; max-width: 200px;"></p>`;
  }
  const subtitle = ctx.terms.subtitle
    ? ` <span style="color: #71717a; letter-spacing: 0;">· ${escapeHtml(ctx.terms.subtitle)}</span>`
    : "";
  return `<p style="margin: 0 0 12px; letter-spacing: -0.02em;"><strong>Lend</strong><span style="color: #52525b;">Line</span>${subtitle}</p>`;
}

/**
 * One notification: greeting, a sentence, a table of facts, the company's own text, signature and
 * footer. Every piece of data is escaped; company texts are plain text, never HTML.
 */
export function composeMail(
  ctx: MailContext,
  input: {
    subject: string;
    title: string;
    recipientName: string;
    intro: string;
    rows: [label: string, value: string][];
    extra: string;
  }
): MailMessage {
  const { settings } = ctx;
  const greeting = `${settings.greeting || "Guten Tag"} ${input.recipientName},`;
  const text = [
    greeting,
    "",
    input.intro,
    "",
    ...input.rows.map(([label, value]) => `${label}: ${value}`),
    ...(input.extra ? ["", input.extra] : []),
    ...(settings.signature ? ["", settings.signature] : []),
    ...(settings.footer ? ["", "--", settings.footer] : []),
  ].join("\n");

  const rows = input.rows
    .map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`)
    .join("\n       ");
  const html = `<!DOCTYPE html>
<html lang="de">
<body style="font-family: Arial, Helvetica, sans-serif; color: #1c1f24; font-size: 14px; line-height: 1.45;">
  ${header(ctx)}
  <h1 style="font-size: 16px; margin: 0 0 12px;">${escapeHtml(input.title)}</h1>
  <p>${escapeHtml(greeting)}</p>
  <p>${escapeHtml(input.intro)}</p>
  <table cellpadding="4" cellspacing="0" style="border-collapse: collapse;">
       ${rows}
  </table>
  ${paragraphs(input.extra)}
  ${paragraphs(settings.signature)}
  ${settings.footer ? `<p style="margin-top: 20px; color: #5c6370;">${escapeHtml(settings.footer).replaceAll("\n", "<br>")}</p>` : ""}
</body>
</html>`;
  return { subject: input.subject, text, html };
}
