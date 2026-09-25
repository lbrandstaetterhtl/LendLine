/**
 * Keyboard shortcuts: one list for the handler in Layout and the explanation on the help page.
 */
export type GoShortcut = { key: string; to: string; label: string; admin?: boolean };

/**
 * "g" followed by one of these keys jumps to the page.
 */
export const goShortcuts: GoShortcut[] = [
  { key: "s", to: "/search", label: "Stück suchen" },
  { key: "k", to: "/devices", label: "Gerätekatalog" },
  { key: "m", to: "/my-requests", label: "Meine Anfragen" },
  { key: "h", to: "/hilfe", label: "Bedienung" },
  { key: "u", to: "/admin", label: "Übersicht", admin: true },
  { key: "a", to: "/admin/requests", label: "Anfragen", admin: true },
  { key: "l", to: "/admin/borrowed", label: "Ausleihen", admin: true },
  { key: "g", to: "/admin/devices", label: "Geräte", admin: true },
  { key: "t", to: "/admin/categories", label: "Kategorien", admin: true },
  { key: "r", to: "/admin/rooms", label: "Räume", admin: true },
  { key: "b", to: "/admin/users", label: "Benutzer", admin: true },
  { key: "p", to: "/admin/protokoll", label: "Protokoll", admin: true },
  { key: "e", to: "/admin/erscheinungsbild", label: "Erscheinungsbild", admin: true },
  { key: "i", to: "/admin/einstellungen", label: "Einstellungen", admin: true },
  { key: "v", to: "/admin/emails", label: "E-Mail-Vorlagen", admin: true },
  { key: "w", to: "/admin/wartung", label: "Wartung", admin: true },
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
