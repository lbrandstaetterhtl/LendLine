import { accentCss } from "./palette";

export type Appearance = {
  font: "standard" | "system" | "humanist" | "serif" | "rounded";
  fontSize: "small" | "normal" | "large";
  radius: "square" | "standard" | "round";
  sidebar: "standard" | "tinted" | "accent";
};

export const fontStacks: Record<Appearance["font"], string> = {
  standard: "", // global.css
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  // Not led by Segoe UI: that is the standard font on Windows, so nothing would change there.
  humanist: 'Calibri, Candara, "Gill Sans", "Trebuchet MS", sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", serif',
  rounded: 'ui-rounded, "Nunito", "Varela Round", "Arial Rounded MT Bold", "Segoe UI", sans-serif',
};

// global.css sizes everything in px, so `zoom` is the one switch that scales text and controls.
const zoom: Record<Appearance["fontSize"], string> = { small: "0.93", normal: "", large: "1.1" };

const radius: Record<Appearance["radius"], [string, string] | null> = {
  square: ["1px", "1px"],
  standard: null,
  round: ["12px", "8px"],
};

/**
 * The sidebar's own palette. "accent" paints it in the accent colour, so everything inside that
 * normally uses the accent (counters, the logo tile) swaps to the accent's contrast colour.
 */
const sidebarCss: Record<Appearance["sidebar"], string> = {
  standard: "",
  tinted: "html .sidebar { background: color-mix(in srgb, var(--accent) 7%, var(--surface)); }",
  accent: [
    "html .sidebar { --surface: var(--accent); --text: var(--accent-contrast); --text-2: var(--accent-contrast);",
    " --muted: color-mix(in srgb, var(--accent-contrast) 72%, transparent);",
    " --subtle: color-mix(in srgb, var(--accent-contrast) 16%, transparent);",
    " --hover: color-mix(in srgb, var(--accent-contrast) 10%, transparent);",
    " --border: color-mix(in srgb, var(--accent-contrast) 20%, transparent);",
    " background: var(--accent); color: var(--accent-contrast); }",
    "html .sidebar .nav-count, html .sidebar .logo { background: var(--accent-contrast); color: var(--accent); }",
  ].join(""),
};

/**
 * All company CSS in one string: cached in localStorage and applied by index.html before the first
 * paint. `html:root` / `html .x` outrank global.css whatever the order of the style tags.
 */
export function appearanceCss(accent: string | null, appearance: Appearance): string {
  const root: string[] = [];
  const font = fontStacks[appearance.font];
  if (font) root.push(`font-family: ${font};`);
  const corners = radius[appearance.radius];
  if (corners) root.push(`--radius: ${corners[0]}; --radius-sm: ${corners[1]};`);
  const scale = zoom[appearance.fontSize];
  return [
    accent ? accentCss(accent) : "",
    root.length > 0 ? `html:root { ${root.join(" ")} }` : "",
    scale ? `html body { zoom: ${scale}; }` : "",
    // Form controls do not inherit the font by default.
    font ? "html button, html input, html select, html textarea { font-family: inherit; }" : "",
    sidebarCss[appearance.sidebar],
  ]
    .filter(Boolean)
    .join("\n");
}
