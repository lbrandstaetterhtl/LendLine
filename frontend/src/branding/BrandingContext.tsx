import type { Messages } from "../i18n/de";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import { useI18n } from "../i18n";
import { type Appearance, appearanceCss } from "./appearance";

export type Terms = {
  subtitle: string;
  catalog: string;
  device: string;
  devices: string;
  unit: string;
  units: string;
  room: string;
  rooms: string;
};

export type Branding = {
  accent: string | null;
  logoUrl: string | null;
  logoDarkUrl: string | null;
  faviconUrl: string | null;
  loginImageUrl: string | null;
  appearance: Appearance;
  terms: Terms;
  login: { title: string; text: string };
};

export const DEFAULT_TERMS: Terms = {
  subtitle: "IT-Geräteausleihe",
  catalog: "Gerätekatalog",
  device: "Gerät",
  devices: "Geräte",
  unit: "Stück",
  units: "Stücke",
  room: "Raum",
  rooms: "Räume",
};

const DEFAULT: Branding = {
  accent: null,
  logoUrl: null,
  logoDarkUrl: null,
  faviconUrl: null,
  loginImageUrl: null,
  appearance: { font: "standard", fontSize: "normal", radius: "standard", sidebar: "standard" },
  terms: DEFAULT_TERMS,
  login: { title: "Anmelden", text: "" },
};

type BrandingContextValue = {
  branding: Branding;
  /**
   * Applies a new branding right away, e.g. the response of a save on the admin page.
   */
  setBranding: (branding: Branding) => void;
};

// index.html reads CSS_KEY and ICON_KEY before the first paint; keep the names in sync with it.
const STORAGE_KEY = "lendline-branding";
const CSS_KEY = "lendline-branding-css";
const ICON_KEY = "lendline-branding-icon";
const STYLE_ID = "lendline-branding";
const DEFAULT_ICON = "/favicon.svg";

function readCached(): Branding {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const cached = JSON.parse(raw) as Partial<Branding>;
    // A cache from an older version lacks the newer groups.
    return {
      ...DEFAULT,
      ...cached,
      appearance: { ...DEFAULT.appearance, ...cached.appearance },
      terms: { ...DEFAULT_TERMS, ...cached.terms },
      login: { ...DEFAULT.login, ...cached.login },
    };
  } catch {
    return DEFAULT;
  }
}

function applyCss(css: string): void {
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.append(style);
  }
  style.textContent = css;
}

function applyIcon(url: string | null): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) return;
  link.href = url ?? DEFAULT_ICON;
  // An SVG type on a PNG icon makes some browsers ignore it.
  if (url) link.removeAttribute("type");
  else link.type = "image/svg+xml";
}

function store(branding: Branding, css: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(branding));
    if (css) localStorage.setItem(CSS_KEY, css);
    else localStorage.removeItem(CSS_KEY);
    if (branding.faviconUrl) localStorage.setItem(ICON_KEY, branding.faviconUrl);
    else localStorage.removeItem(ICON_KEY);
  } catch {
    // Storage blocked: the branding still loads from the API, just after the first paint.
  }
}

const BrandingContext = createContext<BrandingContextValue | null>(null);

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setState] = useState<Branding>(readCached);

  const setBranding = useCallback((next: Branding) => {
    setState(next);
    const css = appearanceCss(next.accent, next.appearance);
    applyCss(css);
    applyIcon(next.faviconUrl);
    store(next, css);
  }, []);

  useEffect(() => {
    const session = { active: true };
    void (async () => {
      try {
        const loaded = await api<Branding>("/api/branding");
        if (session.active) setBranding(loaded);
      } catch {
        // API not reachable: keep the cached branding.
      }
    })();
    return () => {
      session.active = false;
    };
  }, [setBranding]);

  const value = useMemo(() => ({ branding, setBranding }), [branding, setBranding]);
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): BrandingContextValue {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error("BrandingProvider fehlt");
  return ctx;
}

/**
 * The company's words for devices, pieces and rooms. A word still at the German default comes in
 * the current language; one the company chose stays as it is.
 */
export function useTerms(): Terms {
  const { terms } = useBranding().branding;
  const { m } = useI18n();
  return useMemo(() => localizeTerms(terms, m), [terms, m]);
}

export function localizeTerms(terms: Terms, m: Messages): Terms {
  const own = (key: keyof Terms) => (terms[key] === DEFAULT_TERMS[key] ? m.terms[key] : terms[key]);
  return {
    subtitle: own("subtitle"),
    catalog: own("catalog"),
    device: own("device"),
    devices: own("devices"),
    unit: own("unit"),
    units: own("units"),
    room: own("room"),
    rooms: own("rooms"),
  };
}

/**
 * Title of the login page, translated while it is the default.
 */
export function loginTitle(branding: Branding, m: Messages): string {
  return branding.login.title === DEFAULT.login.title ? m.terms.loginTitle : branding.login.title;
}
