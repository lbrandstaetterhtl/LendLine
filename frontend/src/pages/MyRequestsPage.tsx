import type { Messages } from "../i18n/de";
import type { BorrowRequest, RequestStatus } from "../types";

import { useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import { errorMessage, useApi } from "../api/useApi";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/permissions";
import { useTerms } from "../branding/BrandingContext";
import { FieldAnswers } from "../components/FieldAnswers";
import { Icon } from "../components/icons";
import { RequestBadge } from "../components/StatusBadge";
import { Alert, PageHeader } from "../components/ui";
import { format, formatDate, useI18n } from "../i18n";

type Filter = "ALL" | "OPEN" | "APPROVED" | "DONE";

const filters: {
  value: Filter;
  label: (m: Messages) => string;
  matches: (status: RequestStatus) => boolean;
}[] = [
  { value: "ALL", label: (m) => m.myRequests.filterAll, matches: () => true },
  { value: "OPEN", label: (m) => m.myRequests.filterOpen, matches: (status) => status === "OPEN" },
  {
    value: "APPROVED",
    label: (m) => m.myRequests.filterApproved,
    matches: (status) => status === "APPROVED",
  },
  {
    value: "DONE",
    label: (m) => m.myRequests.filterDone,
    matches: (status) => status === "REJECTED" || status === "RETURNED" || status === "CANCELLED",
  },
];

export function MyRequestsPage() {
  const { data: all, error, reload } = useApi<BorrowRequest[]>("/api/requests/mine");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const terms = useTerms();
  const { m } = useI18n();
  const t = m.myRequests;
  const canRequest = can(useAuth().user, "requests.create");

  async function cancel(item: BorrowRequest) {
    if (!window.confirm(format(t.confirmCancel, { device: item.device.name }))) return;
    setBusy(item.id);
    setActionError("");
    try {
      await api(`/api/requests/${item.id}/cancel`, { method: "POST" });
      reload();
    } catch (err) {
      setActionError(errorMessage(err, t.cancelFailed));
    } finally {
      setBusy(null);
    }
  }
  const matches = filters.find((item) => item.value === filter)?.matches ?? (() => true);
  const requests = all?.filter((item) => matches(item.status));

  return (
    <>
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          canRequest && (
            <Link className="btn" to="/search">
              <Icon name="plus" /> {t.newRequest}
            </Link>
          )
        }
      />
      <Alert>{error || actionError}</Alert>
      <fieldset className="segmented">
        <legend className="sr-only">{t.filterLegend}</legend>
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
          >
            {item.label(m)}
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
              <th>{terms.device}</th>
              <th>{m.table.status}</th>
              <th>{m.table.period}</th>
              <th>{terms.room}</th>
              <th>{m.table.requested}</th>
              <th>{m.table.note}</th>
              <th>
                <span className="sr-only">{m.table.actions}</span>
              </th>
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
                  <div className="muted">
                    {format(m.common.until, { date: formatDate(item.desiredUntil) })}
                  </div>
                </td>
                <td>{item.room && item.room.id !== "room-unassigned" ? item.room.name : "–"}</td>
                <td className="muted nowrap">{formatDate(item.requestedAt)}</td>
                <td className="muted">
                  {item.rejectionReason ||
                    (item.returnedAt
                      ? format(t.returnedAt, { date: formatDate(item.returnedAt) })
                      : item.comment || (item.fields?.length ? "" : "–"))}
                  <FieldAnswers fields={item.fields} />
                </td>
                <td className="nowrap">
                  {item.status === "OPEN" && (
                    <button
                      type="button"
                      className="ghost sm"
                      disabled={busy !== null}
                      onClick={() => void cancel(item)}
                    >
                      {busy === item.id ? "…" : t.cancel}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {requests?.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  {all?.length === 0 ? (
                    <>
                      {t.none} <Link to="/search">{t.searchNow}</Link>
                    </>
                  ) : (
                    t.noneWithStatus
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
