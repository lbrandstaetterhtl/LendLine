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
import { format, formatDate, useI18n } from "../i18n";

export function AdminRequestsPage() {
  const focus = useFocusRow();
  const decides = can(useAuth().user, "requests.decide");
  const terms = useTerms();
  const { m } = useI18n();
  const t = m.requests;
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
        format(t.confirmApprove, {
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
      await api(`/api/requests/${item.id}/approve`, { method: "POST" });
      setInfo(format(t.approved, { name: item.user.name }));
      reload();
      refreshNav();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.approveFailed);
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
      setInfo(format(t.rejected, { name: rejecting.user.name }));
      setRejecting(null);
      setReason("");
      reload();
      refreshNav();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.rejectFailed);
    }
  }

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
              <th>{m.table.requester}</th>
              <th>{m.table.period}</th>
              <th>{terms.room}</th>
              <th>{m.table.comment}</th>
              <th>
                <span className="sr-only">{m.table.actions}</span>
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
                  <div className="muted">
                    {format(m.common.until, { date: formatDate(item.desiredUntil) })}
                  </div>
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
                        {t.reject}
                      </button>
                      <button type="button" className="sm" onClick={() => void approve(item)}>
                        {t.approve}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
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

      {rejecting && (
        <Modal
          title={t.rejectTitle}
          description={format(t.forPerson, {
            device: rejecting.device.name,
            serial: rejecting.device.serialNumber,
            name: rejecting.user.name,
          })}
          onClose={() => setRejecting(null)}
          size="sm"
          footer={
            <>
              <button type="button" className="secondary" onClick={() => setRejecting(null)}>
                {m.common.cancel}
              </button>
              <button type="submit" form="reject-form" className="danger">
                {t.reject}
              </button>
            </>
          }
        >
          <form id="reject-form" onSubmit={(event) => void reject(event)}>
            <Field label={t.reason} htmlFor="reject-reason" hint={t.reasonHint}>
              <textarea
                id="reject-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                maxLength={1000}
                placeholder={t.reasonPlaceholder}
              />
            </Field>
          </form>
        </Modal>
      )}
    </>
  );
}
