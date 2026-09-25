import type { Terms } from "../branding/BrandingContext";
import type { IconName } from "../components/icons";
import type { Messages } from "../i18n/de";

import type { SubmitEvent } from "react";
import { useState } from "react";

import { api } from "../api/client";
import { errorMessage, useApi } from "../api/useApi";
import { useTerms } from "../branding/BrandingContext";
import { Icon } from "../components/icons";
import { SettingsTabs } from "../components/SettingsTabs";
import { Alert, Field, PageHeader, refreshNav } from "../components/ui";
import { format, formatDate, formatNumber, localizedDefault, useI18n } from "../i18n";
import { de } from "../i18n/de";
import { toLocalInput } from "../types";

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
  title: (m: Messages) => string;
  description: (status: SystemStatus, m: Messages, terms: Terms) => string;
  confirm?: (m: Messages) => string;
  danger?: boolean;
};

const tasks: Task[] = [
  {
    id: "cleanup-sessions",
    icon: "trash",
    title: (m) => m.maintenance.tasks.cleanupSessions.title,
    description: (s, m) =>
      format(m.maintenance.tasks.cleanupSessions.description, { count: s.sessions.stale }),
  },
  {
    id: "cleanup-uploads",
    icon: "image",
    title: (m) => m.maintenance.tasks.cleanupUploads.title,
    description: (s, m, terms) =>
      s.uploads.orphans === 0
        ? format(m.maintenance.tasks.cleanupUploads.none, { device: terms.device })
        : format(m.maintenance.tasks.cleanupUploads.description, {
            count: s.uploads.orphans,
            size: megabytes(s.uploads.orphanBytes),
            device: terms.device,
          }),
    confirm: (m) => m.maintenance.tasks.cleanupUploads.confirm,
  },
  {
    id: "refresh-units",
    icon: "refresh",
    title: (m) => m.maintenance.tasks.refreshUnits.title,
    description: (_s, m, terms) =>
      format(m.maintenance.tasks.refreshUnits.description, { units: terms.units }),
  },
  {
    id: "test-mail",
    icon: "mail",
    title: (m) => m.maintenance.tasks.testMail.title,
    description: (s, m) =>
      s.integrations.smtp
        ? format(m.maintenance.tasks.testMail.smtp, { smtp: s.integrations.smtp })
        : m.maintenance.tasks.testMail.console,
  },
  {
    id: "end-sessions",
    icon: "logout",
    title: (m) => m.maintenance.tasks.endSessions.title,
    description: (s, m) =>
      format(m.maintenance.tasks.endSessions.description, { count: s.sessions.active }),
    confirm: (m) => m.maintenance.tasks.endSessions.confirm,
    danger: true,
  },
];

function megabytes(bytes: number): string {
  return `${formatNumber(Math.round((bytes / 1024 / 1024) * 10) / 10)} MB`;
}

function duration(seconds: number, m: Messages): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const t = m.maintenance;
  if (days > 0) {
    return `${format(t.days, { count: days })}, ${format(t.hoursShort, { count: hours })}`;
  }
  if (hours > 0) {
    return `${format(t.hoursShort, { count: hours })}, ${format(t.minutesShort, { count: minutes })}`;
  }
  return format(t.minutesShort, { count: minutes });
}

