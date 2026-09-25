import type { IconName } from "../components/icons";

import type { SubmitEvent } from "react";
import { useState } from "react";

import { api } from "../api/client";
import { errorMessage, useApi } from "../api/useApi";
import { Icon } from "../components/icons";
import { SettingsTabs } from "../components/SettingsTabs";
import { Alert, Field, PageHeader, refreshNav } from "../components/ui";
import { formatDate, toLocalInput } from "../types";

type MaintenanceMode = {
  enabled: boolean;
  message: string;
  until: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

type SystemStatus = {
  maintenance: MaintenanceMode;
  database: { ok: boolean; latencyMs: number | null };
  app: {
    version: string;
    node: string;
    environment: string;
    startedAt: string;
    uptimeSeconds: number;
  };
  integrations: { smtp: string | null; ldap: string | null };
  counts: { users: number; devices: number; units: number; requests: number };
  sessions: { active: number; stale: number };
  uploads: { files: number; bytes: number; orphans: number; orphanBytes: number };
  audit: { events: number; since: string | null };
};

type Task = {
  id: string;
  icon: IconName;
  title: string;
  description: (status: SystemStatus) => string;
  confirm?: string;
  danger?: boolean;
};

const tasks: Task[] = [
  {
    id: "cleanup-sessions",
    icon: "trash",
    title: "Abgelaufene Sitzungen bereinigen",
    description: (s) =>
      `${s.sessions.stale} abgelaufene oder beendete Sitzungen liegen noch in der Datenbank. Aktive Sitzungen bleiben unberührt.`,
  },
  {
    id: "cleanup-uploads",
    icon: "image",
    title: "Verwaiste Bilddateien löschen",
    description: (s) =>
      s.uploads.orphans === 0
        ? "Keine verwaisten Dateien: Jede Bilddatei gehört zu einem Gerät."
        : `${s.uploads.orphans} Dateien (${megabytes(s.uploads.orphanBytes)}) gehören zu keinem Gerät mehr.`,
    confirm: "Verwaiste Bilddateien endgültig löschen?",
  },
  {
    id: "refresh-units",
    icon: "refresh",
    title: "Gerätestatus neu berechnen",
    description: () =>
      "Setzt „Verfügbar“ und „Ausgeliehen“ aller Stücke anhand der bestätigten Ausleihen neu. Defekte Stücke bleiben defekt.",
  },
  {
    id: "test-mail",
    icon: "mail",
    title: "Test-E-Mail an mich senden",
    description: (s) =>
      s.integrations.smtp
        ? `Prüft den Versand über ${s.integrations.smtp}.`
        : "SMTP ist nicht eingerichtet: Die E-Mail wird nur in der Server-Konsole ausgegeben.",
  },
  {
    id: "end-sessions",
    icon: "logout",
    title: "Alle Sitzungen beenden",
    description: (s) =>
      `Meldet alle ${s.sessions.active} aktiven Sitzungen außer Ihrer eigenen ab, z. B. nach einer Passwortpanne.`,
    confirm: "Wirklich alle anderen Personen abmelden? Sie müssen sich neu anmelden.",
    danger: true,
  },
];

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function duration(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} ${days === 1 ? "Tag" : "Tage"}, ${hours} Std.`;
  if (hours > 0) return `${hours} Std., ${minutes} Min.`;
  return `${minutes} Min.`;
}

export function AdminMaintenancePage() {
  const { data: status, error, reload } = useApi<SystemStatus>("/api/admin/maintenance");
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const [taskError, setTaskError] = useState("");

  async function run(task: Task) {
    if (task.confirm && !window.confirm(task.confirm)) return;
    setRunning(task.id);
    setResult("");
    setTaskError("");
    try {
      const response = await api<{ message: string }>(`/api/admin/maintenance/tasks/${task.id}`, {
        method: "POST",
      });
      setResult(response.message);
      reload();
    } catch (err) {
      setTaskError(errorMessage(err, "Aufgabe fehlgeschlagen"));
    } finally {
      setRunning(null);
    }
  }

  function onModeSaved() {
    reload();
    refreshNav();
  }

  return (
    <>
      <SettingsTabs />
      <PageHeader
        title="Wartung"
        description="Wartungsmodus, Systemzustand und Aufräumarbeiten. Jede Aktion wird im Protokoll festgehalten."
      />
      <Alert>{error || taskError}</Alert>
      <Alert tone="ok">{result}</Alert>

      {status && (
        <>
          <div className="dash-grid maintenance-grid">
            <MaintenanceForm
              key={status.maintenance.updatedAt ?? "never"}
              mode={status.maintenance}
              onSaved={onModeSaved}
            />
            <section className="card">
              <div className="card-title">
                <h2>Systemstatus</h2>
                <button type="button" className="ghost sm" onClick={reload}>
                  <Icon name="refresh" /> Aktualisieren
                </button>
              </div>
              <dl className="status-list">
                <div>
                  <dt>Datenbank</dt>
                  <dd>
                    {status.database.ok ? (
                      <span className="badge st-available">
                        erreichbar · {status.database.latencyMs} ms
                      </span>
                    ) : (
                      <span className="badge st-rejected">nicht erreichbar</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Laufzeit</dt>
                  <dd>
                    {duration(status.app.uptimeSeconds)}
                    <span className="muted"> · seit {formatDate(status.app.startedAt)}</span>
                  </dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>
                    LendLine {status.app.version}
                    <span className="muted">
                      {" "}
                      · Node {status.app.node} · {status.app.environment}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>E-Mail</dt>
                  <dd>
                    {status.integrations.smtp ?? (
                      <span className="muted">nur Konsole (kein SMTP)</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Verzeichnis (LDAP)</dt>
                  <dd>{status.integrations.ldap ?? <span className="muted">aus</span>}</dd>
                </div>
                <div>
                  <dt>Sitzungen</dt>
                  <dd>
                    {status.sessions.active} aktiv
                    <span className="muted"> · {status.sessions.stale} abgelaufen</span>
                  </dd>
                </div>
                <div>
                  <dt>Bilder</dt>
                  <dd>
                    {status.uploads.files} Dateien, {megabytes(status.uploads.bytes)}
                    {status.uploads.orphans > 0 && (
                      <span className="muted"> · {status.uploads.orphans} verwaist</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Daten</dt>
                  <dd>
                    {status.counts.users} Benutzer · {status.counts.devices} Geräte ·{" "}
                    {status.counts.units} Stücke · {status.counts.requests} Anfragen
                  </dd>
                </div>
                <div>
                  <dt>Protokoll</dt>
                  <dd>
                    {status.audit.events} Einträge
                    {status.audit.since && (
                      <span className="muted"> · seit {formatDate(status.audit.since)}</span>
                    )}
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          <div className="section-title">
            <h2>Wartungsaufgaben</h2>
          </div>
          <ul className="task-list">
            {tasks.map((task) => (
              <li key={task.id}>
                <span className={`audit-icon${task.danger ? " tone-bad" : ""}`}>
                  <Icon name={task.icon} />
                </span>
                <div className="task-body">
                  <strong>{task.title}</strong>
                  <p>{task.description(status)}</p>
                </div>
                <button
                  type="button"
                  className={task.danger ? "danger sm" : "secondary sm"}
                  disabled={running !== null}
                  onClick={() => void run(task)}
                >
                  {running === task.id ? "Läuft…" : "Ausführen"}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function MaintenanceForm({ mode, onSaved }: { mode: MaintenanceMode; onSaved: () => void }) {
  const [message, setMessage] = useState(mode.message);
  const [until, setUntil] = useState(mode.until ? toLocalInput(new Date(mode.until)) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(enabled: boolean) {
    setSaving(true);
    setError("");
    try {
      await api("/api/admin/maintenance/mode", {
        method: "PUT",
        body: JSON.stringify({ enabled, message, until: until || null }),
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "Speichern fehlgeschlagen"));
      setSaving(false);
    }
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !mode.enabled &&
      !window.confirm(
        "Wartungsmodus einschalten?\n\nNutzer werden sofort abgemeldet und können sich erst danach wieder anmelden. Die Verwaltung arbeitet weiter."
      )
    ) {
      return;
    }
    void save(true);
  }

  return (
    <section className={`card${mode.enabled ? " maintenance-on" : ""}`}>
      <div className="card-title">
        <h2>Wartungsmodus</h2>
        {mode.enabled ? (
          <span className="badge st-open">Aktiv</span>
        ) : (
          <span className="badge st-returned">Aus</span>
        )}
      </div>
      <p className="muted small">
        Während der Wartung können sich nur Personen der Verwaltung anmelden. Nutzer sehen den
        Hinweis auf der Anmeldeseite; ihre Sitzung läuft nach der Wartung ohne neue Anmeldung
        weiter.
      </p>
      <Alert>{error}</Alert>
      <form className="form-stack" onSubmit={onSubmit}>
        <Field label="Hinweis für Nutzer" htmlFor="maintenance-message">
          <textarea
            id="maintenance-message"
            value={message}
            maxLength={500}
            onChange={(event) => setMessage(event.target.value)}
          />
        </Field>
        <Field label="Voraussichtlich bis" htmlFor="maintenance-until" optional>
          <input
            id="maintenance-until"
            type="datetime-local"
            value={until}
            onChange={(event) => setUntil(event.target.value)}
          />
        </Field>
        <div className="form-actions">
          {mode.enabled ? (
            <>
              <button type="submit" className="secondary" disabled={saving}>
                Hinweis speichern
              </button>
              <button type="button" disabled={saving} onClick={() => void save(false)}>
                Wartungsmodus beenden
              </button>
            </>
          ) : (
            <button type="submit" disabled={saving}>
              <Icon name="tool" /> Wartungsmodus einschalten
            </button>
          )}
        </div>
      </form>
      {mode.updatedAt && (
        <p className="muted small" style={{ margin: "12px 0 0" }}>
          Zuletzt geändert {formatDate(mode.updatedAt)}
          {mode.updatedBy ? ` von ${mode.updatedBy}` : ""}.
        </p>
      )}
    </section>
  );
}
