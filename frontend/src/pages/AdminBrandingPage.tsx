import type { AccentTokens } from "../branding/palette";

import type { CSSProperties } from "react";
import { useRef, useState } from "react";

import { api } from "../api/client";
import { errorMessage } from "../api/useApi";
import { type Branding, useBranding } from "../branding/BrandingContext";
import { accentPalette } from "../branding/palette";
import { Icon } from "../components/icons";
import { LogoMark } from "../components/Logo";
import { Alert, Field, PageHeader } from "../components/ui";

type Variant = "light" | "dark";

const DEFAULT_ACCENT = "#18181b";
const HEX = /^#[0-9a-f]{6}$/i;

const presets = [
  { hex: "#18181b", name: "Schwarz" },
  { hex: "#2563eb", name: "Blau" },
  { hex: "#0f766e", name: "Petrol" },
  { hex: "#16a34a", name: "Grün" },
  { hex: "#ea580c", name: "Orange" },
  { hex: "#dc2626", name: "Rot" },
  { hex: "#9333ea", name: "Violett" },
  { hex: "#db2777", name: "Pink" },
];

export function AdminBrandingPage() {
  const { branding, setBranding } = useBranding();
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");

  function saved(next: Branding, message: string) {
    setBranding(next);
    setError("");
    setInfo(message);
  }

  function failed(err: unknown, fallback: string) {
    setInfo("");
    setError(errorMessage(err, fallback));
  }

  return (
    <>
      <PageHeader
        title="Erscheinungsbild"
        description="Logo und Akzentfarbe Ihrer Firma. Die Änderungen gelten sofort für alle, auch auf der Anmeldeseite."
      />
      <Alert>{error}</Alert>
      <Alert tone="ok">{info}</Alert>

      <div className="dash-grid branding-grid">
        <section className="card">
          <div className="card-title">
            <h2>Logo</h2>
          </div>
          <p className="muted small">
            Erscheint in der Seitenleiste und auf der Anmeldeseite, bis zu 32 px hoch. Am besten
            eignet sich ein SVG oder PNG mit transparentem Hintergrund, höchstens 1 MB.
          </p>
          <div className="logo-slots">
            <LogoSlot variant="light" url={branding.logoUrl} onSaved={saved} onError={failed} />
            <LogoSlot
              variant="dark"
              url={branding.logoDarkUrl}
              fallbackUrl={branding.logoUrl}
              onSaved={saved}
              onError={failed}
            />
          </div>
        </section>

        <AccentForm
          key={branding.accent ?? "default"}
          accent={branding.accent}
          onSaved={saved}
          onError={failed}
        />
      </div>
    </>
  );
}

type SlotProps = {
  variant: Variant;
  url: string | null;
  /**
   * Shown dimmed when the dark slot is empty: the light logo is used there instead.
   */
  fallbackUrl?: string | null;
  onSaved: (branding: Branding, message: string) => void;
  onError: (err: unknown, fallback: string) => void;
};

