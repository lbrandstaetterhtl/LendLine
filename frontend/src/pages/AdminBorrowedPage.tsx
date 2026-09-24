import type { BorrowRequest } from "../types";

import { useState } from "react";

import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { Alert, PageHeader, refreshNav } from "../components/ui";
import { formatDate } from "../types";

export function AdminBorrowedPage() {
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
        `Rückgabe erfassen?\n\n${item.device.name} (${item.device.serialNumber}) von ${item.user.name}\nDas Stück ist danach wieder verfügbar.`
      )
    )
      return;
    setError("");
    setInfo("");
    try {
      await api(`/api/requests/${item.id}/return`, { method: "POST" });
      setInfo(`Rückgabe von ${item.device.name} (${item.device.serialNumber}) erfasst.`);
      reload();
      refreshNav();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rückgabe fehlgeschlagen");
    }
  }

  // Reference time for "overdue", fixed per page visit so rendering stays pure.
  const [now] = useState(() => Date.now());

  return (
    <>
      <PageHeader
        title="Ausleihen"
        description="Alle bestätigten Ausleihen, die noch nicht zurückgegeben wurden."
      />
      <Alert>{error || loadError}</Alert>
      <Alert tone="ok">{info}</Alert>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Gerät</th>
              <th>Person</th>
              <th>Zeitraum</th>
              <th>Raum</th>
              <th>Bestätigt</th>
              <th>
                <span className="sr-only">Aktionen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {requests?.map((item) => {
              const overdue = new Date(item.desiredUntil).getTime() < now;
              return (
                <tr key={item.id}>
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
                      bis {formatDate(item.desiredUntil)}{" "}
                      {overdue && <span className="badge st-rejected">überfällig</span>}
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
                      Rückgabe erfassen
                    </button>
                  </td>
                </tr>
              );
            })}
            {requests?.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  Keine laufenden Ausleihen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
