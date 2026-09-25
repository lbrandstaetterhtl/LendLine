import type { Appearance } from "../branding/appearance";
import type { AccentTokens } from "../branding/palette";

import type { CSSProperties, SubmitEvent } from "react";
import { useRef, useState } from "react";

import { api } from "../api/client";
import { errorMessage } from "../api/useApi";
import { fontStacks } from "../branding/appearance";
import { type Branding, DEFAULT_TERMS, type Terms, useBranding } from "../branding/BrandingContext";
import { accentPalette } from "../branding/palette";
import { Icon } from "../components/icons";
import { LogoMark } from "../components/Logo";
import { SettingsTabs } from "../components/SettingsTabs";
import { Alert, Field, PageHeader } from "../components/ui";
import { useFeature } from "../ui/UiContext";

type Slot = "light" | "dark" | "favicon" | "login";

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

type Saved = (branding: Branding, message: string) => void;
type Failed = (err: unknown, fallback: string) => void;

async function saveBranding(patch: object): Promise<Branding> {
  return api<Branding>("/api/admin/branding", { method: "PUT", body: JSON.stringify(patch) });
}

export function AdminBrandingPage() {
  const { branding, setBranding } = useBranding();
  const extended = useFeature("appearance.extended");
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

  // Forms keep their own draft; a new key after a save resets them to what was stored.
  const version = JSON.stringify(branding);

  return (
    <>
      <SettingsTabs />
      <PageHeader
        title="Erscheinungsbild"
        description="Logo, Farben, Schrift und Begriffe Ihrer Firma. Änderungen gelten sofort für alle, auch auf der Anmeldeseite."
      />
      <Alert>{error}</Alert>
      <Alert tone="ok">{info}</Alert>

      <div className="dash-grid branding-grid">
        <section className="card">
          <div className="card-title">
            <h2>Logo</h2>
          </div>
          <p className="muted small">
            Erscheint in der Seitenleiste, auf der Anmeldeseite und (außer SVG) in den E-Mails, bis
            zu 32 px hoch. Am besten ein SVG oder PNG mit transparentem Hintergrund.
          </p>
          <div className="logo-slots">
            <ImageSlot
              slot="light"
              label="Hell"
              hint="für helle Hintergründe"
              url={branding.logoUrl}
              onSaved={saved}
              onError={failed}
            />
            <ImageSlot
              slot="dark"
              label="Dunkelmodus"
              hint={
                branding.logoDarkUrl
                  ? "für dunkle Hintergründe"
                  : "optional, sonst wird das helle Logo verwendet"
              }
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

        {extended && (
          <>
            <StyleForm
              key={`style-${version}`}
              appearance={branding.appearance}
              onSaved={saved}
              onError={failed}
            />

            <section className="card">
              <div className="card-title">
                <h2>Browser-Symbol</h2>
              </div>
              <p className="muted small">
                Das kleine Bild im Browser-Tab und in Lesezeichen. Quadratisch, am besten SVG oder
                PNG ab 64 × 64 px; ICO geht auch.
              </p>
              <div className="logo-slots">
                <ImageSlot
                  slot="favicon"
                  label="Symbol"
                  hint="quadratisch"
                  url={branding.faviconUrl}
                  onSaved={saved}
                  onError={failed}
                />
              </div>
            </section>

            <TermsForm
              key={`terms-${version}`}
              terms={branding.terms}
              onSaved={saved}
              onError={failed}
            />

            <LoginForm
              key={`login-${version}`}
              login={branding.login}
              imageUrl={branding.loginImageUrl}
              onSaved={saved}
              onError={failed}
            />
          </>
        )}
      </div>
    </>
  );
}

type SlotProps = {
  slot: Slot;
  label: string;
  hint: string;
  url: string | null;
  /**
   * Shown dimmed when the slot is empty and another image stands in (dark logo → light logo).
   */
  fallbackUrl?: string | null;
  onSaved: Saved;
  onError: Failed;
};

const slotNames: Record<Slot, string> = {
  light: "Logo (Hell)",
  dark: "Logo (Dunkelmodus)",
  favicon: "Browser-Symbol",
  login: "Bild der Anmeldeseite",
};