function LogoSlot({ variant, url, fallbackUrl, onSaved, onError }: SlotProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const label = variant === "light" ? "Hell" : "Dunkelmodus";

  async function upload(file: File) {
    setBusy(true);
    try {
      const body = new FormData();
      body.append("logo", file);
      const next = await api<Branding>(`/api/admin/branding/logo/${variant}`, {
        method: "POST",
        body,
      });
      onSaved(next, `Logo (${label}) gespeichert.`);
    } catch (err) {
      onError(err, "Hochladen fehlgeschlagen");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    if (!window.confirm(`Logo (${label}) entfernen?`)) return;
    setBusy(true);
    try {
      const next = await api<Branding>(`/api/admin/branding/logo/${variant}`, {
        method: "DELETE",
      });
      onSaved(next, `Logo (${label}) entfernt.`);
    } catch (err) {
      onError(err, "Entfernen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  const shown = url ?? fallbackUrl ?? null;
  return (
    <div className="logo-slot">
      <div className="logo-slot-head">
        <strong>{label}</strong>
        <span className="muted small">
          {variant === "light"
            ? "für helle Hintergründe"
            : url
              ? "für dunkle Hintergründe"
              : "optional, sonst wird das helle Logo verwendet"}
        </span>
      </div>
      <div className={`logo-preview preview-${variant}`}>
        {shown ? (
          <img src={shown} alt={`Logo ${label}`} className={url ? "" : "is-fallback"} />
        ) : (
          <span className="logo-preview-empty">
            <LogoMark size={28} />
            <span>Standardlogo</span>
          </span>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <div className="form-actions">
        <button
          type="button"
          className="secondary sm"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Icon name="upload" /> {busy ? "Lädt…" : url ? "Ersetzen" : "Hochladen"}
        </button>
        {url && (
          <button type="button" className="ghost sm" disabled={busy} onClick={() => void remove()}>
            Entfernen
          </button>
        )}
      </div>
    </div>
  );
}

type AccentProps = {
  accent: string | null;
  onSaved: (branding: Branding, message: string) => void;
  onError: (err: unknown, fallback: string) => void;
};

function previewStyle(tokens: AccentTokens): CSSProperties {
  return {
    "--accent": tokens.accent,
    "--accent-hover": tokens.hover,
    "--accent-contrast": tokens.contrast,
  } as CSSProperties;
}

function AccentForm({ accent, onSaved, onError }: AccentProps) {
  const [value, setValue] = useState(accent ?? DEFAULT_ACCENT);
  const [saving, setSaving] = useState(false);
  const valid = HEX.test(value);
  const color = valid ? value.toLowerCase() : (accent ?? DEFAULT_ACCENT);
  const palette = accentPalette(color);
  const adjusted = palette.light.accent !== color || palette.dark.accent !== color;
  const unchanged = color === (accent ?? DEFAULT_ACCENT);

  async function save(next: string | null) {
    setSaving(true);
    try {
      const saved = await api<Branding>("/api/admin/branding", {
        method: "PUT",
        body: JSON.stringify({ accent: next }),
      });
      onSaved(
        saved,
        next ? `Akzentfarbe ${next} gespeichert.` : "Standardfarbe wiederhergestellt."
      );
    } catch (err) {
      onError(err, "Speichern fehlgeschlagen");
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <div className="card-title">
        <h2>Akzentfarbe</h2>
        {!accent && <span className="badge st-returned">Standard</span>}
      </div>
      <p className="muted small">
        Für Schaltflächen, Zähler und ausgewählte Filter. Zu helle oder zu dunkle Farben werden je
        nach Modus automatisch angepasst, damit sie lesbar bleiben.
      </p>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          // The default colour is the built-in black/white accent, not a custom one.
          if (valid) void save(color === DEFAULT_ACCENT ? null : color);
        }}
      >
        <div className="swatches">
          {presets.map((preset) => (
            <button
              key={preset.hex}
              type="button"
              className="swatch"
              style={{ background: preset.hex }}
              aria-label={preset.name}
              title={preset.name}
              aria-pressed={color === preset.hex}
              onClick={() => setValue(preset.hex)}
            />
          ))}
        </div>
        <Field
          label="Eigene Farbe"
          htmlFor="accent-hex"
          hint={
            valid ? undefined : (
              <span style={{ color: "var(--bad)" }}>Bitte als #RRGGBB angeben, z. B. #2563eb.</span>
            )
          }
        >
          <div className="color-field">
            <input
              type="color"
              aria-label="Farbe wählen"
              value={color}
              onChange={(event) => setValue(event.target.value)}
            />
            <input
              id="accent-hex"
              value={value}
              maxLength={7}
              spellCheck={false}
              aria-invalid={!valid}
              onChange={(event) => setValue(event.target.value.trim())}
            />
          </div>
        </Field>

        <div className="accent-previews">
          {(["light", "dark"] as const).map((mode) => (
            <div
              key={mode}
              className={`accent-preview preview-${mode}`}
              style={previewStyle(palette[mode])}
            >
              <span className="small">{mode === "light" ? "Hell" : "Dunkel"}</span>
              <div className="accent-preview-row">
                <span className="btn">Anfragen</span>
                <span className="nav-count">3</span>
                <span className="preview-chip">Offen</span>
              </div>
            </div>
          ))}
        </div>
        {adjusted && valid && (
          <p className="muted small">
            Angepasst: {palette.light.accent} im hellen, {palette.dark.accent} im dunklen Modus.
          </p>
        )}

        <div className="form-actions">
          <button type="submit" disabled={saving || !valid || unchanged}>
            Farbe speichern
          </button>
          {accent && (
            <button
              type="button"
              className="ghost"
              disabled={saving}
              onClick={() => void save(null)}
            >
              Standard wiederherstellen
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
