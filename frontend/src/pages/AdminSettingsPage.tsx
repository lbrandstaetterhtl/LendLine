import type { FormField, FormFieldMode } from "../types";

import type { SubmitEvent } from "react";
import { useState } from "react";

import { api } from "../api/client";
import { errorMessage, useApi } from "../api/useApi";
import { useTerms } from "../branding/BrandingContext";
import { Icon } from "../components/icons";
import { SettingsTabs } from "../components/SettingsTabs";
import { Alert, Field, PageHeader } from "../components/ui";
import { useFeature } from "../ui/UiContext";

type Policy = {
  registration: { enabled: boolean; domains: string[] };
  rules: { maxDays: number; maxOpenPerUser: number; autoApprove: boolean };
  form: {
    room: FormFieldMode;
    comment: FormFieldMode;
    commentLabel: string;
    commentHint: string;
    fields: FormField[];
  };
};

const modeLabels: Record<FormFieldMode, string> = {
  required: "Pflichtfeld",
  optional: "Optional",
  hidden: "Ausgeblendet",
};

const typeLabels: Record<FormField["type"], string> = {
  text: "Textzeile",
  textarea: "Mehrzeiliger Text",
  select: "Auswahlliste",
  checkbox: "Häkchen (Bestätigung)",
};

/**
 * Field ids stay stable when a label changes, so they are derived once from the first label.
 */
function slug(label: string, taken: string[]): string {
  const base =
    label
      .toLowerCase()
      .replaceAll("ä", "ae")
      .replaceAll("ö", "oe")
      .replaceAll("ü", "ue")
      .replaceAll("ß", "ss")
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "")
      .slice(0, 30) || "feld";
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}

export function AdminSettingsPage() {
  const { data: policy, error, reload } = useApi<Policy>("/api/admin/settings/policy");
  const showRules = useFeature("rules.loan");
  const showForm = useFeature("form.custom");
  const [info, setInfo] = useState("");
  const [saveError, setSaveError] = useState("");

  async function save(next: Policy, message: string): Promise<boolean> {
    setSaveError("");
    setInfo("");
    try {
      await api("/api/admin/settings/policy", { method: "PUT", body: JSON.stringify(next) });
      setInfo(message);
      reload();
      return true;
    } catch (err) {
      setSaveError(errorMessage(err, "Speichern fehlgeschlagen"));
      return false;
    }
  }

  return (
    <>
      <SettingsTabs />
      <PageHeader
        title="Einstellungen"
        description="Wer sich registrieren darf, welche Regeln für Ausleihen gelten und was im Anfrageformular abgefragt wird."
      />
      <Alert>{error || saveError}</Alert>
      <Alert tone="ok">{info}</Alert>
      {policy && (
        <div className="dash-grid branding-grid" key={JSON.stringify(policy)}>
          <RegistrationCard policy={policy} save={save} />
          {showRules && <RulesCard policy={policy} save={save} />}
          {showForm && <FormCard policy={policy} save={save} />}
        </div>
      )}
    </>
  );
}

type CardProps = { policy: Policy; save: (next: Policy, message: string) => Promise<boolean> };

function RegistrationCard({ policy, save }: CardProps) {
  const [enabled, setEnabled] = useState(policy.registration.enabled);
  const [domains, setDomains] = useState(policy.registration.domains.join(", "));
  const list = domains
    .split(/[\s,;]+/)
    .map((item) => item.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(
      { ...policy, registration: { enabled, domains: list } },
      enabled ? "Registrierung eingeschaltet." : "Registrierung ausgeschaltet."
    );
  }

  return (
    <section className="card">
      <div className="card-title">
        <h2>Registrierung</h2>
        {policy.registration.enabled ? (
          <span className="badge st-open">Offen</span>
        ) : (
          <span className="badge st-returned">Aus</span>
        )}
      </div>
      <p className="muted small">
        Aus: Konten legt nur die Verwaltung an (empfohlen, wenn LendLine aus dem Internet erreichbar
        ist). An: Jede Person kann sich selbst ein Nutzerkonto anlegen.
      </p>
      <form className="form-stack" onSubmit={onSubmit}>
        <label className="check" htmlFor="reg-enabled">
          <input
            id="reg-enabled"
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Selbstregistrierung erlauben
        </label>
        <Field
          label="Erlaubte E-Mail-Domains"
          htmlFor="reg-domains"
          optional
          hint="Z. B. firma.de, tochter-firma.de. Leer lassen für alle Adressen (nicht empfohlen)."
        >
          <input
            id="reg-domains"
            value={domains}
            disabled={!enabled}
            placeholder="firma.de"
            onChange={(event) => setDomains(event.target.value)}
          />
        </Field>
        {enabled && list.length === 0 && (
          <p className="small" style={{ color: "var(--warn)" }}>
            Ohne Domain-Liste kann sich jede Person mit einer beliebigen Adresse registrieren. Die
            Adresse wird nicht bestätigt.
          </p>
        )}
        <div className="form-actions">
          <button type="submit">Speichern</button>
        </div>
      </form>
    </section>
  );
}

