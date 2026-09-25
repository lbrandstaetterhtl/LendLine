import type { MailSettings } from "../services/settingsService.js";
import type { MailContext, MailDevice, MailMessage } from "./format.js";

import { config } from "../config.js";
import {
  type Locale,
  currentLocale,
  format,
  formatDateFor,
  localizedDefault,
  messages,
} from "../i18n/index.js";
import { mailLogoFile, getBranding } from "../services/brandingService.js";
import { getSetting } from "../services/settingsService.js";
import { composeMail } from "./format.js";

/**
 * Loads the company's mail settings, terms and logo for mails in one language. Settings and terms
 * still at the German default come in that language, texts the company wrote stay as they are.
 *
 * `unsaved` replaces the stored settings (preview of the settings page).
 */
export async function mailContext(
  locale: Locale = currentLocale(),
  unsaved?: MailSettings
): Promise<MailContext> {
  const [stored, branding, logo] = await Promise.all([
    unsaved ?? getSetting("mail"),
    getBranding(),
    mailLogoFile(),
  ]);
  const own = (value: string, pick: (d: ReturnType<typeof messages>["defaults"]) => string) =>
    localizedDefault(value, (m) => pick(m.defaults), locale);
  const settings = {
    ...stored,
    greeting: own(stored.greeting, (d) => d.greeting),
    signature: own(stored.signature, (d) => d.signature),
    footer: own(stored.footer, (d) => d.footer),
    approvedText: own(stored.approvedText, (d) => d.approvedText),
    rejectedText: own(stored.rejectedText, (d) => d.rejectedText),
    returnedText: own(stored.returnedText, (d) => d.returnedText),
  };
  const { terms } = branding;
  return {
    locale,
    settings,
    terms: {
      device: own(terms.device, (d) => d.device),
      unit: own(terms.unit, (d) => d.unit),
      room: own(terms.room, (d) => d.room),
      subtitle: own(terms.subtitle, (d) => d.subtitle),
    },
    logoUrl:
      settings.showLogo && logo ? `${config.frontendOrigin}/api/uploads/branding/${logo}` : null,
    appUrl: config.frontendOrigin,
  };
}

// Every notification leads back to the person's requests (after a login if needed).
const myRequests = (ctx: MailContext) => ({
  label: messages(ctx.locale).mail.linkMyRequests,
  path: "/my-requests",
});

const date = (ctx: MailContext, value: Date) => formatDateFor(value, ctx.locale);

function deviceRows(ctx: MailContext, device: MailDevice): [string, string][] {
  const m = messages(ctx.locale).mail;
  return [
    [ctx.terms.device, device.name],
    [m.category, device.category],
    [m.serial, device.serialNumber],
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
  const m = messages(ctx.locale).mail;
  return composeMail(ctx, {
    subject: format(m.approvedSubject, { device: input.device.name }, ctx.locale),
    title: m.approvedTitle,
    recipientName: input.recipientName,
    intro: m.approvedIntro,
    rows: [
      ...deviceRows(ctx, input.device),
      [
        m.period,
        format(
          m.periodValue,
          { from: date(ctx, input.startsAt), to: date(ctx, input.desiredUntil) },
          ctx.locale
        ),
      ],
      ...(input.roomName ? [[ctx.terms.room, input.roomName] as [string, string]] : []),
      ...(input.fields ?? []).map((field) => [field.label, field.value] as [string, string]),
    ],
    extra: ctx.settings.approvedText,
    link: myRequests(ctx),
  });
}

export function requestRejectedTemplate(
  ctx: MailContext,
  input: { recipientName: string; device: MailDevice; rejectionReason: string }
): MailMessage {
  const m = messages(ctx.locale).mail;
  return composeMail(ctx, {
    subject: format(m.rejectedSubject, { device: input.device.name }, ctx.locale),
    title: m.rejectedTitle,
    recipientName: input.recipientName,
    intro: m.rejectedIntro,
    rows: [
      ...deviceRows(ctx, input.device),
      [m.reason, input.rejectionReason.trim() || m.noReason],
    ],
    extra: ctx.settings.rejectedText,
    link: myRequests(ctx),
  });
}

export function deviceReturnedTemplate(
  ctx: MailContext,
  input: { recipientName: string; device: MailDevice; returnedAt: Date }
): MailMessage {
  const m = messages(ctx.locale).mail;
  return composeMail(ctx, {
    subject: format(m.returnedSubject, { device: input.device.name }, ctx.locale),
    title: m.returnedTitle,
    recipientName: input.recipientName,
    intro: m.returnedIntro,
    rows: [...deviceRows(ctx, input.device), [m.returnedAt, date(ctx, input.returnedAt)]],
    extra: ctx.settings.returnedText,
    link: myRequests(ctx),
  });
}

export function testMailTemplate(ctx: MailContext, input: { recipientName: string }): MailMessage {
  const m = messages(ctx.locale).mail;
  return composeMail(ctx, {
    subject: m.testSubject,
    title: m.testTitle,
    recipientName: input.recipientName,
    intro: format(m.testIntro, { date: date(ctx, new Date()) }, ctx.locale),
    rows: [],
    extra: "",
    link: { label: m.linkApp, path: "/" },
  });
}

/**
 * The approval mail with sample data, for the preview on the e-mail settings page.
 */
export function previewTemplate(ctx: MailContext): MailMessage {
  const m = messages(ctx.locale).mail;
  return requestApprovedTemplate(ctx, {
    recipientName: m.previewName,
    device: { name: "ThinkPad T14", category: "Laptop", serialNumber: "LT-1001" },
    startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    desiredUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    roomName: m.previewRoom,
  });
}
