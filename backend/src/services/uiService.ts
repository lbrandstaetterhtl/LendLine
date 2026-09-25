import type { UiFeature } from "../lib/uiFeatures.js";

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
    catalogue: uiFeatures,
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

  const appearance = [
    ...(branding.faviconUrl ? ["Browser-Symbol"] : []),
    ...(branding.loginImageUrl ? ["Bild der Anmeldeseite"] : []),
    ...(same(branding.appearance, {
      font: "standard",
      fontSize: "normal",
      radius: "standard",
      sidebar: "standard",
    })
      ? []
      : ["Schrift/Form"]),
    ...(branding.terms.device !== "Gerät" ||
    branding.terms.room !== "Raum" ||
    branding.terms.unit !== "Stück"
      ? ["eigene Begriffe"]
      : []),
    ...(branding.login.title !== "Anmelden" || branding.login.text
      ? ["Texte der Anmeldeseite"]
      : []),
  ];
  if (appearance.length > 0) usage["appearance.extended"] = appearance.join(", ");
  if (!same(policy.rules, defaults.policy.rules)) usage["rules.loan"] = "eigene Ausleihregeln";
  if (!same(policy.form, defaults.policy.form)) {
    usage["form.custom"] =
      policy.form.fields.length > 0
        ? `${policy.form.fields.length} eigene Felder im Anfrageformular`
        : "angepasstes Anfrageformular";
  }
  if (!same(mail, defaults.mail)) usage.emails = "eigene E-Mail-Texte";
  const own = groups.filter((group) => group.id !== "group-admin" && group.id !== "group-user");
  if (own.length > 0) usage.groups = `${own.length} eigene Gruppe${own.length === 1 ? "" : "n"}`;
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
    usage["groups.advanced"] =
      `Kategorien, Regeln oder Verzeichnis in ${advanced.map((group) => `„${group.name}“`).join(", ")}`;
  }
  if (deviceWithFields > 0) {
    usage["devices.properties"] =
      `${deviceWithFields} Gerät${deviceWithFields === 1 ? "" : "e"} mit Eigenschaften`;
  }
  if (maintenance.enabled) usage.maintenance = "der Wartungsmodus ist gerade eingeschaltet";
  return usage;
}
