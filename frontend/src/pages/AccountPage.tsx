import type { SubmitEvent } from "react";
import { useState } from "react";

import { errorMessage } from "../api/useApi";
import { useAuth } from "../auth/AuthContext";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { Alert, Field, PageHeader } from "../components/ui";
import { useI18n } from "../i18n";

export function AccountPage() {
  const { user, changePassword } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const { m } = useI18n();
  const a = m.account;
  if (!user) return null;
  const forced = user.mustChangePassword;
  const local = user.authSource === "LOCAL";

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setInfo("");
    if (next !== repeat) {
      setError(a.mismatch);
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setRepeat("");
      setInfo(a.changed);
    } catch (err) {
      setError(errorMessage(err, a.failed));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={a.title} description={forced ? a.descriptionForced : a.description} />
      <div className="dash-grid account-grid">
        <section className="card">
          <div className="card-title">
            <h2>{a.account}</h2>
          </div>
          <dl className="status-list">
            <div>
              <dt>{a.name}</dt>
              <dd>{user.name}</dd>
            </div>
            <div>
              <dt>{a.email}</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>{a.group}</dt>
              <dd>{user.group.name}</dd>
            </div>
            <div>
              <dt>{a.signIn}</dt>
              <dd>{local ? a.local : a.ldap}</dd>
            </div>
          </dl>
          <div className="form-stack account-language">
            <Field label={a.language} htmlFor="account-language" hint={a.languageHint}>
              <LanguageSwitch id="account-language" />
            </Field>
          </div>
        </section>

        <section className="card">
          <div className="card-title">
            <h2>{a.passwordTitle}</h2>
            {forced && <span className="badge st-open">{a.required}</span>}
          </div>
          {local ? (
            <>
              <Alert>{error}</Alert>
              <Alert tone="ok">{info}</Alert>
              <form className="form-stack" onSubmit={(event) => void onSubmit(event)}>
                <Field label={forced ? a.temporary : a.current} htmlFor="current-password">
                  <input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={current}
                    onChange={(event) => setCurrent(event.target.value)}
                  />
                </Field>
                <Field label={a.next} htmlFor="new-password" hint={a.nextHint}>
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
                <Field label={a.repeat} htmlFor="repeat-password">
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
                    {busy ? m.common.saving : a.submit}
                  </button>
                </div>
              </form>
              <p className="muted small">{a.signedOutElsewhere}</p>
            </>
          ) : (
            <p className="muted small">{a.directory}</p>
          )}
        </section>
      </div>
    </>
  );
}
