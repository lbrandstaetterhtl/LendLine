/**
 * Every permission a group can hold, in the order of the group page. Labels and hints are in the
 * dictionaries (`i18n/*.ts`, `permissions`); the default groups are in the migration
 * `20260925140000_groups`.
 */
export const permissionSections = [
  { id: "borrow", permissions: ["catalog.view", "requests.create"] },
  {
    id: "review",
    permissions: [
      "dashboard.view",
      "requests.view",
      "requests.decide",
      "loans.manage",
      "calendar.names",
    ],
  },
  {
    id: "inventory",
    permissions: [
      "devices.manage",
      "devices.images",
      "devices.defective",
      "categories.manage",
      "rooms.manage",
    ],
  },
  { id: "people", permissions: ["users.view", "users.manage", "users.emergency", "groups.manage"] },
  {
    id: "system",
    permissions: [
      "audit.view",
      "settings.mode",
      "settings.appearance",
      "settings.rules",
      "settings.mail",
      "maintenance.manage",
      "maintenance.bypass",
    ],
  },
] as const;

export type Permission = (typeof permissionSections)[number]["permissions"][number];

export const allPermissions: Permission[] = permissionSections.flatMap(
  (section) => section.permissions
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
