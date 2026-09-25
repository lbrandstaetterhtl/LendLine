/**
 * Areas of the administration that the settings mode can hide ("Einstellungsmodus"). Hiding only
 * simplifies the interface: what is configured keeps working, and the API still accepts changes
 * from people with the permission. What stays in every mode (logo, accent colour, registration,
 * users, categories, rooms, devices, requests) is not listed.
 */
export const uiModes = ["simple", "medium", "full", "custom"] as const;
export type UiMode = (typeof uiModes)[number];

export const uiFeatures = [
  {
    key: "appearance.extended",
    label: "Erweitertes Erscheinungsbild",
    description: "Schrift, Form, Seitenleiste, Browser-Symbol, eigene Begriffe, Anmeldeseite.",
    modes: ["medium", "full"],
  },
  {
    key: "rules.loan",
    label: "Ausleihregeln",
    description: "Höchstdauer, offene Anfragen pro Person, automatische Bestätigung.",
    modes: ["medium", "full"],
  },
  {
    key: "form.custom",
    label: "Anfrageformular anpassen",
    description: "Raum und Kommentar als Pflicht, optional oder ausgeblendet; eigene Felder.",
    modes: ["medium", "full"],
  },
  {
    key: "emails",
    label: "E-Mail-Texte",
    description: "Absendername, Anrede, Signatur, Fußzeile und Texte je Nachricht.",
    modes: ["medium", "full"],
  },
  {
    key: "groups",
    label: "Gruppen und Rechte",
    description:
      "Eigene Gruppen mit einzelnen Rechten. Ohne: nur die vorhandenen Gruppen zuweisen.",
    modes: ["medium", "full"],
  },
  {
    key: "groups.advanced",
    label: "Erweiterte Gruppeneinstellungen",
    description: "Kategorien, eigene Ausleihregeln und Verzeichnisgruppen (LDAP) pro Gruppe.",
    modes: ["full"],
  },
  {
    key: "devices.properties",
    label: "Geräte-Eigenschaften",
    description: "Freie Eigenschaften wie „RAM: 16 GB“ und der Filter danach.",
    modes: ["medium", "full"],
  },
  {
    key: "audit",
    label: "Protokoll",
    description: "Wer wann was geändert hat, mit allen Einzelheiten.",
    modes: ["medium", "full"],
  },
  {
    key: "maintenance",
    label: "Wartung",
    description: "Wartungsmodus, Systemstatus und Aufräumaufgaben.",
    modes: ["full"],
  },
] as const satisfies readonly {
  key: string;
  label: string;
  description: string;
  modes: readonly UiMode[];
}[];

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
