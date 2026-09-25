import type { SubmitEvent } from "react";
import { useEffect, useState } from "react";

import { api } from "../api/client";
import { errorMessage, useApi } from "../api/useApi";
import { SettingsTabs } from "../components/SettingsTabs";
import { Alert, Field, PageHeader } from "../components/ui";

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
  return (
    <>
      <SettingsTabs />
      <PageHeader
        title="E-Mails"
        description="Absender, Texte und Signatur der Benachrichtigungen bei Bestätigung, Ablehnung und Rückgabe."
      />
      <Alert>{error}</Alert>
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
      setInfo("E-Mail-Einstellungen gespeichert.");
      onSaved();
    } catch (err) {
      setSaveError(errorMessage(err, "Speichern fehlgeschlagen"));
      setSaving(false);
    }
  }

  async function restoreDefaults() {
    if (!window.confirm("Alle E-Mail-Texte auf den Standard zurücksetzen?")) return;
    try {
      await api("/api/admin/settings/mail", { method: "PUT", body: "{}" });
      setInfo("Standardtexte wiederhergestellt.");
      onSaved();
    } catch (err) {
      setSaveError(errorMessage(err, "Zurücksetzen fehlgeschlagen"));
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
              <h2>Absender und Rahmen</h2>
            </div>
            <Field
              label="Absendername"
              htmlFor="mail-sender"
              optional
              hint="Name, den das Postfach anzeigt, z. B. „IT-Service Muster GmbH“. Die Adresse selbst kommt aus der Server-Konfiguration (SMTP_FROM)."
            >
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
              Logo oben in der E-Mail zeigen (PNG, JPG oder WEBP; ein SVG-Logo zeigen viele
              E-Mail-Programme nicht)
            </label>
            <Field label="Anrede" htmlFor="mail-greeting" hint="Danach folgt der Name.">
              <input
                id="mail-greeting"
                value={draft.greeting}
                maxLength={80}
                onChange={(event) => set("greeting", event.target.value)}
              />
            </Field>
            <Field label="Signatur" htmlFor="mail-signature" optional>
              <textarea
                id="mail-signature"
                value={draft.signature}
                maxLength={400}
                onChange={(event) => set("signature", event.target.value)}
              />
            </Field>
            <Field label="Fußzeile" htmlFor="mail-footer" optional>
              <textarea
                id="mail-footer"
                value={draft.footer}
                maxLength={400}
                onChange={(event) => set("footer", event.target.value)}
              />
            </Field>

            <div className="card-title">
              <h2>Texte je Nachricht</h2>
            </div>
            <Field
              label="Bestätigung"
              htmlFor="mail-approved"
              optional
              hint="Z. B. wo und wann abgeholt wird und was mitzubringen ist."
            >
              <textarea
                id="mail-approved"
                value={draft.approvedText}
                maxLength={1000}
                onChange={(event) => set("approvedText", event.target.value)}
              />
            </Field>
            <Field
              label="Ablehnung"
              htmlFor="mail-rejected"
              optional
              hint="Steht unter dem Ablehnungsgrund, z. B. an wen man sich wenden kann."
            >
              <textarea
                id="mail-rejected"
                value={draft.rejectedText}
                maxLength={1000}
                onChange={(event) => set("rejectedText", event.target.value)}
              />
            </Field>
            <Field label="Rückgabe" htmlFor="mail-returned" optional>
              <textarea
                id="mail-returned"
                value={draft.returnedText}
                maxLength={1000}
                onChange={(event) => set("returnedText", event.target.value)}
              />
            </Field>
            <p className="muted small">
              Nur Text: Zeilenumbrüche bleiben erhalten, HTML wird nicht ausgeführt.
            </p>
            <div className="form-actions">
              <button type="submit" disabled={saving || !changed}>
                Speichern
              </button>
              <button type="button" className="ghost" onClick={() => void restoreDefaults()}>
                Standard wiederherstellen
              </button>
            </div>
          </form>
        </section>

        <section className="card">
          <div className="card-title">
            <h2>Vorschau: Bestätigung</h2>
            {changed && <span className="badge st-open">Nicht gespeichert</span>}
          </div>
          {preview && (
            <>
              <p className="small">
                <span className="muted">Betreff:</span> {preview.subject}
              </p>
              {/* No scripts, no forms, no navigation: the mail is only rendered. */}
              <iframe
                className="mail-preview"
                title="Vorschau der Bestätigungs-E-Mail"
                sandbox=""
                srcDoc={preview.html}
              />
            </>
          )}
          <p className="muted small">
            Zum Ausprobieren im echten Postfach: Wartung → „Test-E-Mail an mich senden“.
          </p>
        </section>
      </div>
    </>
  );
}
