/**
 * Keyboard shortcuts: one list for the handler in Layout and the explanation on the help page.
 */
/**
 * Which shortcuts a person gets follows from the pages they may open (auth/permissions.ts).
 */
export type GoShortcut = { key: string; to: string; label: string };

/**
 * "g" followed by one of these keys jumps to the page.
 */
export const goShortcuts: GoShortcut[] = [
  { key: "s", to: "/search", label: "Stück suchen" },
  { key: "k", to: "/devices", label: "Gerätekatalog" },
  { key: "m", to: "/my-requests", label: "Meine Anfragen" },
  { key: "h", to: "/hilfe", label: "Bedienung" },
  { key: "u", to: "/admin", label: "Übersicht" },
  { key: "a", to: "/admin/requests", label: "Anfragen" },
  { key: "l", to: "/admin/borrowed", label: "Ausleihen" },
  { key: "g", to: "/admin/devices", label: "Geräte" },
  { key: "t", to: "/admin/categories", label: "Kategorien" },
  { key: "r", to: "/admin/rooms", label: "Räume" },
  { key: "b", to: "/admin/users", label: "Benutzer" },
  { key: "q", to: "/admin/gruppen", label: "Gruppen" },
  { key: "p", to: "/admin/protokoll", label: "Protokoll" },
  { key: "o", to: "/admin/modus", label: "Einstellungen: Modus" },
  {
    key: "e",
    to: "/admin/erscheinungsbild",
    label: "Einstellungen: Erscheinungsbild",
  },
  { key: "i", to: "/admin/einstellungen", label: "Einstellungen: Regeln & Formular" },
  { key: "v", to: "/admin/emails", label: "Einstellungen: E-Mails" },
  { key: "w", to: "/admin/wartung", label: "Einstellungen: Wartung" },
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
