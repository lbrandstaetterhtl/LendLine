/**
 * Every permission a group can hold. The list is the single source for the checks in the routes,
 * the labels on the group page (GET /api/groups/permissions) and the default groups in the
 * migration `20260925140000_groups`.
 */
export const permissionSections = [
  {
    title: "Ausleihe",
    permissions: [
      {
        key: "catalog.view",
        label: "Katalog und Suche sehen",
        hint: "Geräte, freie Stücke und Belegung ansehen.",
      },
      { key: "requests.create", label: "Geräte anfragen", hint: "Eigene Ausleihanfragen stellen." },
    ],
  },
  {
    title: "Anfragen und Ausleihen",
    permissions: [
      {
        key: "dashboard.view",
        label: "Übersicht sehen",
        hint: "Kennzahlen, offene Anfragen, fällige Rückgaben.",
      },
      {
        key: "requests.view",
        label: "Alle Anfragen sehen",
        hint: "Auch die Anfragen anderer Personen.",
      },
      { key: "requests.decide", label: "Anfragen bestätigen und ablehnen" },
      {
        key: "loans.manage",
        label: "Rückgaben erfassen",
        hint: "Laufende Ausleihen sehen und als zurückgegeben markieren.",
      },
      {
        key: "calendar.names",
        label: "Namen im Belegungskalender sehen",
        hint: "Sonst sieht man nur, dass ein Stück belegt ist.",
      },
    ],
  },
  {
    title: "Bestand",
    permissions: [
      {
        key: "devices.manage",
        label: "Geräte und Stücke verwalten",
        hint: "Anlegen, ändern, löschen, Eigenschaften.",
      },
      { key: "devices.images", label: "Gerätebilder hochladen und entfernen" },
      { key: "devices.defective", label: "Defekte Stücke sehen" },
      { key: "categories.manage", label: "Kategorien verwalten" },
      { key: "rooms.manage", label: "Räume verwalten" },
    ],
  },
  {
    title: "Benutzer",
    permissions: [
      { key: "users.view", label: "Benutzer sehen" },
      {
        key: "users.manage",
        label: "Benutzer anlegen, ändern und löschen",
        hint: "Auch Passwörter zurücksetzen und Gruppen zuweisen.",
      },
      {
        key: "users.emergency",
        label: "Sofortmaßnahmen",
        hint: "Überall abmelden, alle offenen Anfragen einer Person ablehnen.",
      },
      { key: "groups.manage", label: "Gruppen und Rechte verwalten" },
    ],
  },
  {
    title: "System",
    permissions: [
      { key: "audit.view", label: "Protokoll sehen" },
      {
        key: "settings.mode",
        label: "Einstellungsmodus wählen",
        hint: "Einfach, Mittel, Voll oder eigene Auswahl: welche Bereiche die Verwaltung sieht.",
      },
      { key: "settings.appearance", label: "Erscheinungsbild ändern" },
      {
        key: "settings.rules",
        label: "Regeln und Anfrageformular ändern",
        hint: "Auch die Selbstregistrierung.",
      },
      { key: "settings.mail", label: "E-Mail-Texte ändern" },
      {
        key: "maintenance.manage",
        label: "Wartung",
        hint: "Wartungsmodus, Systemstatus, Aufräumaufgaben.",
      },
      { key: "maintenance.bypass", label: "Während der Wartung arbeiten" },
    ],
  },
] as const;

export type Permission = (typeof permissionSections)[number]["permissions"][number]["key"];

export const allPermissions: Permission[] = permissionSections.flatMap((section) =>
  section.permissions.map((permission) => permission.key)
);

export function isPermission(value: string): value is Permission {
  return (allPermissions as string[]).includes(value);
}

/**
 * Permissions that only work together with another one: deciding needs seeing, managing users needs
 * the user list, and so on. Saving a group adds what is implied.
 */
export const implied: Partial<Record<Permission, Permission[]>> = {
  "requests.create": ["catalog.view"],
  "requests.decide": ["requests.view"],
  "loans.manage": ["requests.view"],
  "devices.manage": ["catalog.view"],
  "devices.images": ["catalog.view"],
  "devices.defective": ["catalog.view"],
  "users.manage": ["users.view"],
  "users.emergency": ["users.view"],
  "groups.manage": ["users.view"],
};

export function withImplied(permissions: Iterable<string>): Permission[] {
  const result = new Set<Permission>();
  const add = (permission: Permission) => {
    if (result.has(permission)) return;
    result.add(permission);
    for (const next of implied[permission] ?? []) add(next);
  };
  for (const permission of permissions) if (isPermission(permission)) add(permission);
  return allPermissions.filter((permission) => result.has(permission));
}
