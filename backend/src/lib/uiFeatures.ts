/**
 * Areas of the administration that the settings mode can hide ("Einstellungsmodus"). Hiding only
 * simplifies the interface: what is configured keeps working, and the API still accepts changes
 * from people with the permission. What stays in every mode (logo, accent colour, registration,
 * users, categories, rooms, devices, requests) is not listed. Labels and descriptions are in the
 * dictionaries (`i18n/*.ts`, `uiFeatures`).
 */
export const uiModes = ["simple", "medium", "full", "custom"] as const;
export type UiMode = (typeof uiModes)[number];

export const uiFeatures = [
  {
    key: "appearance.extended",
    modes: ["medium", "full"],
  },
  {
    key: "rules.loan",
    modes: ["medium", "full"],
  },
  {
    key: "form.custom",
    modes: ["medium", "full"],
  },
  {
    key: "emails",
    modes: ["medium", "full"],
  },
  {
    key: "groups",
    modes: ["medium", "full"],
  },
  {
    key: "groups.advanced",
    modes: ["full"],
  },
  {
    key: "devices.properties",
    modes: ["medium", "full"],
  },
  {
    key: "audit",
    modes: ["medium", "full"],
  },
  {
    key: "maintenance",
    modes: ["full"],
  },
] as const satisfies readonly { key: string; modes: readonly UiMode[] }[];

export type UiFeature = (typeof uiFeatures)[number]["key"];

export const uiFeatureKeys: UiFeature[] = uiFeatures.map((feature) => feature.key);

/**
 * On/off per area: from the preset, or from the own selection for "custom".
 */
export function effectiveFeatures(
  mode: UiMode,
  custom: Partial<Record<string, boolean>>
): Record<UiFeature, boolean> {
  return Object.fromEntries(
    uiFeatures.map((feature) => [
      feature.key,
      mode === "custom"
        ? Boolean(custom[feature.key])
        : (feature.modes as readonly UiMode[]).includes(mode),
    ])
  ) as Record<UiFeature, boolean>;
}
