import type { User } from "../types";

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
};

export function can(user: User | null | undefined, permission: Permission): boolean {
  return Boolean(user?.permissions.includes(permission));
}

export function canOpen(user: User | null | undefined, path: string): boolean {
  const needed = pagePermissions[path.split("?")[0] ?? path];
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
