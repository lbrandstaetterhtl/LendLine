import type { BorrowRequest } from "../types";

import type { SubmitEvent } from "react";
import { useState } from "react";

import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/permissions";
import { useTerms } from "../branding/BrandingContext";
import { FieldAnswers } from "../components/FieldAnswers";
import { Alert, Field, Modal, PageHeader, refreshNav } from "../components/ui";
import { useFocusRow } from "../components/useFocusRow";
import { formatDate } from "../types";

export function AdminRequestsPage() {
  const focus = useFocusRow();
  const decides = can(useAuth().user, "requests.decide");
  const terms = useTerms();
  const {
    data: requests,
    error: loadError,
    reload,
  } = useApi<BorrowRequest[]>("/api/requests?status=OPEN");
  const [rejecting, setRejecting] = useState<BorrowRequest | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function approve(item: BorrowRequest) {
    if (
      !window.confirm(
        `Anfrage bestätigen?\n\n${item.device.name} (${item.device.serialNumber}) für ${item.user.name}`
      )
    )
      return;
    setError("");
    setInfo("");
    try {
      await api(`/api/requests/${item.id}/approve`, { method: "POST" });
      setInfo(`Anfrage von ${item.user.name} bestätigt.`);
      reload();
      refreshNav();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bestätigen fehlgeschlagen");
    }
  }

  async function reject(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rejecting) return;
    setError("");
    setInfo("");
    try {
      await api(`/api/requests/${rejecting.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ rejectionReason: reason.trim() }),
      });
      setInfo(`Anfrage von ${rejecting.user.name} abgelehnt.`);
      setRejecting(null);
      setReason("");
      reload();
      refreshNav();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ablehnen fehlgeschlagen");
    }
  }

  return (
    <>
      <PageHeader
        title="Offene Anfragen"
        description="Bestätigen reserviert die Anfrage. Ablehnungen brauchen einen Grund, der per E-Mail mitgeschickt wird."
      />
      <Alert>{error || loadError}</Alert>
      <Alert tone="ok">{info}</Alert>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{terms.device}</th>
              <th>Anfragende Person</th>
              <th>Zeitraum</th>
              <th>{terms.room}</th>
              <th>Kommentar</th>
              <th>
                <span className="sr-only">Aktionen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {requests?.map((item) => (
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
                  <div className="muted">bis {formatDate(item.desiredUntil)}</div>
                </td>
                <td>{item.room?.name || "–"}</td>
                <td className="muted">
                  {item.comment || (item.fields?.length ? "" : "–")}
                  <FieldAnswers fields={item.fields} />
                </td>
                <td className="actions-cell">
                  {decides && (
                    <div className="actions">
                      <button
                        type="button"
                        className="danger sm"
                        onClick={() => {
                          setRejecting(item);
                          setReason("");
                        }}
                      >
                        Ablehnen
                      </button>
                      <button type="button" className="sm" onClick={() => void approve(item)}>
                        Bestätigen
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {requests?.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  Keine offenen Anfragen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rejecting && (
        <Modal
          title="Anfrage ablehnen"
          description={`${rejecting.device.name} (${rejecting.device.serialNumber}) für ${rejecting.user.name}`}
          onClose={() => setRejecting(null)}
          size="sm"
          footer={
            <>
              <button type="button" className="secondary" onClick={() => setRejecting(null)}>
                Abbrechen
              </button>
              <button type="submit" form="reject-form" className="danger">
                Ablehnen
              </button>
            </>
          }
        >
          <form id="reject-form" onSubmit={(event) => void reject(event)}>
            <Field
              label="Grund"
              htmlFor="reject-reason"
              hint="Wird der anfragenden Person per E-Mail mitgeteilt."
            >
              <textarea
                id="reject-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                maxLength={1000}
                placeholder="z. B. Gerät im Zeitraum für Prüfung reserviert"
              />
            </Field>
          </form>
        </Modal>
      )}
    </>
  );
}