function RulesCard({ policy, save }: CardProps) {
  const [rules, setRules] = useState(policy.rules);
  const terms = useTerms();

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void save({ ...policy, rules }, "Ausleihregeln gespeichert.");
  }

  return (
    <section className="card">
      <div className="card-title">
        <h2>Ausleihregeln</h2>
      </div>
      <form className="form-stack" onSubmit={onSubmit}>
        <Field
          label="Höchstdauer einer Ausleihe (Tage)"
          htmlFor="rule-days"
          hint="Längere Zeiträume lehnt das Formular ab."
        >
          <input
            id="rule-days"
            type="number"
            min={1}
            max={365}
            required
            value={rules.maxDays}
            onChange={(event) => setRules({ ...rules, maxDays: Number(event.target.value) })}
          />
        </Field>
        <Field
          label="Offene Anfragen pro Person"
          htmlFor="rule-open"
          hint={`Wie viele unentschiedene Anfragen eine Person gleichzeitig haben darf. Schützt davor, dass jemand alle ${terms.units} blockiert.`}
        >
          <input
            id="rule-open"
            type="number"
            min={1}
            max={100}
            required
            value={rules.maxOpenPerUser}
            onChange={(event) => setRules({ ...rules, maxOpenPerUser: Number(event.target.value) })}
          />
        </Field>
        <label className="check" htmlFor="rule-auto">
          <input
            id="rule-auto"
            type="checkbox"
            checked={rules.autoApprove}
            onChange={(event) => setRules({ ...rules, autoApprove: event.target.checked })}
          />
          Anfragen automatisch bestätigen
        </label>
        <p className="muted small" style={{ marginTop: -6 }}>
          Ist das {terms.unit} frei, gilt die Anfrage sofort als bestätigt und die Person erhält die
          Bestätigungs-E-Mail. Die Verwaltung erfasst nur noch die Rückgabe.
        </p>
        <div className="form-actions">
          <button type="submit">Speichern</button>
        </div>
      </form>
    </section>
  );
}

