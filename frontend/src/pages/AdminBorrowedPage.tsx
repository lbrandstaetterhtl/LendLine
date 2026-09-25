import type { BorrowRequest } from "../types";

import { useState } from "react";

import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { useTerms } from "../branding/BrandingContext";
import { Alert, PageHeader, refreshNav } from "../components/ui";
import { useFocusRow } from "../components/useFocusRow";
import { format, formatDate, useI18n } from "../i18n";

export function AdminBorrowedPage() {
  const focus = useFocusRow();
  const terms = useTerms();
  const { m } = useI18n();
  const t = m.loans;
  const {
    data: requests,
    error: loadError,
    reload,
  } = useApi<BorrowRequest[]>("/api/requests?status=APPROVED");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function markReturned(item: BorrowRequest) {
    if (
      !window.confirm(
        format(t.confirmReturn, {
          device: item.device.name,
          serial: item.device.serialNumber,
          name: item.user.name,
        })
      )
    )
      return;
    setError("");
    setInfo("");
    try {
      await api(`/api/requests/${item.id}/return`, { method: "POST" });
      setInfo(format(t.returned, { device: item.device.name, serial: item.device.serialNumber }));
      reload();
      refreshNav();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.returnFailed);
    }
  }

  // Reference time for "overdue", fixed per page visit so rendering stays pure.
  const [now] = useState(() => Date.now());

  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <Alert>{error || loadError}</Alert>
      <Alert tone="ok">{info}</Alert>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{terms.device}</th>
              <th>{m.table.person}</th>
              <th>{m.table.period}</th>
              <th>{terms.room}</th>
              <th>{m.table.approved}</th>
              <th>
                <span className="sr-only">{m.table.actions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {requests?.map((item) => {
              const overdue = new Date(item.desiredUntil).getTime() < now;
              return (
                <tr
                  key={item.id}
                  id={`row-${item.id}`}
                  className={focus === item.id ? "row-focus" : undefined}
                >
                  <td>
                    <div style={{ fontWeight: 550 }}>{item.device.name}</div>
                    <div className="muted mono">{item.device.serialNumber}</div>
                  </td>
                  <td>
                    {item.user.name}
                    <div className="muted small">{item.user.email}</div>
                  </td>
                  <td className="nowrap">
                    {formatDate(item.startsAt)}
                    <div className={overdue ? "" : "muted"}>
                      {format(m.common.until, { date: formatDate(item.desiredUntil) })}{" "}
                      {overdue && <span className="badge st-rejected">{t.overdue}</span>}
                    </div>
                  </td>
                  <td>{item.room?.name || "–"}</td>
                  <td className="muted nowrap">{formatDate(item.approvedAt)}</td>
                  <td className="actions-cell">
                    <button
                      type="button"
                      className="secondary sm"
                      onClick={() => void markReturned(item)}
                    >
                      {t.markReturned}
                    </button>
                  </td>
                </tr>
              );
            })}
            {requests?.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  {t.none}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
