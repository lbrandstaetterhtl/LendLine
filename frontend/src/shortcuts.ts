import type { Terms } from "./branding/BrandingContext";
import type { Messages } from "./i18n/de";

import { format } from "./i18n";

/**
 * Keyboard shortcuts: one list for the handler in Layout and the explanation on the help page.
 */
/**
 * Which shortcuts a person gets follows from the pages they may open (auth/permissions.ts).
 */
export type GoShortcut = {
  key: string;
  to: string;
  label: (m: Messages, terms: Terms) => string;
};

/**
 * "g" followed by one of these keys jumps to the page.
 */
export const goShortcuts: GoShortcut[] = [
  { key: "s", to: "/search", label: (m, terms) => format(m.nav.searchUnits, { unit: terms.unit }) },
  { key: "k", to: "/devices", label: (_m, terms) => terms.catalog },
  { key: "m", to: "/my-requests", label: (m) => m.nav.myRequests },
  { key: "h", to: "/hilfe", label: (m) => m.nav.usage },
  { key: "u", to: "/admin", label: (m) => m.nav.overview },
  { key: "a", to: "/admin/requests", label: (m) => m.nav.requests },
  { key: "l", to: "/admin/borrowed", label: (m) => m.nav.loans },
  { key: "g", to: "/admin/devices", label: (_m, terms) => terms.devices },
  { key: "t", to: "/admin/categories", label: (m) => m.nav.categories },
  { key: "r", to: "/admin/rooms", label: (_m, terms) => terms.rooms },
  { key: "b", to: "/admin/users", label: (m) => m.nav.users },
  { key: "q", to: "/admin/gruppen", label: (m) => m.nav.groups },
  { key: "p", to: "/admin/protokoll", label: (m) => m.nav.audit },
  { key: "o", to: "/admin/modus", label: (m) => m.nav.settingsMode },
  { key: "e", to: "/admin/erscheinungsbild", label: (m) => m.nav.settingsAppearance },
  { key: "i", to: "/admin/einstellungen", label: (m) => m.nav.settingsRules },
  { key: "v", to: "/admin/emails", label: (m) => m.nav.settingsMail },
  { key: "w", to: "/admin/wartung", label: (m) => m.nav.settingsMaintenance },
];

export function goKeyFor(to: string): string | undefined {
  return goShortcuts.find((shortcut) => shortcut.to === to)?.key;
}

/**
 * Typing into a field must never trigger a shortcut.
 */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !["button", "checkbox", "radio", "submit", "reset", "file", "color"].includes(
      target.type
    );
  }
  return false;
}
