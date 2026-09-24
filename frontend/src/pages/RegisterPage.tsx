import type { SubmitEvent } from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { BrandLogo } from "../components/Logo";
import { Alert, Field } from "../components/ui";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Passwort muss mindestens 8 Zeichen haben");
      return;
    }
    setBusy(true);
    try {
      await register(name, email, password);
      void navigate("/search");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registrierung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <BrandLogo height={32} />
        </div>
        <h1>Konto erstellen</h1>
        <p className="lead">Für Ausleihanfragen bei der IT.</p>
        <div className="panel">
          <Alert>{error}</Alert>
          <form className="form-stack" onSubmit={(event) => void onSubmit(event)}>
            <Field label="Name" htmlFor="name">
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                autoComplete="name"
              />
            </Field>
            <Field label="E-Mail" htmlFor="email">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </Field>
            <Field label="Passwort" htmlFor="password" hint="Mindestens 8 Zeichen.">
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
              {busy ? "Wird erstellt…" : "Konto erstellen"}
            </button>
          </form>
        </div>
        <p className="auth-foot">
          Bereits registriert? <Link to="/login">Anmelden</Link>
        </p>
      </div>
    </div>
  );
}
