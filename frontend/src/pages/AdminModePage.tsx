import type { UiFeature, UiMode } from "../ui/UiContext";

import { useState } from "react";

import { api } from "../api/client";
import { errorMessage, useApi } from "../api/useApi";
import { SettingsTabs } from "../components/SettingsTabs";
import { Alert, PageHeader } from "../components/ui";
import { format, useI18n } from "../i18n";
import { useUi } from "../ui/UiContext";

const modes: UiMode[] = ["simple", "medium", "full", "custom"];

export function AdminModePage() {
  const { ui, reload } = useUi();
  const { data: usage } = useApi<Partial<Record<UiFeature, string>>>("/api/admin/ui/usage");
  const { m } = useI18n();
  if (!ui) return null;
  return (
    <>
      <SettingsTabs />
      <PageHeader title={m.mode.title} description={m.mode.description} />
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
  const { m } = useI18n();
  const t = m.mode;

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
      setInfo(format(t.saved, { mode: t.modes[mode].label }));
      onSaved();
    } catch (err) {
      setError(errorMessage(err, t.saveFailed));
      setSaving(false);
    }
  }

  return (
    <>
      <Alert>{error}</Alert>
      <Alert tone="ok">{info}</Alert>
      <fieldset className="mode-choice">
        <legend className="sr-only">{t.legend}</legend>
        {modes.map((value) => {
          const count =
            value === "custom"
              ? catalogue.filter((feature) => custom[feature.key]).length
              : catalogue.filter((feature) => feature.modes.includes(value)).length;
          return (
            <label
              key={value}
              className={`mode-card${mode === value ? " is-chosen" : ""}`}
              htmlFor={`mode-${value}`}
            >
              <input
                id={`mode-${value}`}
                type="radio"
                name="mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              <strong>
                {t.modes[value].label}
                {ui!.mode === value && <span className="badge st-returned">{t.current}</span>}
              </strong>
              <span className="muted small">{t.modes[value].text}</span>
              <span className="small">{format(t.areasOf, { count, total: catalogue.length })}</span>
            </label>
          );
        })}
      </fieldset>

      <section className="card">
        <div className="card-title">
          <h2>{t.areas}</h2>
          {mode !== "custom" && <span className="muted small">{t.customHint}</span>}
        </div>
        <p className="muted small">{t.always}</p>
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
                  <span className="hint">
                    {format(t.inUse, { usage: usage[feature.key] ?? "" })}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </section>

      <Alert tone="note">
        {hiddenButUsed.length > 0 && (
          <div>
            <strong>{t.hiddenTitle}</strong>
            <ul className="plain-list">
              {hiddenButUsed.map((item) => (
                <li key={item.key}>
                  {item.label}: {usage[item.key]}
                </li>
              ))}
            </ul>
            {t.hiddenText}
          </div>
        )}
      </Alert>

      <div className="form-actions">
        <button type="button" disabled={saving || !changed} onClick={() => void save()}>
          {t.save}
        </button>
      </div>
    </>
  );
}
