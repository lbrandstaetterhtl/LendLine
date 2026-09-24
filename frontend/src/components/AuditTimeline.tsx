import type { IconName } from "./icons";

import { useState } from "react";

import { Icon } from "./icons";

type AuditChange = { field: string; from: string | null; to: string | null };

export type AuditEvent = {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorName: string;
  action: string;
  entityType: string;
  summary: string;
  details: { changes?: AuditChange[]; context?: Record<string, string> } | null;
  ip: string | null;
  userAgent: string | null;
};

export type AuditPage = { items: AuditEvent[]; nextCursor: string | null };

const actionLabels: Record<string, string> = {
  REQUEST_CREATED: "Anfrage gestellt",
  REQUEST_APPROVED: "Anfrage bestätigt",
  REQUEST_REJECTED: "Anfrage abgelehnt",
  REQUEST_RETURNED: "Rückgabe erfasst",
  DEVICE_CREATED: "Gerät angelegt",
  DEVICE_UPDATED: "Gerät geändert",
  DEVICE_DELETED: "Gerät gelöscht",
  IMAGE_ADDED: "Bild hochgeladen",
  IMAGE_REMOVED: "Bild entfernt",
  CATEGORY_CREATED: "Kategorie angelegt",
  CATEGORY_UPDATED: "Kategorie geändert",
  CATEGORY_DELETED: "Kategorie gelöscht",
  ROOM_CREATED: "Raum angelegt",
  ROOM_UPDATED: "Raum geändert",
  ROOM_DELETED: "Raum gelöscht",
  USER_CREATED: "Benutzer angelegt",
  USER_UPDATED: "Benutzer geändert",
  USER_DELETED: "Benutzer gelöscht",
  USER_REGISTERED: "Registrierung",
  LOGIN_SUCCEEDED: "Anmeldung",
  LOGIN_FAILED: "Anmeldung fehlgeschlagen",
  LOGOUT: "Abmeldung",
  MAINTENANCE_ON: "Wartungsmodus an",
  MAINTENANCE_OFF: "Wartungsmodus aus",
  MAINTENANCE_UPDATED: "Wartungshinweis geändert",
  MAINTENANCE_TASK: "Wartungsaufgabe",
  BRANDING_UPDATED: "Erscheinungsbild geändert",
};

function actionLabel(action: string) {
  return actionLabels[action] ?? action;
}

const entityIcons: Record<string, IconName> = {
  REQUEST: "inbox",
  DEVICE: "box",
  CATEGORY: "tag",
  ROOM: "door",
  USER: "users",
  AUTH: "login",
  SYSTEM: "tool",
};

/**
 * Red for failures and removals, green for completed steps, neutral otherwise.
 */
function tone(action: string): "bad" | "ok" | "" {
  if (/_(FAILED|DELETED|REJECTED|REMOVED)$/.test(action)) return "bad";
  if (/_(APPROVED|RETURNED|CREATED|REGISTERED)$/.test(action)) return "ok";
  return "";
}

function dayLabel(date: Date, today: Date): string {
  const days = Math.round(
    (new Date(today.toDateString()).getTime() - new Date(date.toDateString()).getTime()) /
      86_400_000
  );
  if (days === 0) return "Heute";
  if (days === 1) return "Gestern";
  return date.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

// Order matters: Edge also says "Chrome", Chrome also says "Safari", iOS says "Mac OS X" and
// Android says "Linux".
const browsers: [needle: string, name: string][] = [
  ["Edg/", "Edge"],
  ["Firefox/", "Firefox"],
  ["Chrome/", "Chrome"],
  ["Safari/", "Safari"],
];
const systems: [needle: string, name: string][] = [
  ["iPhone", "iOS"],
  ["iPad", "iOS"],
  ["Android", "Android"],
  ["Windows", "Windows"],
  ["Mac OS X", "macOS"],
  ["Linux", "Linux"],
];

function browser(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const name = browsers.find(([needle]) => userAgent.includes(needle))?.[1] ?? "Browser";
  const system = systems.find(([needle]) => userAgent.includes(needle))?.[1];
  return system ? `${name} auf ${system}` : name;
}

function address(ip: string | null): string | null {
  if (!ip) return null;
  const plain = ip.replace(/^::ffff:/, "");
  return plain === "127.0.0.1" || plain === "::1" ? "lokal" : plain;
}

function groupByDay(events: AuditEvent[]) {
  const groups: { key: string; date: Date; events: AuditEvent[] }[] = [];
  for (const event of events) {
    const date = new Date(event.createdAt);
    const key = date.toDateString();
    const last = groups.at(-1);
    if (last?.key === key) last.events.push(event);
    else groups.push({ key, date, events: [event] });
  }
  return groups;
}

export function AuditTimeline({ events, today }: { events: AuditEvent[]; today: Date }) {
  return (
    <div className="audit">
      {groupByDay(events).map((group) => (
        <section key={group.key} className="audit-day">
          <h3 className="audit-day-label">{dayLabel(group.date, today)}</h3>
          <ol className="audit-list">
            {group.events.map((event) => (
              <AuditItem key={event.id} event={event} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function AuditItem({ event }: { event: AuditEvent }) {
  const [open, setOpen] = useState(false);
  const changes = event.details?.changes ?? [];
  const context = Object.entries(event.details?.context ?? {});
  const where = [address(event.ip), browser(event.userAgent)].filter(Boolean).join(" · ");
  const hasDetails = changes.length > 0 || context.length > 0 || where !== "";
  const time = new Date(event.createdAt).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const detailsId = `audit-${event.id}`;

  return (
    <li className="audit-item">
      <span className={`audit-icon${tone(event.action) ? ` tone-${tone(event.action)}` : ""}`}>
        <Icon name={entityIcons[event.entityType] ?? "file"} />
      </span>
      <div className="audit-body">
        <div className="audit-head">
          <p className="audit-summary">{event.summary}</p>
          <span className="tag">{actionLabel(event.action)}</span>
        </div>
        <div className="audit-meta">
          <span>{event.actorName}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={event.createdAt}>{time}</time>
          {changes.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {changes.length} {changes.length === 1 ? "Änderung" : "Änderungen"}
              </span>
            </>
          )}
          {hasDetails && (
            <button
              type="button"
              className="linkish audit-toggle"
              aria-expanded={open}
              aria-controls={detailsId}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? "Weniger" : "Details"}
              <Icon name="chevron" />
            </button>
          )}
        </div>
        {open && (
          <div className="audit-details" id={detailsId}>
            {changes.length > 0 && (
              <table className="audit-changes">
                <caption className="sr-only">Änderungen</caption>
                <tbody>
                  {changes.map((change) => (
                    <tr key={`${change.field}|${change.from}|${change.to}`}>
                      <th scope="row">{change.field}</th>
                      <td>
                        {change.from === null ? (
                          <span className="muted">–</span>
                        ) : (
                          <del>{change.from}</del>
                        )}
                        <span className="audit-arrow" aria-label="geändert zu">
                          →
                        </span>
                        {change.to === null ? (
                          <span className="muted">–</span>
                        ) : (
                          <ins>{change.to}</ins>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {(context.length > 0 || where) && (
              <dl className="audit-context">
                {context.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
                {where && (
                  <div>
                    <dt>Zugriff</dt>
                    <dd>{where}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
