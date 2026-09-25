import type { Appearance } from "../branding/appearance";
import type { AccentTokens } from "../branding/palette";

import type { CSSProperties, SubmitEvent } from "react";
import { useRef, useState } from "react";

import { api } from "../api/client";
import { errorMessage } from "../api/useApi";
import { fontStacks } from "../branding/appearance";
import {
  type Branding,
  DEFAULT_TERMS,
  localizeTerms,
  type Terms,
  useBranding,
  useTerms,
} from "../branding/BrandingContext";
import { accentPalette } from "../branding/palette";
import { Icon } from "../components/icons";
import { LogoMark } from "../components/Logo";
import { SettingsTabs } from "../components/SettingsTabs";
import { Alert, Field, PageHeader } from "../components/ui";
import { format, localizedDefault, useI18n } from "../i18n";
import { de } from "../i18n/de";
import { useFeature } from "../ui/UiContext";

type Slot = "light" | "dark" | "favicon" | "login";

const DEFAULT_ACCENT = "#18181b";
const HEX = /^#[0-9a-f]{6}$/i;

const presets = [
  { hex: "#18181b", name: "black" },
  { hex: "#2563eb", name: "blue" },
  { hex: "#0f766e", name: "petrol" },
  { hex: "#16a34a", name: "green" },
  { hex: "#ea580c", name: "orange" },
  { hex: "#dc2626", name: "red" },
  { hex: "#9333ea", name: "violet" },
  { hex: "#db2777", name: "pink" },
] as const;

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
  const { m } = useI18n();
  const t = m.branding;

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
      <PageHeader title={t.title} description={t.description} />
      <Alert>{error}</Alert>
      <Alert tone="ok">{info}</Alert>

      <div className="dash-grid branding-grid">
        <section className="card">
          <div className="card-title">
            <h2>{t.logo}</h2>
          </div>
          <p className="muted small">{t.logoHint}</p>
          <div className="logo-slots">
            <ImageSlot
              slot="light"
              label={t.light}
              hint={t.lightHint}
              url={branding.logoUrl}
              onSaved={saved}
              onError={failed}
            />
            <ImageSlot
              slot="dark"
              label={t.darkMode}
              hint={branding.logoDarkUrl ? t.darkHint : t.darkFallback}
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
                <h2>{t.favicon}</h2>
              </div>
              <p className="muted small">{t.faviconHint}</p>
              <div className="logo-slots">
                <ImageSlot
                  slot="favicon"
                  label={t.icon}
                  hint={t.square}
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

