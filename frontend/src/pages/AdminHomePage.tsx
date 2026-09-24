import type { AuditPage } from "../components/AuditTimeline";
import type { BorrowRequest } from "../types";

import { useState } from "react";
import { Link } from "react-router-dom";

import { useApi } from "../api/useApi";
import { AuditTimeline } from "../components/AuditTimeline";
import { Alert, PageHeader } from "../components/ui";
import { formatDate } from "../types";

type Summary = {
  users: number;
  categories: number;
  devices: number;
  devicesAvailable: number;
  devicesBorrowed: number;
  devicesDefective: number;
  openRequests: number;
  activeLoans: number;
};

function endOfToday(now: Date): number {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

export function AdminHomePage() {
  const [now] = useState(() => new Date());
  const { data: summary, error } = useApi<Summary>("/api/admin/summary");
  const { data: audit } = useApi<AuditPage>("/api/admin/audit?limit=8");
  const { data: open } = useApi<BorrowRequest[]>("/api/requests?status=OPEN");
  const { data: loans } = useApi<BorrowRequest[]>("/api/requests?status=APPROVED");
  const events = audit?.items ?? [];
  // The API lists open requests oldest first, which is the order they should be decided in.
  const waiting = (open ?? []).slice(0, 5);
  const dueToday = (loans ?? [])
    .filter((loan) => new Date(loan.desiredUntil).getTime() <= endOfToday(now))
    .toSorted((a, b) => a.desiredUntil.localeCompare(b.desiredUntil))
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title="Übersicht"
        description="Offene Anfragen und laufende Ausleihen auf einen Blick."
      />
      <Alert>{error}</Alert>
      {summary && (
        <div className="stats">
          <Link className="stat" to="/admin/requests">
            <div className="label">Offene Anfragen</div>
            <div className="value">{summary.openRequests}</div>
            <div className="sub">warten auf Entscheidung</div>
          </Link>
          <Link className="stat" to="/admin/borrowed">
            <div className="label">Laufende Ausleihen</div>
            <div className="value">{summary.activeLoans}</div>
            <div className="sub">bestätigt, nicht zurück</div>
          </Link>
          <Link className="stat" to="/admin/devices">
            <div className="label">Stücke verfügbar</div>
            <div className="value">{summary.devicesAvailable}</div>
            <div className="sub">
              {summary.devicesBorrowed} ausgeliehen · {summary.devicesDefective} defekt
            </div>
          </Link>
          <Link className="stat" to="/admin/users">
            <div className="label">Benutzer</div>
            <div className="value">{summary.users}</div>
            <div className="sub">
              {summary.devices} Geräte · {summary.categories} Kategorien
            </div>
          </Link>
        </div>
      )}

      <div className="dash-grid">
        <section className="card">
          <div className="card-title">
            <h2>Warten auf Entscheidung</h2>
            <Link to="/admin/requests" className="small">
              Alle prüfen
            </Link>
          </div>
          {waiting.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>
              Keine offenen Anfragen.
            </p>
          ) : (
            <ul className="mini-list">
              {waiting.map((item) => (
                <li key={item.id}>
                  <div className="mini-row">
                    <strong>{item.device.name}</strong>
                    <span className="muted small">{item.user.name}</span>
                  </div>
                  <div className="muted small">
                    {formatDate(item.startsAt)} – {formatDate(item.desiredUntil)}
                    {item.room ? ` · Raum ${item.room.name}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-title">
            <h2>Rückgaben heute & überfällig</h2>
            <Link to="/admin/borrowed" className="small">
              Alle Ausleihen
            </Link>
          </div>
          {dueToday.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>
              Heute ist keine Rückgabe fällig.
            </p>
          ) : (
            <ul className="mini-list">
              {dueToday.map((loan) => {
                const overdue = new Date(loan.desiredUntil) < now;
                return (
                  <li key={loan.id}>
                    <div className="mini-row">
                      <strong>
                        {loan.device.name}{" "}
                        <span className="muted mono">{loan.device.serialNumber}</span>
                      </strong>
                      {overdue && <span className="badge st-rejected">überfällig</span>}
                    </div>
                    <div className="muted small">
                      {loan.user.name} · bis {formatDate(loan.desiredUntil)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <div className="section-title">
        <h2>Letzte Vorgänge</h2>
        <Link to="/admin/protokoll" className="small">
          Gesamtes Protokoll
        </Link>
      </div>
      {events.length === 0 ? (
        <div className="panel empty-state">Noch keine Einträge.</div>
      ) : (
        <AuditTimeline events={events} today={now} />
      )}
    </>
  );
}
