import type { SubmitEvent } from "react";
import { useEffect, useState } from "react";

import { api } from "../api/client";
import { errorMessage, useApi } from "../api/useApi";
import { SettingsTabs } from "../components/SettingsTabs";
import { Alert, Field, PageHeader } from "../components/ui";
import { useI18n } from "../i18n";

type MailSettings = {
  senderName: string;
  showLogo: boolean;
  greeting: string;
  signature: string;
  footer: string;
  approvedText: string;
  rejectedText: string;
  returnedText: string;
};

type Preview = { subject: string; html: string; text: string };

export function AdminEmailsPage() {
  const { data: stored, error, reload } = useApi<MailSettings>("/api/admin/settings/mail");
  const { m, locale } = useI18n();
  return (
    <>
      <SettingsTabs />
      <PageHeader title={m.mail.title} description={m.mail.description} />
      <Alert>{error}</Alert>
      {locale !== "de" && <p className="muted small page-note">{m.mail.languageNote}</p>}
      {stored && <MailForm key={JSON.stringify(stored)} stored={stored} onSaved={reload} />}
    </>
  );
}

function MailForm({ stored, onSaved }: { stored: MailSettings; onSaved: () => void }) {
  const [draft, setDraft] = useState(stored);
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState("");
  const [saveError, setSaveError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const changed = JSON.stringify(draft) !== JSON.stringify(stored);
  const { m } = useI18n();
  const t = m.mail;

  // The preview follows the draft with a short delay, so typing does not flood the server.
  useEffect(() => {
    const session = { active: true };
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const next = await api<Preview>("/api/admin/settings/mail/preview", {
            method: "POST",
            body: JSON.stringify(draft),
          });
          if (session.active) setPreview(next);
        } catch {
          // A draft that does not validate yet simply keeps the last preview.
        }
      })();
    }, 400);
    return () => {
      session.active = false;
      window.clearTimeout(timer);
    };
  }, [draft]);

  function set<K extends keyof MailSettings>(key: K, value: MailSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      await api("/api/admin/settings/mail", { method: "PUT", body: JSON.stringify(draft) });
      setInfo(t.saved);
      onSaved();
    } catch (err) {
      setSaveError(errorMessage(err, t.saveFailed));
      setSaving(false);
    }
  }

  async function restoreDefaults() {
    if (!window.confirm(t.confirmRestore)) return;
    try {
      await api("/api/admin/settings/mail", { method: "PUT", body: "{}" });
      setInfo(t.restored);
      onSaved();
    } catch (err) {
      setSaveError(errorMessage(err, t.restoreFailed));
    }
  }

  return (
    <>
      <Alert>{saveError}</Alert>
      <Alert tone="ok">{info}</Alert>
      <div className="dash-grid branding-grid">
        <section className="card">
          <form className="form-stack" onSubmit={(event) => void onSubmit(event)}>
            <div className="card-title">
              <h2>{t.frame}</h2>
            </div>
            <Field label={t.sender} htmlFor="mail-sender" optional hint={t.senderHint}>
              <input
                id="mail-sender"
                value={draft.senderName}
                maxLength={80}
                onChange={(event) => set("senderName", event.target.value)}
              />
            </Field>
            <label className="check" htmlFor="mail-logo">
              <input
                id="mail-logo"
                type="checkbox"
                checked={draft.showLogo}
                onChange={(event) => set("showLogo", event.target.checked)}
              />
              {t.showLogo}
            </label>
            <Field label={t.greeting} htmlFor="mail-greeting" hint={t.greetingHint}>
              <input
                id="mail-greeting"
                value={draft.greeting}
                maxLength={80}
                onChange={(event) => set("greeting", event.target.value)}
              />
            </Field>
            <Field label={t.signature} htmlFor="mail-signature" optional>
              <textarea
                id="mail-signature"
                value={draft.signature}
                maxLength={400}
                onChange={(event) => set("signature", event.target.value)}
              />
            </Field>
            <Field label={t.footer} htmlFor="mail-footer" optional>
              <textarea
                id="mail-footer"
                value={draft.footer}
                maxLength={400}
                onChange={(event) => set("footer", event.target.value)}
              />
            </Field>

            <div className="card-title">
              <h2>{t.texts}</h2>
            </div>
            <Field label={t.approved} htmlFor="mail-approved" optional hint={t.approvedHint}>
              <textarea
                id="mail-approved"
                value={draft.approvedText}
                maxLength={1000}
                onChange={(event) => set("approvedText", event.target.value)}
              />
            </Field>
            <Field label={t.rejected} htmlFor="mail-rejected" optional hint={t.rejectedHint}>
              <textarea
                id="mail-rejected"
                value={draft.rejectedText}
                maxLength={1000}
                onChange={(event) => set("rejectedText", event.target.value)}
              />
            </Field>
            <Field label={t.returned} htmlFor="mail-returned" optional>
              <textarea
                id="mail-returned"
                value={draft.returnedText}
                maxLength={1000}
                onChange={(event) => set("returnedText", event.target.value)}
              />
            </Field>
            <p className="muted small">{t.plainText}</p>
            <div className="form-actions">
              <button type="submit" disabled={saving || !changed}>
                {m.common.save}
              </button>
              <button type="button" className="ghost" onClick={() => void restoreDefaults()}>
                {t.restore}
              </button>
            </div>
          </form>
        </section>

        <section className="card">
          <div className="card-title">
            <h2>{t.preview}</h2>
            {changed && <span className="badge st-open">{t.unsaved}</span>}
          </div>
          {preview && (
            <>
              <p className="small">
                <span className="muted">{t.subject}</span> {preview.subject}
              </p>
              {/* No scripts, no forms, no navigation: the mail is only rendered. */}
              <iframe
                className="mail-preview"
                title={t.previewTitle}
                sandbox=""
                srcDoc={preview.html}
              />
            </>
          )}
          <p className="muted small">{t.tryIt}</p>
        </section>
      </div>
    </>
  );
}
