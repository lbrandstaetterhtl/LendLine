import type { MailContext, MailDevice, MailMessage } from "./format.js";

import { config } from "../config.js";
import { mailLogoFile, getBranding } from "../services/brandingService.js";
import { getSetting } from "../services/settingsService.js";
import { composeMail, formatDate } from "./format.js";

/**
 * Loads the company's mail settings, terms and logo for the next mails.
 */
export async function mailContext(): Promise<MailContext> {
  const [settings, branding, logo] = await Promise.all([
    getSetting("mail"),
    getBranding(),
    mailLogoFile(),
  ]);
  return {
    settings,
    terms: branding.terms,
    logoUrl:
      settings.showLogo && logo ? `${config.frontendOrigin}/api/uploads/branding/${logo}` : null,
    appUrl: config.frontendOrigin,
  };
}

// Every notification leads back to the person's requests (after a login if needed).
const myRequests = { label: "Meine Anfragen öffnen", path: "/my-requests" };

function deviceRows(ctx: MailContext, device: MailDevice): [string, string][] {
  return [
    [ctx.terms.device, device.name],
    ["Kategorie", device.category],
    ["Seriennummer", device.serialNumber],
  ];
}

export function requestApprovedTemplate(
  ctx: MailContext,
  input: {
    recipientName: string;
    device: MailDevice;
    startsAt: Date;
    desiredUntil: Date;
    roomName?: string;
    fields?: { label: string; value: string }[];
  }
): MailMessage {
  return composeMail(ctx, {
    subject: `Ausleihe bestätigt: ${input.device.name}`,
    title: "Ausleihe bestätigt",
    recipientName: input.recipientName,
    intro: "Ihre Ausleihanfrage wurde bestätigt.",
    rows: [
      ...deviceRows(ctx, input.device),
      ["Zeitraum", `${formatDate(input.startsAt)} bis ${formatDate(input.desiredUntil)}`],
      ...(input.roomName ? [[ctx.terms.room, input.roomName] as [string, string]] : []),
      ...(input.fields ?? []).map((field) => [field.label, field.value] as [string, string]),
    ],
    extra: ctx.settings.approvedText,
    link: myRequests,
  });
}

export function requestRejectedTemplate(
  ctx: MailContext,
  input: { recipientName: string; device: MailDevice; rejectionReason: string }
): MailMessage {
  return composeMail(ctx, {
    subject: `Ausleihe abgelehnt: ${input.device.name}`,
    title: "Ausleihe abgelehnt",
    recipientName: input.recipientName,
    intro: "Ihre Ausleihanfrage wurde abgelehnt.",
    rows: [
      ...deviceRows(ctx, input.device),
      ["Grund", input.rejectionReason.trim() || "Es wurde kein Ablehnungsgrund angegeben."],
    ],
    extra: ctx.settings.rejectedText,
    link: myRequests,
  });
}

export function deviceReturnedTemplate(
  ctx: MailContext,
  input: { recipientName: string; device: MailDevice; returnedAt: Date }
): MailMessage {
  return composeMail(ctx, {
    subject: `Rückgabe erfasst: ${input.device.name}`,
    title: "Rückgabe erfasst",
    recipientName: input.recipientName,
    intro: "Die Rückgabe wurde erfasst. Damit ist die Ausleihe abgeschlossen.",
    rows: [...deviceRows(ctx, input.device), ["Rückgabe am", formatDate(input.returnedAt)]],
    extra: ctx.settings.returnedText,
    link: myRequests,
  });
}

export function testMailTemplate(ctx: MailContext, input: { recipientName: string }): MailMessage {
  return composeMail(ctx, {
    subject: "LendLine: Test-E-Mail",
    title: "Test-E-Mail",
    recipientName: input.recipientName,
    intro: `Diese Test-E-Mail wurde am ${formatDate(new Date())} aus dem Wartungsbereich gesendet. Der E-Mail-Versand funktioniert.`,
    rows: [],
    extra: "",
    link: { label: "LendLine öffnen", path: "/" },
  });
}

/**
 * The approval mail with sample data, for the preview on the e-mail settings page.
 */
export function previewTemplate(ctx: MailContext): MailMessage {
  return requestApprovedTemplate(ctx, {
    recipientName: "Max Mustermann",
    device: { name: "ThinkPad T14", category: "Laptop", serialNumber: "LT-1001" },
    startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    desiredUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    roomName: "Besprechungsraum 2",
  });
}
