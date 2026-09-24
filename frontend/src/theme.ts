/**
 * Colour theme: "system" follows the OS setting, "light"/"dark" override it. The choice lives in
 * localStorage per browser; index.html applies it before the first paint to avoid a flash.
 */
export type ThemeChoice = "system" | "light" | "dark";

const STORAGE_KEY = "lendline-theme";

export function readTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Storage blocked (private mode): the choice still applies until the page reloads.
  }
}
