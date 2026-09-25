import type { User } from "../types";

import type { SubmitEvent } from "react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useApi } from "../api/useApi";
import { useAuth } from "../auth/AuthContext";
import { canOpen, homePath } from "../auth/permissions";
import { loginTitle, useBranding } from "../branding/BrandingContext";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { BrandLogo } from "../components/Logo";
import { Alert, Field } from "../components/ui";
import { format, formatDate, useI18n } from "../i18n";

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
  const { branding } = useBranding();
  const { login: texts, loginImageUrl } = branding;
  const { m } = useI18n();
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
      setError(err instanceof Error ? err.message : m.login.failed);
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
          <LanguageSwitch />
        </div>
        <h1>{loginTitle(branding, m)}</h1>
        {texts.text && <p className="auth-welcome">{texts.text}</p>}
        <p className="lead">{ldapEnabled ? m.login.leadLdap : m.login.lead}</p>
        {maintenance && (
          <div className="maintenance-note" aria-live="polite">
            <strong>{m.login.maintenanceTitle}</strong>
            <p>{maintenance.message}</p>
            {maintenance.until && (
              <p className="small">
                {format(m.login.maintenanceUntil, { date: formatDate(maintenance.until) })}
              </p>
            )}
            <p className="small">{m.login.maintenanceAdminOnly}</p>
          </div>
        )}
        <div className="panel">
          {/* A blocked login repeats the maintenance text; the note above already says it. */}
          <Alert>{error === maintenance?.message ? "" : error}</Alert>
          <form className="form-stack" onSubmit={(event) => void onSubmit(event)}>
            <Field label={ldapEnabled ? m.login.identifier : m.login.email} htmlFor="email">
              <input
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </Field>
            <Field label={m.login.password} htmlFor="password">
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
              {busy ? m.login.submitting : m.login.submit}
            </button>
          </form>
        </div>
        {allowRegister && (
          <p className="auth-foot">
            {m.login.noAccount} <Link to="/register">{m.login.register}</Link>
          </p>
        )}
      </div>
    </div>
  );
}
