import type { SubmitEvent } from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { BrandLogo } from "../components/Logo";
import { Alert, Field } from "../components/ui";
import { useI18n } from "../i18n";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { m } = useI18n();

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError(m.register.passwordMin);
      return;
    }
    setBusy(true);
    try {
      await register(name, email, password);
      void navigate("/search");
    } catch (err) {
      setError(err instanceof Error ? err.message : m.register.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <BrandLogo height={32} />
          <LanguageSwitch />
        </div>
        <h1>{m.register.title}</h1>
        <p className="lead">{m.register.lead}</p>
        <div className="panel">
          <Alert>{error}</Alert>
          <form className="form-stack" onSubmit={(event) => void onSubmit(event)}>
            <Field label={m.register.name} htmlFor="name">
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                autoComplete="name"
              />
            </Field>
            <Field label={m.login.email} htmlFor="email">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </Field>
            <Field label={m.login.password} htmlFor="password" hint={m.register.passwordHint}>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Field>
            <button type="submit" className="block" disabled={busy}>
              {busy ? m.register.submitting : m.register.submit}
            </button>
          </form>
        </div>
        <p className="auth-foot">
          {m.register.haveAccount} <Link to="/login">{m.register.login}</Link>
        </p>
      </div>
    </div>
  );
}
