import type { Messages } from "../i18n/de";
import type { FormField, FormFieldMode } from "../types";

import type { SubmitEvent } from "react";
import { useState } from "react";

import { api } from "../api/client";
import { errorMessage, useApi } from "../api/useApi";
import { useTerms } from "../branding/BrandingContext";
import { Icon } from "../components/icons";
import { SettingsTabs } from "../components/SettingsTabs";
import { Alert, Field, PageHeader } from "../components/ui";
import { format, localizedDefault, messages, useI18n } from "../i18n";
import { de } from "../i18n/de";
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

const fieldModes: FormFieldMode[] = ["required", "optional", "hidden"];
const fieldTypes: FormField["type"][] = ["text", "textarea", "select", "checkbox"];

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
      .slice(0, 30) || messages().settings.fallbackId;
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
  const { m } = useI18n();

  async function save(next: Policy, message: string): Promise<boolean> {
    setSaveError("");
    setInfo("");
    try {
      await api("/api/admin/settings/policy", { method: "PUT", body: JSON.stringify(next) });
      setInfo(message);
      reload();
      return true;
    } catch (err) {
      setSaveError(errorMessage(err, m.settings.saveFailed));
      return false;
    }
  }

  return (
    <>
      <SettingsTabs />
      <PageHeader title={m.settings.title} description={m.settings.description} />
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
  const { m } = useI18n();
  const t = m.settings;

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(
      { ...policy, registration: { enabled, domains: list } },
      enabled ? t.registrationOn : t.registrationOff
    );
  }

  return (
    <section className="card">
      <div className="card-title">
        <h2>{t.registration}</h2>
        {policy.registration.enabled ? (
          <span className="badge st-open">{t.open}</span>
        ) : (
          <span className="badge st-returned">{t.off}</span>
        )}
      </div>
      <p className="muted small">{t.registrationHint}</p>
      <form className="form-stack" onSubmit={onSubmit}>
        <label className="check" htmlFor="reg-enabled">
          <input
            id="reg-enabled"
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          {t.allowRegistration}
        </label>
        <Field label={t.domains} htmlFor="reg-domains" optional hint={t.domainsHint}>
          <input
            id="reg-domains"
            value={domains}
            disabled={!enabled}
            placeholder={t.domainsPlaceholder}
            onChange={(event) => setDomains(event.target.value)}
          />
        </Field>
        {enabled && list.length === 0 && (
          <p className="small" style={{ color: "var(--warn)" }}>
            {t.noDomains}
          </p>
        )}
        <div className="form-actions">
          <button type="submit">{m.common.save}</button>
        </div>
      </form>
    </section>
  );
}

function RulesCard({ policy, save }: CardProps) {
  const [rules, setRules] = useState(policy.rules);
  const terms = useTerms();
  const { m } = useI18n();
  const t = m.settings;

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void save({ ...policy, rules }, t.rulesSaved);
  }

  return (
    <section className="card">
      <div className="card-title">
        <h2>{t.rules}</h2>
      </div>
      <form className="form-stack" onSubmit={onSubmit}>
        <Field label={t.maxDays} htmlFor="rule-days" hint={t.maxDaysHint}>
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
          label={t.maxOpen}
          htmlFor="rule-open"
          hint={format(t.maxOpenHint, { units: terms.units })}
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
          {t.autoApprove}
        </label>
        <p className="muted small" style={{ marginTop: -6 }}>
          {format(t.autoApproveHint, { unit: terms.unit })}
        </p>
        <div className="form-actions">
          <button type="submit">{m.common.save}</button>
        </div>
      </form>
    </section>
  );
}