function ImageSlot({ slot, label, hint, url, fallbackUrl, onSaved, onError }: SlotProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    try {
      const body = new FormData();
      body.append("image", file);
      const next = await api<Branding>(`/api/admin/branding/image/${slot}`, {
        method: "POST",
        body,
      });
      onSaved(next, `${slotNames[slot]} gespeichert.`);
    } catch (err) {
      onError(err, "Hochladen fehlgeschlagen");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    if (!window.confirm(`${slotNames[slot]} entfernen?`)) return;
    setBusy(true);
    try {
      const next = await api<Branding>(`/api/admin/branding/image/${slot}`, { method: "DELETE" });
      onSaved(next, `${slotNames[slot]} entfernt.`);
    } catch (err) {
      onError(err, "Entfernen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  const shown = url ?? fallbackUrl ?? null;
  const previewClass =
    slot === "login"
      ? "logo-preview photo-preview"
      : `logo-preview preview-${slot === "dark" ? "dark" : "light"}`;
  return (
    <div className="logo-slot">
      <div className="logo-slot-head">
        <strong>{label}</strong>
        <span className="muted small">{hint}</span>
      </div>
      <div className={previewClass}>
        {shown ? (
          <img
            src={shown}
            alt={slotNames[slot]}
            className={`${url ? "" : "is-fallback"}${slot === "favicon" ? " icon-preview" : ""}`}
          />
        ) : (
          <span className="logo-preview-empty">
            {slot === "login" ? <Icon name="image" /> : <LogoMark size={28} />}
            <span>{slot === "login" ? "Kein Bild" : "Standard"}</span>
          </span>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={
          slot === "favicon"
            ? ".svg,.png,.ico,image/svg+xml,image/png,image/x-icon"
            : ".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp"
        }
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

const fontLabels: Record<Appearance["font"], string> = {
  standard: "Standard (Inter / Segoe UI)",
  system: "Systemschrift",
  humanist: "Freundlich (Calibri)",
  serif: "Mit Serifen (Georgia)",
  rounded: "Rund (wo verfügbar)",
};

function StyleForm({
  appearance,
  onSaved,
  onError,
}: {
  appearance: Appearance;
  onSaved: Saved;
  onError: Failed;
}) {
  const [draft, setDraft] = useState(appearance);
  const [saving, setSaving] = useState(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(appearance);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      onSaved(await saveBranding({ appearance: draft }), "Schrift und Form gespeichert.");
    } catch (err) {
      onError(err, "Speichern fehlgeschlagen");
      setSaving(false);
    }
  }

  function set<K extends keyof Appearance>(key: K, value: Appearance[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="card">
      <div className="card-title">
        <h2>Schrift und Form</h2>
      </div>
      <form className="form-stack" onSubmit={(event) => void onSubmit(event)}>
        <Field label="Schriftart" htmlFor="style-font">
          <select
            id="style-font"
            value={draft.font}
            onChange={(event) => set("font", event.target.value as Appearance["font"])}
          >
            {Object.entries(fontLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <p
          className="font-sample"
          style={draft.font === "standard" ? undefined : { fontFamily: fontStacks[draft.font] }}
        >
          Ausleihe bestätigt: ThinkPad T14, 3 Stücke frei.
        </p>
        <Field label="Schriftgröße" htmlFor="style-size" hint="Vergrößert Text und Bedienelemente.">
          <select
            id="style-size"
            value={draft.fontSize}
            onChange={(event) => set("fontSize", event.target.value as Appearance["fontSize"])}
          >
            <option value="small">Kompakt</option>
            <option value="normal">Normal</option>
            <option value="large">Groß</option>
          </select>
        </Field>
        <Field label="Ecken" htmlFor="style-radius">
          <select
            id="style-radius"
            value={draft.radius}
            onChange={(event) => set("radius", event.target.value as Appearance["radius"])}
          >
            <option value="square">Eckig</option>
            <option value="standard">Leicht abgerundet</option>
            <option value="round">Rund</option>
          </select>
        </Field>
        <Field label="Seitenleiste" htmlFor="style-sidebar">
          <select
            id="style-sidebar"
            value={draft.sidebar}
            onChange={(event) => set("sidebar", event.target.value as Appearance["sidebar"])}
          >
            <option value="standard">Neutral</option>
            <option value="tinted">Leicht in der Akzentfarbe getönt</option>
            <option value="accent">In der Akzentfarbe</option>
          </select>
        </Field>
        <div className="form-actions">
          <button type="submit" disabled={saving || !changed}>
            Speichern
          </button>
        </div>
      </form>
    </section>
  );
}

const termFields: { key: keyof Terms; label: string; hint?: string }[] = [
  {
    key: "subtitle",
    label: "Untertitel unter „LendLine“",
    hint: "Leer lassen für keinen Untertitel.",
  },
  { key: "catalog", label: "Katalog" },
  { key: "device", label: "Gerät (Einzahl)" },
  { key: "devices", label: "Geräte (Mehrzahl)" },
  { key: "unit", label: "Stück (Einzahl)" },
  { key: "units", label: "Stücke (Mehrzahl)" },
  { key: "room", label: "Raum (Einzahl)" },
  { key: "rooms", label: "Räume (Mehrzahl)" },
];

function TermsForm({ terms, onSaved, onError }: { terms: Terms; onSaved: Saved; onError: Failed }) {
  const [draft, setDraft] = useState(terms);
  const [saving, setSaving] = useState(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(terms);

  async function save(next: Terms, message: string) {
    setSaving(true);
    try {
      onSaved(await saveBranding({ terms: next }), message);
    } catch (err) {
      onError(err, "Speichern fehlgeschlagen");
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <div className="card-title">
        <h2>Texte und Begriffe</h2>
      </div>
      <p className="muted small">
        Eigene Wörter für Navigation, Seitentitel, Anfrageformular und E-Mails, z. B. „Ausrüstung“
        statt „Gerät“ oder „Standort“ statt „Raum“.
      </p>
      <form
        className="form-grid cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save(draft, "Begriffe gespeichert.");
        }}
      >
        {termFields.map((field) => (
          <Field
            key={field.key}
            label={field.label}
            htmlFor={`term-${field.key}`}
            hint={field.hint}
            className={field.key === "subtitle" ? "span-full" : undefined}
          >
            <input
              id={`term-${field.key}`}
              value={draft[field.key]}
              maxLength={field.key === "subtitle" ? 60 : 40}
              required={field.key !== "subtitle"}
              placeholder={DEFAULT_TERMS[field.key]}
              onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
            />
          </Field>
        ))}
        <div className="form-actions span-full">
          <button type="submit" disabled={saving || !changed}>
            Speichern
          </button>
          <button
            type="button"
            className="ghost"
            disabled={saving || JSON.stringify(terms) === JSON.stringify(DEFAULT_TERMS)}
            onClick={() => void save(DEFAULT_TERMS, "Standardbegriffe wiederhergestellt.")}
          >
            Standard wiederherstellen
          </button>
        </div>
      </form>
    </section>
  );
}

function LoginForm({
  login,
  imageUrl,
  onSaved,
  onError,
}: {
  login: Branding["login"];
  imageUrl: string | null;
  onSaved: Saved;
  onError: Failed;
}) {
  const [title, setTitle] = useState(login.title);
  const [text, setText] = useState(login.text);
  const [saving, setSaving] = useState(false);
  const changed = title !== login.title || text !== login.text;

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      onSaved(await saveBranding({ login: { title, text } }), "Anmeldeseite gespeichert.");
    } catch (err) {
      onError(err, "Speichern fehlgeschlagen");
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <div className="card-title">
        <h2>Anmeldeseite</h2>
      </div>
      <form className="form-stack" onSubmit={(event) => void onSubmit(event)}>
        <Field label="Überschrift" htmlFor="login-title">
          <input
            id="login-title"
            value={title}
            maxLength={80}
            required
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field
          label="Begrüßungstext"
          htmlFor="login-text"
          optional
          hint="Z. B. wofür die Ausleihe da ist oder wen man bei Problemen anspricht."
        >
          <textarea
            id="login-text"
            value={text}
            maxLength={400}
            onChange={(event) => setText(event.target.value)}
          />
        </Field>
        <div className="form-actions">
          <button type="submit" disabled={saving || !changed}>
            Speichern
          </button>
        </div>
      </form>
      <div className="logo-slots">
        <ImageSlot
          slot="login"
          label="Bild"
          hint="erscheint links neben der Anmeldung (nicht auf dem Handy), bis 3 MB"
          url={imageUrl}
          onSaved={onSaved}
          onError={onError}
        />
      </div>
    </section>
  );
}

type AccentProps = {
  accent: string | null;
  onSaved: Saved;
  onError: Failed;
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
      const saved = await saveBranding({ accent: next });
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