function ImageSlot({ slot, label, hint, url, fallbackUrl, onSaved, onError }: SlotProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { m } = useI18n();
  const t = m.branding;
  const slotName = t.slots[slot];

  async function upload(file: File) {
    setBusy(true);
    try {
      const body = new FormData();
      body.append("image", file);
      const next = await api<Branding>(`/api/admin/branding/image/${slot}`, {
        method: "POST",
        body,
      });
      onSaved(next, format(t.slotSaved, { slot: slotName }));
    } catch (err) {
      onError(err, t.uploadFailed);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    if (!window.confirm(format(t.confirmRemove, { slot: slotName }))) return;
    setBusy(true);
    try {
      const next = await api<Branding>(`/api/admin/branding/image/${slot}`, { method: "DELETE" });
      onSaved(next, format(t.slotRemoved, { slot: slotName }));
    } catch (err) {
      onError(err, t.removeFailed);
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
            alt={slotName}
            className={`${url ? "" : "is-fallback"}${slot === "favicon" ? " icon-preview" : ""}`}
          />
        ) : (
          <span className="logo-preview-empty">
            {slot === "login" ? <Icon name="image" /> : <LogoMark size={28} />}
            <span>{slot === "login" ? t.noImage : t.standard}</span>
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
          <Icon name="upload" /> {busy ? t.uploading : url ? t.replace : t.upload}
        </button>
        {url && (
          <button type="button" className="ghost sm" disabled={busy} onClick={() => void remove()}>
            {t.remove}
          </button>
        )}
      </div>
    </div>
  );
}

const fonts: Appearance["font"][] = ["standard", "system", "humanist", "serif", "rounded"];

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
  const { m } = useI18n();
  const t = m.branding;
  const terms = useTerms();

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      onSaved(await saveBranding({ appearance: draft }), t.styleSaved);
    } catch (err) {
      onError(err, t.saveFailed);
      setSaving(false);
    }
  }

  function set<K extends keyof Appearance>(key: K, value: Appearance[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="card">
      <div className="card-title">
        <h2>{t.style}</h2>
      </div>
      <form className="form-stack" onSubmit={(event) => void onSubmit(event)}>
        <Field label={t.font} htmlFor="style-font">
          <select
            id="style-font"
            value={draft.font}
            onChange={(event) => set("font", event.target.value as Appearance["font"])}
          >
            {fonts.map((value) => (
              <option key={value} value={value}>
                {t.fonts[value]}
              </option>
            ))}
          </select>
        </Field>
        <p
          className="font-sample"
          style={draft.font === "standard" ? undefined : { fontFamily: fontStacks[draft.font] }}
        >
          {format(t.fontSample, { units: terms.units })}
        </p>
        <Field label={t.fontSize} htmlFor="style-size" hint={t.fontSizeHint}>
          <select
            id="style-size"
            value={draft.fontSize}
            onChange={(event) => set("fontSize", event.target.value as Appearance["fontSize"])}
          >
            <option value="small">{t.sizes.small}</option>
            <option value="normal">{t.sizes.normal}</option>
            <option value="large">{t.sizes.large}</option>
          </select>
        </Field>
        <Field label={t.corners} htmlFor="style-radius">
          <select
            id="style-radius"
            value={draft.radius}
            onChange={(event) => set("radius", event.target.value as Appearance["radius"])}
          >
            <option value="square">{t.radii.square}</option>
            <option value="standard">{t.radii.standard}</option>
            <option value="round">{t.radii.round}</option>
          </select>
        </Field>
        <Field label={t.sidebar} htmlFor="style-sidebar">
          <select
            id="style-sidebar"
            value={draft.sidebar}
            onChange={(event) => set("sidebar", event.target.value as Appearance["sidebar"])}
          >
            <option value="standard">{t.sidebars.standard}</option>
            <option value="tinted">{t.sidebars.tinted}</option>
            <option value="accent">{t.sidebars.accent}</option>
          </select>
        </Field>
        <div className="form-actions">
          <button type="submit" disabled={saving || !changed}>
            {m.common.save}
          </button>
        </div>
      </form>
    </section>
  );
}

const termKeys: (keyof Terms)[] = [
  "subtitle",
  "catalog",
  "device",
  "devices",
  "unit",
  "units",
  "room",
  "rooms",
];