function FormCard({ policy, save }: CardProps) {
  const { m } = useI18n();
  const t = m.settings;
  // Built-in label and hint of the comment field appear translated and stay built-in when saved.
  const [form, setForm] = useState(() => ({
    ...policy.form,
    commentLabel: localizedDefault(policy.form.commentLabel, (d) => d.formDefaults.commentLabel),
    commentHint: localizedDefault(policy.form.commentHint, (d) => d.formDefaults.commentHint),
  }));
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
    const label = t.newField;
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
    const builtIn = (value: string, pick: (d: Messages) => string) =>
      value === pick(m) ? pick(de) : value;
    await save(
      {
        ...policy,
        form: {
          ...form,
          commentLabel: builtIn(form.commentLabel, (d) => d.formDefaults.commentLabel),
          commentHint: builtIn(form.commentHint, (d) => d.formDefaults.commentHint),
          fields,
        },
      },
      t.formSaved
    );
  }

  return (
    <section className="card span-2">
      <div className="card-title">
        <h2>{t.form}</h2>
      </div>
      <p className="muted small">{t.formHint}</p>
      <p className="muted small">{t.ownTextsNote}</p>
      <form className="form-stack" onSubmit={(event) => void onSubmit(event)}>
        <div className="form-grid cols-2">
          <Field label={terms.room} htmlFor="form-room">
            <select
              id="form-room"
              value={form.room}
              onChange={(event) => setForm({ ...form, room: event.target.value as FormFieldMode })}
            >
              {fieldModes.map((value) => (
                <option key={value} value={value}>
                  {t.fieldModes[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.commentField} htmlFor="form-comment">
            <select
              id="form-comment"
              value={form.comment}
              onChange={(event) =>
                setForm({ ...form, comment: event.target.value as FormFieldMode })
              }
            >
              {fieldModes.map((value) => (
                <option key={value} value={value}>
                  {t.fieldModes[value]}
                </option>
              ))}
            </select>
          </Field>
          {form.comment !== "hidden" && (
            <>
              <Field label={t.commentLabel} htmlFor="form-comment-label">
                <input
                  id="form-comment-label"
                  value={form.commentLabel}
                  maxLength={40}
                  required
                  onChange={(event) => setForm({ ...form, commentLabel: event.target.value })}
                />
              </Field>
              <Field label={t.commentHint} htmlFor="form-comment-hint" optional>
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
          <h3>{t.ownFields}</h3>
          <span className="muted small">
            {format(t.fieldsOf, { count: form.fields.length, max: 10 })}
          </span>
        </div>
        <div className="settings-fields">
          {form.fields.map((field, index) => (
            <div className="settings-field" key={field.id}>
              <div className="settings-field-head">
                <strong>{field.label || t.unnamed}</strong>
                <button
                  type="button"
                  className="ghost icon sm"
                  aria-label={t.up}
                  title={t.up}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="ghost icon sm"
                  aria-label={t.down}
                  title={t.down}
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
                  {t.remove}
                </button>
              </div>
              <div className="form-grid cols-2">
                <Field label={t.name} htmlFor={`field-label-${index}`}>
                  <input
                    id={`field-label-${index}`}
                    value={field.label}
                    maxLength={60}
                    required
                    onChange={(event) => updateField(index, { label: event.target.value })}
                  />
                </Field>
                <Field label={t.type} htmlFor={`field-type-${index}`}>
                  <select
                    id={`field-type-${index}`}
                    value={field.type}
                    onChange={(event) =>
                      updateField(index, { type: event.target.value as FormField["type"] })
                    }
                  >
                    {fieldTypes.map((value) => (
                      <option key={value} value={value}>
                        {t.fieldTypes[value]}
                      </option>
                    ))}
                  </select>
                </Field>
                {field.type === "select" && (
                  <Field
                    label={t.options}
                    htmlFor={`field-options-${index}`}
                    hint={t.optionsHint}
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
                  label={t.fieldHint}
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
                  {field.type === "checkbox" ? t.mustTick : t.required}
                </label>
              </div>
            </div>
          ))}
          {form.fields.length === 0 && <p className="muted small">{t.noFields}</p>}
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="secondary"
            disabled={form.fields.length >= 10}
            onClick={addField}
          >
            <Icon name="plus" /> {t.addField}
          </button>
          <button type="submit">{t.saveForm}</button>
        </div>
      </form>
    </section>
  );
}
