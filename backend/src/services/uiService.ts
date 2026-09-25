import type { UiFeature } from "../lib/uiFeatures.js";

import { format, messages } from "../i18n/index.js";
import { prisma } from "../lib/prisma.js";
import { effectiveFeatures, uiFeatures } from "../lib/uiFeatures.js";
import { getBranding } from "./brandingService.js";
import { getMaintenance } from "./maintenanceService.js";
import { getSetting, mailSchema, policySchema } from "./settingsService.js";

/**
 * The mode, the resulting areas and the catalogue for the mode page. Readable by everyone signed
 * in: the interface builds its menu from it.
 */
export async function uiConfig() {
  const ui = await getSetting("ui");
  return {
    mode: ui.mode,
    custom: ui.custom,
    features: effectiveFeatures(ui.mode, ui.custom),
    catalogue: uiFeatures.map((feature) => ({
      ...feature,
      ...messages().uiFeatures[feature.key],
    })),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Areas that are configured (differ from the defaults). Hiding such an area keeps its effect, so
 * the mode page warns before it disappears from view.
 */
export async function uiUsage(): Promise<Partial<Record<UiFeature, string>>> {
  const [policy, mail, branding, maintenance, groups, deviceWithFields] = await Promise.all([
    getSetting("policy"),
    getSetting("mail"),
    getBranding(),
    getMaintenance(),
    prisma.group.findMany(),
    prisma.device.count({ where: { NOT: { fields: { equals: [] } } } }),
  ]);
  const defaults = { policy: policySchema.parse({}), mail: mailSchema.parse({}) };
  const usage: Partial<Record<UiFeature, string>> = {};
  const m = messages().usage;

  const appearance = [
    ...(branding.faviconUrl ? [m.favicon] : []),
    ...(branding.loginImageUrl ? [m.loginImage] : []),
    ...(same(branding.appearance, {
      font: "standard",
      fontSize: "normal",
      radius: "standard",
      sidebar: "standard",
    })
      ? []
      : [m.appearance]),
    ...(branding.terms.device !== "Gerät" ||
    branding.terms.room !== "Raum" ||
    branding.terms.unit !== "Stück"
      ? [m.terms]
      : []),
    ...(branding.login.title !== "Anmelden" || branding.login.text ? [m.loginTexts] : []),
  ];
  if (appearance.length > 0) usage["appearance.extended"] = appearance.join(", ");
  if (!same(policy.rules, defaults.policy.rules)) usage["rules.loan"] = m.rules;
  if (!same(policy.form, defaults.policy.form)) {
    usage["form.custom"] =
      policy.form.fields.length > 0
        ? format(m.formFields, { count: policy.form.fields.length })
        : m.form;
  }
  if (!same(mail, defaults.mail)) usage.emails = m.mail;
  const own = groups.filter((group) => group.id !== "group-admin" && group.id !== "group-user");
  if (own.length > 0) usage.groups = format(m.groups, { count: own.length });
  const advanced = groups.filter(
    (group) =>
      group.borrowCategoryIds.length > 0 ||
      group.manageCategoryIds.length > 0 ||
      group.ldapGroupDns.length > 0 ||
      group.maxDays !== null ||
      group.maxOpenPerUser !== null ||
      group.autoApprove !== null
  );
  if (advanced.length > 0) {
    usage["groups.advanced"] = format(m.groupsAdvanced, {
      groups: advanced.map((group) => `„${group.name}“`).join(", "),
    });
  }
  if (deviceWithFields > 0) {
    usage["devices.properties"] = format(m.devices, { count: deviceWithFields });
  }
  if (maintenance.enabled) usage.maintenance = m.maintenance;
  return usage;
}
