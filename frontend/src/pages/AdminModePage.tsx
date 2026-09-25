import type { UiFeature, UiMode } from "../ui/UiContext";

import { useState } from "react";

import { api } from "../api/client";
import { errorMessage, useApi } from "../api/useApi";
import { SettingsTabs } from "../components/SettingsTabs";
import { Alert, PageHeader } from "../components/ui";
import { useUi } from "../ui/UiContext";

const modes: { value: UiMode; label: string; text: string }[] = [
  {
    value: "simple",
    label: "Einfach",
    text: "Nur das Nötigste: Logo und Farbe, Registrierung, Benutzer, Geräte und Anfragen.",
  },
  {
    value: "medium",
    label: "Mittel",
    text: "Dazu Regeln, Anfrageformular, E-Mail-Texte, Gruppen mit Rechten, Eigenschaften und Protokoll.",
  },
  {
    value: "full",
    label: "Voll",
    text: "Alles, auch Kategorien und Regeln pro Gruppe, Verzeichnisgruppen und Wartung.",
  },
  {
    value: "custom",
    label: "Eigene Auswahl",
    text: "Sie legen für jeden Bereich selbst fest, ob er erscheint.",
  },
];

export function AdminModePage() {
  const { ui, reload } = useUi();
  const { data: usage } = useApi<Partial<Record<UiFeature, string>>>("/api/admin/ui/usage");
  if (!ui) return null;
  return (
    <>
      <SettingsTabs />
      <PageHeader
        title="Einstellungsmodus"
        description="Wie viel die Verwaltung sieht. Ausgeblendete Bereiche verschwinden aus Menü und Seiten; was dort eingestellt ist, gilt weiter."
      />
      <ModeForm
        key={`${ui.mode}-${JSON.stringify(ui.custom)}`}
        usage={usage ?? {}}
        onSaved={reload}
      />
    </>
  );
}

function ModeForm({
  usage,
  onSaved,
}: {
  usage: Partial<Record<UiFeature, string>>;
  onSaved: () => void;
}) {
  const { ui } = useUi();
  const [mode, setMode] = useState<UiMode>(ui!.mode);
  // The own selection starts from what is visible now, so "custom" never begins empty.
  const [custom, setCustom] = useState<Partial<Record<UiFeature, boolean>>>(
    ui!.mode === "custom" ? ui!.custom : ui!.features
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const catalogue = ui!.catalogue;

  const shown = (feature: UiFeature) =>
    mode === "custom"
      ? Boolean(custom[feature])
      : (catalogue.find((item) => item.key === feature)?.modes ?? []).includes(mode);
  const hiddenButUsed = catalogue.filter((item) => !shown(item.key) && usage[item.key]);
  const changed =
    mode !== ui!.mode ||
    (mode === "custom" && JSON.stringify(custom) !== JSON.stringify(ui!.custom));

  async function save() {
    setSaving(true);
    setError("");
    setInfo("");
    try {
      await api("/api/admin/settings/ui", {
        method: "PUT",
        body: JSON.stringify({ mode, custom }),
      });
      setInfo(`Modus „${modes.find((item) => item.value === mode)?.label}“ gespeichert.`);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "Speichern fehlgeschlagen"));
      setSaving(false);
    }
  }

  return (
    <>
      <Alert>{error}</Alert>
      <Alert tone="ok">{info}</Alert>
      <fieldset className="mode-choice">
        <legend className="sr-only">Modus</legend>
        {modes.map((item) => {
          const count =
            item.value === "custom"
              ? catalogue.filter((feature) => custom[feature.key]).length
              : catalogue.filter((feature) => feature.modes.includes(item.value)).length;
          return (
            <label
              key={item.value}
              className={`mode-card${mode === item.value ? " is-chosen" : ""}`}
              htmlFor={`mode-${item.value}`}
            >
              <input
                id={`mode-${item.value}`}
                type="radio"
                name="mode"
                value={item.value}
                checked={mode === item.value}
                onChange={() => setMode(item.value)}
              />
              <strong>
                {item.label}
                {ui!.mode === item.value && <span className="badge st-returned">aktuell</span>}
              </strong>
              <span className="muted small">{item.text}</span>
              <span className="small">
                {count} von {catalogue.length} Zusatzbereichen
              </span>
            </label>
          );
        })}
      </fieldset>

      <section className="card">
        <div className="card-title">
          <h2>Bereiche</h2>
          {mode !== "custom" && (
            <span className="muted small">
              Zum Ändern einzelner Bereiche „Eigene Auswahl“ wählen.
            </span>
          )}
        </div>
        <p className="muted small">
          Immer sichtbar: Logo und Akzentfarbe, Selbstregistrierung, Benutzer, Geräte, Kategorien,
          Räume, Anfragen und Ausleihen.
        </p>
        <div className="mode-features">
          {catalogue.map((feature) => (
            <label className="permission" key={feature.key} htmlFor={`feature-${feature.key}`}>
              <input
                id={`feature-${feature.key}`}
                type="checkbox"
                checked={shown(feature.key)}
                disabled={mode !== "custom"}
                onChange={(event) => setCustom({ ...custom, [feature.key]: event.target.checked })}
              />
              <span>
                <strong>{feature.label}</strong>
                <span className="hint">{feature.description}</span>
                {usage[feature.key] && (
                  <span className="hint">In Gebrauch: {usage[feature.key]}.</span>
                )}
              </span>
            </label>
          ))}
        </div>
      </section>

      <Alert tone="note">
        {hiddenButUsed.length > 0 && (
          <div>
            <strong>Ausgeblendet, aber weiter wirksam:</strong>
            <ul className="plain-list">
              {hiddenButUsed.map((item) => (
                <li key={item.key}>
                  {item.label}: {usage[item.key]}
                </li>
              ))}
            </ul>
            Diese Einstellungen gelten weiter, lassen sich aber erst wieder ändern, wenn der Bereich
            sichtbar ist.
          </div>
        )}
      </Alert>

      <div className="form-actions">
        <button type="button" disabled={saving || !changed} onClick={() => void save()}>
          Modus speichern
        </button>
      </div>
    </>
  );
}
