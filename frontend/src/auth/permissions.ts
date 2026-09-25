import type { User } from "../types";
import type { UiFeature } from "../ui/UiContext";

/**
 * Permission keys as the API defines them (backend/src/lib/permissions.ts). The API checks every
 * request; this list only decides what the interface shows.
 */
export type Permission =
  | "catalog.view"
  | "requests.create"
  | "dashboard.view"
  | "requests.view"
  | "requests.decide"
  | "loans.manage"
  | "calendar.names"
  | "devices.manage"
  | "devices.images"
  | "devices.defective"
  | "categories.manage"
  | "rooms.manage"
  | "users.view"
  | "users.manage"
  | "users.emergency"
  | "groups.manage"
  | "audit.view"
  | "settings.mode"
  | "settings.appearance"
  | "settings.rules"
  | "settings.mail"
  | "maintenance.manage"
  | "maintenance.bypass";

/**
 * What a page needs: any one of the listed permissions. Pages not listed are open to everyone
 * signed in ("Meine Anfragen", "Mein Konto", "Hilfe").
 */
const pagePermissions: Record<string, Permission[]> = {
  "/search": ["catalog.view"],
  "/devices": ["catalog.view"],
  "/admin": ["dashboard.view"],
  "/admin/requests": ["requests.view"],
  "/admin/borrowed": ["loans.manage"],
  "/admin/devices": ["devices.manage", "devices.images", "devices.defective"],
  "/admin/categories": ["categories.manage"],
  "/admin/rooms": ["rooms.manage"],
  "/admin/users": ["users.view"],
  "/admin/gruppen": ["users.view", "groups.manage"],
  "/admin/protokoll": ["audit.view"],
  "/admin/erscheinungsbild": ["settings.appearance"],
  "/admin/einstellungen": ["settings.rules"],
  "/admin/emails": ["settings.mail"],
  "/admin/wartung": ["maintenance.manage"],
  "/admin/modus": ["settings.mode"],
};

/**
 * Pages that belong to an area the settings mode can hide.
 */
const pageFeatures: Record<string, UiFeature> = {
  "/admin/gruppen": "groups",
  "/admin/emails": "emails",
  "/admin/wartung": "maintenance",
  "/admin/protokoll": "audit",
};

export function can(user: User | null | undefined, permission: Permission): boolean {
  return Boolean(user?.permissions.includes(permission));
}

/**
 * `features` from the settings mode; without them (still loading) every area counts as shown.
 */
export function canOpen(
  user: User | null | undefined,
  path: string,
  features?: Record<UiFeature, boolean> | null
): boolean {
  const page = path.split("?")[0] ?? path;
  const feature = pageFeatures[page];
  if (feature && features && !features[feature]) return false;
  const needed = pagePermissions[page];
  return !needed || needed.some((permission) => can(user, permission));
}

/**
 * The first page that is useful for this person.
 */
export function homePath(user: User | null | undefined): string {
  if (can(user, "dashboard.view")) return "/admin";
  if (can(user, "catalog.view")) return "/search";
  return "/my-requests";
}
