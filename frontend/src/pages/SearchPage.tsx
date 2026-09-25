import type { BorrowRequest, DeviceField, Period } from "../types";

import type { SubmitEvent } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useApi } from "../api/useApi";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/permissions";
import { useTerms } from "../branding/BrandingContext";
import { CategorySelect } from "../components/CategorySelect";
import {
  DeviceFieldList,
  FieldFilter,
  type FieldFilterValue,
  useFieldOptions,
} from "../components/DeviceFields";
import { DeviceImages, PieceCalendarDialog } from "../components/DeviceImages";
import { Icon } from "../components/icons";
import { RequestSent } from "../components/RequestSent";
import { RequestBadge } from "../components/StatusBadge";
import { Alert, Field, PageHeader } from "../components/ui";
import { format, formatDate, useI18n } from "../i18n";
import { toLocalInput } from "../types";

type Hit = {
  unitId: string;
  serialNumber: string;
  deviceId: string;
  name: string;
  category: string;
  description: string;
  fields: DeviceField[];
  images: { id: string; url: string }[];
};

type Preset = { id: "today" | "tomorrow" | "restOfWeek" | "nextWeek"; period: Period };

function at(base: Date, dayOffset: number, hour: number): string {
  const date = new Date(base);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, 0, 0, 0);
  return toLocalInput(date);
}

/**
 * Common periods relative to `now`, working hours 08:00–17:00, Monday–Friday.
 */
function presets(now: Date): Preset[] {
  const weekday = (now.getDay() + 6) % 7; // Monday = 0
  const list: Preset[] = [];
  if (weekday < 5 && now.getHours() < 16) {
    const nextHour = new Date(now);
    nextHour.setHours(now.getHours() + 1, 0, 0, 0);
    list.push({
      id: "today",
      period: { startsAt: toLocalInput(nextHour), desiredUntil: at(now, 0, 17) },
    });
  }
  if (weekday < 4 || weekday === 6) {
    list.push({
      id: "tomorrow",
      period: { startsAt: at(now, 1, 8), desiredUntil: at(now, 1, 17) },
    });
  }
  if (weekday < 3) {
    list.push({
      id: "restOfWeek",
      period: { startsAt: at(now, 1, 8), desiredUntil: at(now, 4 - weekday, 17) },
    });
  }
  const toMonday = 7 - weekday;
  list.push({
    id: "nextWeek",
    period: { startsAt: at(now, toMonday, 8), desiredUntil: at(now, toMonday + 4, 17) },
  });
  return list;
}

function searchPath(
  period: Period,
  categoryId: string,
  q: string,
  filter: FieldFilterValue = { field: "", value: "" }
): string {
  const params = new URLSearchParams({ ...period });
  if (categoryId) params.set("categoryId", categoryId);
  if (q.trim()) params.set("q", q.trim());
  if (filter.field && filter.value) {
    params.set("field", filter.field);
    params.set("value", filter.value);
  }
  return `/api/devices/search?${params.toString()}`;
}

