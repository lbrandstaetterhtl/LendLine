import type { AuditPage } from "../components/AuditTimeline";
import type { BorrowRequest } from "../types";

import { useState } from "react";
import { Link } from "react-router-dom";

import { useApi } from "../api/useApi";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/permissions";
import { useTerms } from "../branding/BrandingContext";
import { AuditTimeline } from "../components/AuditTimeline";
import { Alert, PageHeader } from "../components/ui";
import { format, formatDate, useI18n } from "../i18n";
import { useFeature } from "../ui/UiContext";

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
  const { user } = useAuth();
  const { m } = useI18n();
  const t = m.home;
  const terms = useTerms();
  const seesRequests = can(user, "requests.view");
  const seesLoans = can(user, "loans.manage");
  const auditShown = useFeature("audit");
  const seesAudit = can(user, "audit.view") && auditShown;
  const { data: audit } = useApi<AuditPage>(seesAudit ? "/api/admin/audit?limit=8" : null);
  const { data: open } = useApi<BorrowRequest[]>(seesRequests ? "/api/requests?status=OPEN" : null);
  const { data: loans } = useApi<BorrowRequest[]>(
    seesLoans ? "/api/requests?status=APPROVED" : null
  );
  const events = audit?.items ?? [];
  // The API lists open requests oldest first, which is the order they should be decided in.
  const waiting = (open ?? []).slice(0, 5);
  const dueToday = (loans ?? [])
    .filter((loan) => new Date(loan.desiredUntil).getTime() <= endOfToday(now))
    .toSorted((a, b) => a.desiredUntil.localeCompare(b.desiredUntil))
    .slice(0, 5);

  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <Alert>{error}</Alert>
      {summary && (
        <div className="stats">
          <Link className="stat" to="/admin/requests">
            <div className="label">{t.openRequests}</div>
            <div className="value">{summary.openRequests}</div>
            <div className="sub">{t.openRequestsSub}</div>
          </Link>
          <Link className="stat" to="/admin/borrowed">
            <div className="label">{t.activeLoans}</div>
            <div className="value">{summary.activeLoans}</div>
            <div className="sub">{t.activeLoansSub}</div>
          </Link>
          <Link className="stat" to="/admin/devices">
            <div className="label">{format(t.unitsAvailable, { units: terms.units })}</div>
            <div className="value">{summary.devicesAvailable}</div>
            <div className="sub">
              {format(t.unitsSub, {
                borrowed: summary.devicesBorrowed,
                defective: summary.devicesDefective,
              })}
            </div>
          </Link>
          <Link className="stat" to="/admin/users">
            <div className="label">{t.users}</div>
            <div className="value">{summary.users}</div>
            <div className="sub">
              {format(t.usersSub, {
                devices: summary.devices,
                devicesTerm: terms.devices,
                categories: summary.categories,
              })}
            </div>
          </Link>
        </div>
      )}

      <div className="dash-grid">
        {seesRequests && (
          <section className="card">
            <div className="card-title">
              <h2>{t.waiting}</h2>
              <Link to="/admin/requests" className="small">
                {t.reviewAll}
              </Link>
            </div>
            {waiting.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>
                {t.noOpen}
              </p>
            ) : (
              <ul className="mini-list">
                {waiting.map((item) => (
                  <li key={item.id}>
                    <div className="mini-row">
                      <Link to={`/admin/requests?focus=${item.id}`}>
                        <strong>{item.device.name}</strong>
                      </Link>
                      <span className="muted small">{item.user.name}</span>
                    </div>
                    <div className="muted small">
                      {formatDate(item.startsAt)} – {formatDate(item.desiredUntil)}
                      {item.room ? ` · ${terms.room} ${item.room.name}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {seesLoans && (
          <section className="card">
            <div className="card-title">
              <h2>{t.due}</h2>
              <Link to="/admin/borrowed" className="small">
                {t.allLoans}
              </Link>
            </div>
            {dueToday.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>
                {t.noneDue}
              </p>
            ) : (
              <ul className="mini-list">
                {dueToday.map((loan) => {
                  const overdue = new Date(loan.desiredUntil) < now;
                  return (
                    <li key={loan.id}>
                      <div className="mini-row">
                        <Link to={`/admin/borrowed?focus=${loan.id}`}>
                          <strong>
                            {loan.device.name}{" "}
                            <span className="muted mono">{loan.device.serialNumber}</span>
                          </strong>
                        </Link>
                        {overdue && <span className="badge st-rejected">{t.overdue}</span>}
                      </div>
                      <div className="muted small">
                        {loan.user.name} ·{" "}
                        {format(m.common.until, { date: formatDate(loan.desiredUntil) })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>

      {seesAudit && (
        <>
          <div className="section-title">
            <h2>{t.recent}</h2>
            <Link to="/admin/protokoll" className="small">
              {t.fullAudit}
            </Link>
          </div>
          {events.length === 0 ? (
            <div className="panel empty-state">{t.noEntries}</div>
          ) : (
            <AuditTimeline events={events} today={now} />
          )}
        </>
      )}
    </>
  );
}
