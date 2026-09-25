import type { SubmitEvent } from "react";
import { useState } from "react";

import { errorMessage } from "../api/useApi";
import { useAuth } from "../auth/AuthContext";
import { Alert, Field, PageHeader } from "../components/ui";

export function AccountPage() {
  const { user, changePassword } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  if (!user) return null;
  const forced = user.mustChangePassword;
  const local = user.authSource === "LOCAL";

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setInfo("");
    if (next !== repeat) {
      setError("Die beiden neuen Passwörter stimmen nicht überein.");
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setRepeat("");
      setInfo("Passwort geändert. Auf allen anderen Geräten wurden Sie abgemeldet.");
    } catch (err) {
      setError(errorMessage(err, "Passwort konnte nicht geändert werden"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Mein Konto"
        description={
          forced
            ? "Ihr Passwort wurde von der Verwaltung vergeben. Bitte legen Sie jetzt ein eigenes fest, erst danach können Sie LendLine nutzen."
            : "Ihre Anmeldedaten."
        }
      />
      <div className="dash-grid account-grid">
        <section className="card">
          <div className="card-title">
            <h2>Konto</h2>
          </div>
          <dl className="status-list">
            <div>
              <dt>Name</dt>
              <dd>{user.name}</dd>
            </div>
            <div>
              <dt>E-Mail</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Rolle</dt>
              <dd>{user.role === "ADMIN" ? "Verwaltung" : "Nutzer"}</dd>
            </div>
            <div>
              <dt>Anmeldung</dt>
              <dd>{local ? "Lokales Konto" : "Verzeichnis (LDAP)"}</dd>
            </div>
          </dl>
        </section>

        <section className="card">
          <div className="card-title">
            <h2>Passwort ändern</h2>
            {forced && <span className="badge st-open">Erforderlich</span>}
          </div>
          {local ? (
            <>
              <Alert>{error}</Alert>
              <Alert tone="ok">{info}</Alert>
              <form className="form-stack" onSubmit={(event) => void onSubmit(event)}>
                <Field
                  label={forced ? "Vorläufiges Passwort" : "Aktuelles Passwort"}
                  htmlFor="current-password"
                >
                  <input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={current}
                    onChange={(event) => setCurrent(event.target.value)}
                  />
                </Field>
                <Field
                  label="Neues Passwort"
                  htmlFor="new-password"
                  hint="Mindestens 8 Zeichen, höchstens 72 Byte."
                >
                  <input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={next}
                    onChange={(event) => setNext(event.target.value)}
                  />
                </Field>
                <Field label="Neues Passwort wiederholen" htmlFor="repeat-password">
                  <input
                    id="repeat-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={repeat}
                    onChange={(event) => setRepeat(event.target.value)}
                  />
                </Field>
                <div className="form-actions">
                  <button type="submit" disabled={busy}>
                    {busy ? "Speichert…" : "Passwort ändern"}
                  </button>
                </div>
              </form>
              <p className="muted small">Danach werden Sie auf allen anderen Geräten abgemeldet.</p>
            </>
          ) : (
            <p className="muted small">
              Ihr Konto kommt aus dem Firmenverzeichnis. Das Passwort ändern Sie dort, zum Beispiel
              über Windows.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
