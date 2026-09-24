/**
 * Turns a company's accent colour into the three accent tokens for light and dark mode. The colour
 * is darkened (light mode) or lightened (dark mode) until it stands out from the page background by
 * at least 3:1, the WCAG minimum for buttons and other controls.
 */
type Rgb = [number, number, number];

export type AccentTokens = { accent: string; hover: string; contrast: string };

const WHITE: Rgb = [255, 255, 255];
const INK: Rgb = [24, 24, 27]; // --text in light mode
const LIGHT_SURFACE: Rgb = WHITE;
const DARK_SURFACE: Rgb = [17, 17, 19]; // --surface in dark mode
const MIN_CONTRAST = 3;

function parseHex(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((part) => Math.round(part).toString(16).padStart(2, "0")).join("")}`;
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return [0, 1, 2].map((i) => from[i]! + (to[i]! - from[i]!) * amount) as Rgb;
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((part) => {
    const c = part / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: Rgb | string, b: Rgb | string): number {
  const la = luminance(typeof a === "string" ? parseHex(a) : a);
  const lb = luminance(typeof b === "string" ? parseHex(b) : b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Moves `color` towards `target` in small steps until it contrasts enough with `surface`.
 */
function ensureContrast(color: Rgb, surface: Rgb, target: Rgb): Rgb {
  let result = color;
  for (let step = 1; step <= 20 && contrastRatio(result, surface) < MIN_CONTRAST; step++) {
    result = mix(color, target, step / 20);
  }
  return result;
}

function tokens(accent: Rgb, hoverTarget: Rgb): AccentTokens {
  return {
    accent: toHex(accent),
    hover: toHex(mix(accent, hoverTarget, 0.12)),
    contrast: contrastRatio(accent, WHITE) >= contrastRatio(accent, INK) ? "#ffffff" : "#18181b",
  };
}

export function accentPalette(hex: string): { light: AccentTokens; dark: AccentTokens } {
  const base = parseHex(hex);
  return {
    light: tokens(ensureContrast(base, LIGHT_SURFACE, [0, 0, 0]), [0, 0, 0]),
    dark: tokens(ensureContrast(base, DARK_SURFACE, WHITE), WHITE),
  };
}

function declarations(t: AccentTokens): string {
  return `--accent: ${t.accent}; --accent-hover: ${t.hover}; --accent-contrast: ${t.contrast};`;
}

/**
 * CSS that overrides the accent tokens of global.css. `html:root` outranks the `:root` rules there
 * even when this style element comes first (index.html inserts it before the stylesheet loads).
 */
export function accentCss(hex: string): string {
  const { light, dark } = accentPalette(hex);
  return [
    `html:root { ${declarations(light)} }`,
    `@media (prefers-color-scheme: dark) { html:root:not([data-theme="light"]) { ${declarations(dark)} } }`,
    `html:root[data-theme="dark"] { ${declarations(dark)} }`,
  ].join("\n");
}