function TermsForm({ terms, onSaved, onError }: { terms: Terms; onSaved: Saved; onError: Failed }) {
  const { m } = useI18n();
  const t = m.branding;
  // Built-in words appear in the reader's language and are stored as the built-in (German) ones,
  // so they stay translated for everyone.
  const shown = localizeTerms(terms, m);
  const [draft, setDraft] = useState(shown);
  const [saving, setSaving] = useState(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(shown);

  async function save(next: Terms, message: string) {
    setSaving(true);
    const stored = Object.fromEntries(
      termKeys.map((key) => [key, next[key] === m.terms[key] ? DEFAULT_TERMS[key] : next[key]])
    );
    try {
      onSaved(await saveBranding({ terms: stored }), message);
    } catch (err) {
      onError(err, t.saveFailed);
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <div className="card-title">
        <h2>{t.terms}</h2>
      </div>
      <p className="muted small">{t.termsHint}</p>
      <p className="muted small">{t.termsLanguageHint}</p>
      <form
        className="form-grid cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save(draft, t.termsSaved);
        }}
      >
        {termKeys.map((key) => (
          <Field
            key={key}
            label={t.termLabels[key]}
            htmlFor={`term-${key}`}
            hint={key === "subtitle" ? t.subtitleHint : undefined}
            className={key === "subtitle" ? "span-full" : undefined}
          >
            <input
              id={`term-${key}`}
              value={draft[key]}
              maxLength={key === "subtitle" ? 60 : 40}
              required={key !== "subtitle"}
              placeholder={m.terms[key]}
              onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
            />
          </Field>
        ))}
        <div className="form-actions span-full">
          <button type="submit" disabled={saving || !changed}>
            {m.common.save}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={saving || JSON.stringify(terms) === JSON.stringify(DEFAULT_TERMS)}
            onClick={() => void save(DEFAULT_TERMS, t.termsRestored)}
          >
            {t.restore}
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
  const { m } = useI18n();
  const t = m.branding;
  const shownTitle = localizedDefault(login.title, (d) => d.terms.loginTitle);
  const [title, setTitle] = useState(shownTitle);
  const [text, setText] = useState(login.text);
  const [saving, setSaving] = useState(false);
  const changed = title !== shownTitle || text !== login.text;

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const storedTitle = title === m.terms.loginTitle ? de.terms.loginTitle : title;
      onSaved(await saveBranding({ login: { title: storedTitle, text } }), t.loginSaved);
    } catch (err) {
      onError(err, t.saveFailed);
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <div className="card-title">
        <h2>{t.loginPage}</h2>
      </div>
      <form className="form-stack" onSubmit={(event) => void onSubmit(event)}>
        <Field label={t.heading} htmlFor="login-title">
          <input
            id="login-title"
            value={title}
            maxLength={80}
            required
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field label={t.welcome} htmlFor="login-text" optional hint={t.welcomeHint}>
          <textarea
            id="login-text"
            value={text}
            maxLength={400}
            onChange={(event) => setText(event.target.value)}
          />
        </Field>
        <div className="form-actions">
          <button type="submit" disabled={saving || !changed}>
            {m.common.save}
          </button>
        </div>
      </form>
      <div className="logo-slots">
        <ImageSlot
          slot="login"
          label={t.image}
          hint={t.imageHint}
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
  const { m } = useI18n();
  const t = m.branding;

  async function save(next: string | null) {
    setSaving(true);
    try {
      const saved = await saveBranding({ accent: next });
      onSaved(saved, next ? format(t.accentSaved, { color: next }) : t.accentRestored);
    } catch (err) {
      onError(err, t.saveFailed);
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <div className="card-title">
        <h2>{t.accent}</h2>
        {!accent && <span className="badge st-returned">{t.standard}</span>}
      </div>
      <p className="muted small">{t.accentHint}</p>
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
              aria-label={t.colors[preset.name]}
              title={t.colors[preset.name]}
              aria-pressed={color === preset.hex}
              onClick={() => setValue(preset.hex)}
            />
          ))}
        </div>
        <Field
          label={t.ownColor}
          htmlFor="accent-hex"
          hint={valid ? undefined : <span style={{ color: "var(--bad)" }}>{t.hexHint}</span>}
        >
          <div className="color-field">
            <input
              type="color"
              aria-label={t.pickColor}
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
              <span className="small">{mode === "light" ? t.light : t.dark}</span>
              <div className="accent-preview-row">
                <span className="btn">{t.sampleButton}</span>
                <span className="nav-count">3</span>
                <span className="preview-chip">{t.sampleChip}</span>
              </div>
            </div>
          ))}
        </div>
        {adjusted && valid && (
          <p className="muted small">
            {format(t.adjusted, { light: palette.light.accent, dark: palette.dark.accent })}
          </p>
        )}

        <div className="form-actions">
          <button type="submit" disabled={saving || !valid || unchanged}>
            {t.saveColor}
          </button>
          {accent && (
            <button
              type="button"
              className="ghost"
              disabled={saving}
              onClick={() => void save(null)}
            >
              {t.restore}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
