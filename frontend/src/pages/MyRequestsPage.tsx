import type { BorrowRequest, RequestStatus } from "../types";

import { useState } from "react";
import { Link } from "react-router-dom";

import { useApi } from "../api/useApi";
import { Icon } from "../components/icons";
import { RequestBadge } from "../components/StatusBadge";
import { Alert, PageHeader } from "../components/ui";
import { formatDate } from "../types";

type Filter = "ALL" | "OPEN" | "APPROVED" | "DONE";

const filters: { value: Filter; label: string; matches: (status: RequestStatus) => boolean }[] = [
  { value: "ALL", label: "Alle", matches: () => true },
  { value: "OPEN", label: "Offen", matches: (status) => status === "OPEN" },
  { value: "APPROVED", label: "Bestätigt", matches: (status) => status === "APPROVED" },
  {
    value: "DONE",
    label: "Abgeschlossen",
    matches: (status) => status === "REJECTED" || status === "RETURNED",
  },
];

export function MyRequestsPage() {
  const { data: all, error } = useApi<BorrowRequest[]>("/api/requests/mine");
  const [filter, setFilter] = useState<Filter>("ALL");
  const matches = filters.find((item) => item.value === filter)?.matches ?? (() => true);
  const requests = all?.filter((item) => matches(item.status));

  return (
    <>
      <PageHeader
        title="Meine Anfragen"
        description="Offen: Die Verwaltung hat noch nicht entschieden. Bestätigt: Das Stück ist für Sie reserviert."
        actions={
          <Link className="btn" to="/search">
            <Icon name="plus" /> Neue Anfrage
          </Link>
        }
      />
      <Alert>{error}</Alert>
      <fieldset className="segmented">
        <legend className="sr-only">Nach Status filtern</legend>
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
            <span className="count">
              {all?.filter((request) => item.matches(request.status)).length ?? 0}
            </span>
          </button>
        ))}
      </fieldset>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Gerät</th>
              <th>Status</th>
              <th>Zeitraum</th>
              <th>Raum</th>
              <th>Angefragt</th>
              <th>Hinweis</th>
            </tr>
          </thead>
          <tbody>
            {requests?.map((item) => (
              <tr key={item.id}>
                <td>
                  <div style={{ fontWeight: 550 }}>{item.device.name}</div>
                  <div className="muted mono">{item.device.serialNumber}</div>
                </td>
                <td>
                  <RequestBadge status={item.status} />
                </td>
                <td className="nowrap">
                  {formatDate(item.startsAt)}
                  <div className="muted">bis {formatDate(item.desiredUntil)}</div>
                </td>
                <td>{item.room?.name || "–"}</td>
                <td className="muted nowrap">{formatDate(item.requestedAt)}</td>
                <td className="muted">
                  {item.rejectionReason ||
                    (item.returnedAt
                      ? `Zurückgegeben ${formatDate(item.returnedAt)}`
                      : item.comment || "–")}
                </td>
              </tr>
            ))}
            {requests?.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  {all?.length === 0 ? (
                    <>
                      Noch keine Anfragen. <Link to="/search">Jetzt ein Stück suchen</Link>
                    </>
                  ) : (
                    "Keine Anfragen mit diesem Status."
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