function FormCard({ policy, save }: CardProps) {
  const [form, setForm] = useState(policy.form);
  const terms = useTerms();

  function updateField(index: number, patch: Partial<FormField>) {
    setForm({
      ...form,
      fields: form.fields.map((field, position) =>
        position === index ? { ...field, ...patch } : field
      ),
    });
  }

  function addField() {
    const label = "Neues Feld";
    const id = slug(
      label,
      form.fields.map((field) => field.id)
    );
    setForm({
      ...form,
      fields: [...form.fields, { id, label, type: "text", required: false, options: [], hint: "" }],
    });
  }

  function move(index: number, by: number) {
    const fields = [...form.fields];
    const [field] = fields.splice(index, 1);
    if (!field) return;
    fields.splice(index + by, 0, field);
    setForm({ ...form, fields });
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    // A field keeps its id; a new one gets its id from the final label.
    const known = new Set(policy.form.fields.map((field) => field.id));
    const taken: string[] = [];
    const fields = form.fields.map((field) => {
      const id = known.has(field.id) ? field.id : slug(field.label, [...known, ...taken]);
      taken.push(id);
      return { ...field, id };
    });
    await save({ ...policy, form: { ...form, fields } }, "Anfrageformular gespeichert.");
  }

  return (
    <section className="card span-2">
      <div className="card-title">
        <h2>Anfrageformular</h2>
      </div>
      <p className="muted small">
        Was Nutzer beim Anfragen angeben. Eigene Felder erscheinen im Formular, bei der Verwaltung,
        im Protokoll und in der Bestätigungs-E-Mail.
      </p>
      <form className="form-stack" onSubmit={(event) => void onSubmit(event)}>
        <div className="form-grid cols-2">
          <Field label={terms.room} htmlFor="form-room">
            <select
              id="form-room"
              value={form.room}
              onChange={(event) => setForm({ ...form, room: event.target.value as FormFieldMode })}
            >
              {Object.entries(modeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Kommentarfeld" htmlFor="form-comment">
            <select
              id="form-comment"
              value={form.comment}
              onChange={(event) =>
                setForm({ ...form, comment: event.target.value as FormFieldMode })
              }
            >
              {Object.entries(modeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {form.comment !== "hidden" && (
            <>
              <Field label="Name des Kommentarfelds" htmlFor="form-comment-label">
                <input
                  id="form-comment-label"
                  value={form.commentLabel}
                  maxLength={40}
                  required
                  onChange={(event) => setForm({ ...form, commentLabel: event.target.value })}
                />
              </Field>
              <Field label="Beispieltext im Feld" htmlFor="form-comment-hint" optional>
                <input
                  id="form-comment-hint"
                  value={form.commentHint}
                  maxLength={120}
                  onChange={(event) => setForm({ ...form, commentHint: event.target.value })}
                />
              </Field>
            </>
          )}
        </div>

        <div className="section-title">
          <h3>Eigene Felder</h3>
          <span className="muted small">{form.fields.length} von 10</span>
        </div>
        <div className="settings-fields">
          {form.fields.map((field, index) => (
            <div className="settings-field" key={field.id}>
              <div className="settings-field-head">
                <strong>{field.label || "Ohne Namen"}</strong>
                <button
                  type="button"
                  className="ghost icon sm"
                  aria-label="Nach oben"
                  title="Nach oben"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="ghost icon sm"
                  aria-label="Nach unten"
                  title="Nach unten"
                  disabled={index === form.fields.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="ghost sm"
                  onClick={() =>
                    setForm({ ...form, fields: form.fields.filter((_, pos) => pos !== index) })
                  }
                >
                  Entfernen
                </button>
              </div>
              <div className="form-grid cols-2">
                <Field label="Name" htmlFor={`field-label-${index}`}>
                  <input
                    id={`field-label-${index}`}
                    value={field.label}
                    maxLength={60}
                    required
                    onChange={(event) => updateField(index, { label: event.target.value })}
                  />
                </Field>
                <Field label="Art" htmlFor={`field-type-${index}`}>
                  <select
                    id={`field-type-${index}`}
                    value={field.type}
                    onChange={(event) =>
                      updateField(index, { type: event.target.value as FormField["type"] })
                    }
                  >
                    {Object.entries(typeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                {field.type === "select" && (
                  <Field
                    label="Auswahlmöglichkeiten"
                    htmlFor={`field-options-${index}`}
                    hint="Eine pro Zeile."
                    className="span-full"
                  >
                    <textarea
                      id={`field-options-${index}`}
                      value={field.options.join("\n")}
                      required
                      onChange={(event) =>
                        updateField(index, {
                          options: event.target.value
                            .split("\n")
                            .map((option) => option.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </Field>
                )}
                <Field
                  label="Hinweis unter dem Feld"
                  htmlFor={`field-hint-${index}`}
                  optional
                  className="span-full"
                >
                  <input
                    id={`field-hint-${index}`}
                    value={field.hint}
                    maxLength={160}
                    onChange={(event) => updateField(index, { hint: event.target.value })}
                  />
                </Field>
                <label className="check span-full" htmlFor={`field-required-${index}`}>
                  <input
                    id={`field-required-${index}`}
                    type="checkbox"
                    checked={field.required}
                    onChange={(event) => updateField(index, { required: event.target.checked })}
                  />
                  {field.type === "checkbox" ? "Muss angehakt werden" : "Pflichtfeld"}
                </label>
              </div>
            </div>
          ))}
          {form.fields.length === 0 && (
            <p className="muted small">
              Noch keine eigenen Felder. Beispiele: Kostenstelle, Projekt, Zweck der Ausleihe,
              „Nutzungsbedingungen gelesen“.
            </p>
          )}
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="secondary"
            disabled={form.fields.length >= 10}
            onClick={addField}
          >
            <Icon name="plus" /> Feld hinzufügen
          </button>
          <button type="submit">Formular speichern</button>
        </div>
      </form>
    </section>
  );
}