export function AdminMaintenancePage() {
  const { data: status, error, reload } = useApi<SystemStatus>("/api/admin/maintenance");
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const [taskError, setTaskError] = useState("");
  const { m } = useI18n();
  const t = m.maintenance;
  const terms = useTerms();

  async function run(task: Task) {
    if (task.confirm && !window.confirm(task.confirm(m))) return;
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
      setTaskError(errorMessage(err, t.taskFailed));
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
      <PageHeader title={t.title} description={t.description} />
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
                <h2>{t.status}</h2>
                <button type="button" className="ghost sm" onClick={reload}>
                  <Icon name="refresh" /> {t.refresh}
                </button>
              </div>
              <dl className="status-list">
                <div>
                  <dt>{t.database}</dt>
                  <dd>
                    {status.database.ok ? (
                      <span className="badge st-available">
                        {format(t.reachable, { ms: status.database.latencyMs ?? "–" })}
                      </span>
                    ) : (
                      <span className="badge st-rejected">{t.unreachable}</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t.uptime}</dt>
                  <dd>
                    {duration(status.app.uptimeSeconds, m)}
                    <span className="muted">
                      {" "}
                      · {format(t.since, { date: formatDate(status.app.startedAt) })}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>{t.version}</dt>
                  <dd>
                    LendLine {status.app.version}
                    <span className="muted">
                      {" "}
                      · Node {status.app.node} · {status.app.environment}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>{t.email}</dt>
                  <dd>
                    {status.integrations.smtp ?? <span className="muted">{t.consoleOnly}</span>}
                  </dd>
                </div>
                <div>
                  <dt>{t.directory}</dt>
                  <dd>{status.integrations.ldap ?? <span className="muted">{t.off}</span>}</dd>
                </div>
                <div>
                  <dt>{t.sessions}</dt>
                  <dd>
                    {format(t.sessionsActive, { count: status.sessions.active })}
                    <span className="muted">
                      {" "}
                      · {format(t.sessionsStale, { count: status.sessions.stale })}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>{t.images}</dt>
                  <dd>
                    {format(t.files, {
                      count: status.uploads.files,
                      size: megabytes(status.uploads.bytes),
                    })}
                    {status.uploads.orphans > 0 && (
                      <span className="muted">
                        {" "}
                        · {format(t.orphans, { count: status.uploads.orphans })}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t.data}</dt>
                  <dd>
                    {format(t.dataCounts, {
                      users: status.counts.users,
                      devices: status.counts.devices,
                      devicesTerm: terms.devices,
                      units: status.counts.units,
                      unitsTerm: terms.units,
                      requests: status.counts.requests,
                    })}
                  </dd>
                </div>
                <div>
                  <dt>{t.audit}</dt>
                  <dd>
                    {format(t.entries, { count: status.audit.events })}
                    {status.audit.since && (
                      <span className="muted">
                        {" "}
                        · {format(t.since, { date: formatDate(status.audit.since) })}
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          <div className="section-title">
            <h2>{t.tasksTitle}</h2>
          </div>
          <ul className="task-list">
            {tasks.map((task) => (
              <li key={task.id}>
                <span className={`audit-icon${task.danger ? " tone-bad" : ""}`}>
                  <Icon name={task.icon} />
                </span>
                <div className="task-body">
                  <strong>{task.title(m)}</strong>
                  <p>{task.description(status, m, terms)}</p>
                </div>
                <button
                  type="button"
                  className={task.danger ? "danger sm" : "secondary sm"}
                  disabled={running !== null}
                  onClick={() => void run(task)}
                >
                  {running === task.id ? t.running : t.run}
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
  const { m } = useI18n();
  const t = m.maintenance;
  // The built-in notice is shown in the reader's language and stays the built-in one when saved,
  // so every user keeps getting it in their own language.
  const [message, setMessage] = useState(() =>
    localizedDefault(mode.message, (d) => d.maintenance.defaultMessage)
  );
  const [until, setUntil] = useState(mode.until ? toLocalInput(new Date(mode.until)) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(enabled: boolean) {
    setSaving(true);
    setError("");
    try {
      await api("/api/admin/maintenance/mode", {
        method: "PUT",
        body: JSON.stringify({
          enabled,
          message: message === t.defaultMessage ? de.maintenance.defaultMessage : message,
          until: until || null,
        }),
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err, t.saveFailed));
      setSaving(false);
    }
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode.enabled && !window.confirm(t.confirmOn)) {
      return;
    }
    void save(true);
  }

  return (
    <section className={`card${mode.enabled ? " maintenance-on" : ""}`}>
      <div className="card-title">
        <h2>{t.mode}</h2>
        {mode.enabled ? (
          <span className="badge st-open">{t.active}</span>
        ) : (
          <span className="badge st-returned">{t.inactive}</span>
        )}
      </div>
      <p className="muted small">{t.modeHint}</p>
      <Alert>{error}</Alert>
      <form className="form-stack" onSubmit={onSubmit}>
        <Field label={t.message} htmlFor="maintenance-message" hint={t.messageHint}>
          <textarea
            id="maintenance-message"
            value={message}
            maxLength={500}
            onChange={(event) => setMessage(event.target.value)}
          />
        </Field>
        <Field label={t.until} htmlFor="maintenance-until" optional>
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
                {t.saveNotice}
              </button>
              <button type="button" disabled={saving} onClick={() => void save(false)}>
                {t.end}
              </button>
            </>
          ) : (
            <button type="submit" disabled={saving}>
              <Icon name="tool" /> {t.start}
            </button>
          )}
        </div>
      </form>
      {mode.updatedAt && (
        <p className="muted small" style={{ margin: "12px 0 0" }}>
          {mode.updatedBy
            ? format(t.lastChangedBy, { date: formatDate(mode.updatedAt), name: mode.updatedBy })
            : format(t.lastChanged, { date: formatDate(mode.updatedAt) })}
        </p>
      )}
    </section>
  );
}