export function SearchPage() {
  const terms = useTerms();
  const { m } = useI18n();
  const t = m.search;
  const canRequest = can(useAuth().user, "requests.create");
  const [now] = useState(() => new Date());
  const [quickPeriods] = useState(() => presets(now));
  const [startsAt, setStartsAt] = useState(() => at(now, 1, 8));
  const [desiredUntil, setDesiredUntil] = useState(() => at(now, 1, 17));
  const [categoryId, setCategoryId] = useState("");
  const [q, setQ] = useState("");
  const [fieldFilter, setFieldFilter] = useState<FieldFilterValue>({ field: "", value: "" });
  const fieldOptions = useFieldOptions();
  // The search that produced the current hits; it starts with the pre-filled period so the page
  // shows free units right away. Its period (not the possibly edited inputs) goes to the calendar.
  const [searched, setSearched] = useState(() => {
    const period = { startsAt: at(now, 1, 8), desiredUntil: at(now, 1, 17) };
    return { period, path: searchPath(period, "", "") };
  });
  const [picked, setPicked] = useState<Hit | null>(null);
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const {
    data: hits,
    error: searchError,
    loading: busy,
    reload: reloadHits,
  } = useApi<Hit[]>(searched.path);
  const { data: mine, reload: reloadMine } = useApi<BorrowRequest[]>("/api/requests/mine");

  const upcoming = (mine ?? [])
    .filter((item) => item.status === "OPEN" || item.status === "APPROVED")
    .filter((item) => new Date(item.desiredUntil) > now)
    .toSorted((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 4);

  function runSearch(period: Period) {
    setError("");
    if (period.desiredUntil <= period.startsAt) {
      setError(t.endAfterStart);
      return;
    }
    const path = searchPath(period, categoryId, q, fieldFilter);
    // Same query again (e.g. search pressed twice): fetch fresh availability anyway.
    if (path === searched.path) reloadHits();
    else setSearched({ period, path });
  }

  function search(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    runSearch({ startsAt, desiredUntil });
  }

  function applyPreset(period: Period) {
    setStartsAt(period.startsAt);
    setDesiredUntil(period.desiredUntil);
    runSearch(period);
  }

  function onRequested(message: string) {
    setPicked(null);
    setSent(message);
    reloadMine();
    reloadHits();
  }

  return (
    <>
      <PageHeader
        title={format(m.nav.searchUnits, { unit: terms.unit })}
        description={format(t.description, { units: terms.units })}
      />
      <Alert>{error || searchError}</Alert>
      <RequestSent message={sent} />

      <div className="page-grid">
        <div>
          <form className="panel" onSubmit={search}>
            <fieldset className="chips">
              <legend className="sr-only">{t.presetsLegend}</legend>
              {quickPeriods.map((preset) => {
                const active =
                  preset.period.startsAt === startsAt &&
                  preset.period.desiredUntil === desiredUntil;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className="chip"
                    aria-pressed={active}
                    disabled={busy}
                    onClick={() => applyPreset(preset.period)}
                  >
                    {t.presets[preset.id]}
                  </button>
                );
              })}
            </fieldset>
            <div className="form-grid cols-2">
              <Field label={t.start} htmlFor="from">
                <input
                  id="from"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  required
                />
              </Field>
              <Field label={t.end} htmlFor="until">
                <input
                  id="until"
                  type="datetime-local"
                  min={startsAt}
                  value={desiredUntil}
                  onChange={(e) => setDesiredUntil(e.target.value)}
                  required
                />
              </Field>
              <Field label={t.category} htmlFor="category" optional>
                <CategorySelect
                  id="category"
                  value={categoryId}
                  onChange={setCategoryId}
                  emptyLabel={t.allCategories}
                />
              </Field>
              <Field label={t.name} htmlFor="q" optional>
                <input
                  id="q"
                  data-shortcut="search"
                  title={m.catalog.searchShortcut}
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t.namePlaceholder}
                />
              </Field>
              <FieldFilter options={fieldOptions} filter={fieldFilter} onChange={setFieldFilter} />
            </div>
            <div className="form-actions">
              <button type="submit" disabled={busy}>
                <Icon name="search" />{" "}
                {busy ? t.submitting : format(t.submit, { units: terms.units })}
              </button>
            </div>
          </form>

          {hits && (
            <>
              <div className="section-title">
                <h2>{t.results}</h2>
                <span className="muted small">
                  {format(t.free, { count: hits.length, unit: terms.unit, units: terms.units })}
                </span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{terms.device}</th>
                      <th>{t.serial}</th>
                      <th>{t.category}</th>
                      <th>
                        <span className="sr-only">{m.table.actions}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {hits.length === 0 && (
                      <tr>
                        <td colSpan={4} className="empty">
                          {t.nothing}
                        </td>
                      </tr>
                    )}
                    {hits.map((hit) => (
                      <tr key={hit.unitId}>
                        <td>
                          <div className="actions" style={{ flexWrap: "nowrap", gap: 12 }}>
                            {hit.images.length > 0 ? (
                              <DeviceImages images={hit.images.slice(0, 1)} alt={hit.name} />
                            ) : (
                              <span className="thumb-img thumb-empty" aria-hidden="true">
                                <Icon name="box" />
                              </span>
                            )}
                            <div>
                              <strong style={{ fontWeight: 550 }}>{hit.name}</strong>
                              {hit.description && (
                                <div className="muted small">{hit.description}</div>
                              )}
                              <DeviceFieldList fields={hit.fields} />
                            </div>
                          </div>
                        </td>
                        <td className="mono">{hit.serialNumber}</td>
                        <td>
                          <span className="tag">{hit.category}</span>
                        </td>
                        <td className="actions-cell">
                          <button
                            type="button"
                            className="secondary sm"
                            onClick={() => {
                              setSent("");
                              setPicked(hit);
                            }}
                          >
                            {canRequest ? (
                              <>
                                <Icon name="plus" /> {t.request}
                              </>
                            ) : (
                              <>
                                <Icon name="calendar" /> {t.calendar}
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <aside className="aside-stack" aria-label={t.asideLabel}>
          <section className="card">
            <div className="card-title">
              <h2>{t.upcoming}</h2>
              <Link to="/my-requests" className="small">
                {t.all}
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>
                {t.noUpcoming}
              </p>
            ) : (
              <ul className="mini-list">
                {upcoming.map((item) => (
                  <li key={item.id}>
                    <div className="mini-row">
                      <strong>{item.device.name}</strong>
                      <RequestBadge status={item.status} />
                    </div>
                    <div className="muted small">
                      {formatDate(item.startsAt)} – {formatDate(item.desiredUntil)}
                    </div>
                    {item.room && (
                      <div className="muted small">
                        {terms.room} {item.room.name}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-title">
              <h2>{t.howTitle}</h2>
            </div>
            <ol className="steps">
              {t.how.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      {picked && (
        <PieceCalendarDialog
          key={picked.unitId}
          deviceId={picked.deviceId}
          deviceName={picked.name}
          unit={{
            id: picked.unitId,
            serialNumber: picked.serialNumber,
            status: "AVAILABLE",
            bookings: [],
          }}
          period={searched.period}
          // The period comes from the search: straight to the form, the calendar is one click away.
          startWithRequest={canRequest}
          onRequested={onRequested}
          onClose={() => setPicked(null)}
        />
      )}
    </>
  );
}
