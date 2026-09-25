import type { User } from "../types";

import type { SubmitEvent } from "react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useApi } from "../api/useApi";
import { useAuth } from "../auth/AuthContext";
import { canOpen, homePath } from "../auth/permissions";
import { useBranding } from "../branding/BrandingContext";
import { BrandLogo } from "../components/Logo";
import { Alert, Field } from "../components/ui";
import { formatDate } from "../types";

type AuthOptions = {
  ldapEnabled: boolean;
  allowLocalRegister: boolean;
  maintenance: { enabled: boolean; message?: string; until?: string | null };
};

/**
 * Where to go after the login: the page that sent the person here (only paths inside the app, never
 * another site) and only if the person's group may open it, else their start page.
 */
function afterLogin(state: unknown, user: User): string {
  const home = homePath(user);
  const from =
    typeof state === "object" && state !== null && "from" in state && typeof state.from === "string"
      ? state.from
      : "";
  if (!from.startsWith("/") || from.startsWith("//") || from.startsWith("/login")) return home;
  if (!canOpen(user, from)) return home;
  return from;
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: options } = useApi<AuthOptions>("/api/auth/options");
  const { login: texts, loginImageUrl } = useBranding().branding;
  const ldapEnabled = options?.ldapEnabled ?? false;
  // Off until the server says otherwise: registration is closed by default.
  const allowRegister = options?.allowLocalRegister ?? false;
  const maintenance = options?.maintenance.enabled ? options.maintenance : null;

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user = await login(email, password);
      void navigate(afterLogin(state, user), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`auth-wrap${loginImageUrl ? " has-image" : ""}`}>
      {loginImageUrl && (
        <div className="auth-image" style={{ backgroundImage: `url("${loginImageUrl}")` }} />
      )}
      <div className="auth-card">
        <div className="auth-brand">
          <BrandLogo height={32} />
        </div>
        <h1>{texts.title}</h1>
        {texts.text && <p className="auth-welcome">{texts.text}</p>}
        <p className="lead">
          {ldapEnabled ? "Mit Ihrem Verzeichnis- oder lokalen Konto." : "Mit Ihrem LendLine-Konto."}
        </p>
        {maintenance && (
          <div className="maintenance-note" aria-live="polite">
            <strong>Wartungsarbeiten</strong>
            <p>{maintenance.message}</p>
            {maintenance.until && (
              <p className="small">Voraussichtlich bis {formatDate(maintenance.until)}.</p>
            )}
            <p className="small">Die Anmeldung ist nur für die Verwaltung möglich.</p>
          </div>
        )}
        <div className="panel">
          {/* A blocked login repeats the maintenance text; the note above already says it. */}
          <Alert>{error === maintenance?.message ? "" : error}</Alert>
          <form className="form-stack" onSubmit={(event) => void onSubmit(event)}>
            <Field label={ldapEnabled ? "E-Mail oder Benutzername" : "E-Mail"} htmlFor="email">
              <input
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </Field>
            <Field label="Passwort" htmlFor="password">
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </Field>
            <button type="submit" className="block" disabled={busy}>
              {busy ? "Anmelden…" : "Anmelden"}
            </button>
          </form>
        </div>
        {allowRegister && (
          <p className="auth-foot">
            Noch kein Konto? <Link to="/register">Registrieren</Link>
          </p>
        )}
      </div>
    </div>
  );
}
