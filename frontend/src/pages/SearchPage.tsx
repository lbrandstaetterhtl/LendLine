import type { BorrowRequest, Period } from "../types";

import type { SubmitEvent } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useApi } from "../api/useApi";
import { CategorySelect } from "../components/CategorySelect";
import { DeviceImages, PieceCalendarDialog } from "../components/DeviceImages";
import { Icon } from "../components/icons";
import { RequestBadge } from "../components/StatusBadge";
import { Alert, Field, PageHeader } from "../components/ui";
import { formatDate, toLocalInput } from "../types";

type Hit = {
  unitId: string;
  serialNumber: string;
  deviceId: string;
  name: string;
  category: string;
  description: string;
  images: { id: string; url: string }[];
};

type Preset = { label: string; period: Period };

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
      label: "Heute",
      period: { startsAt: toLocalInput(nextHour), desiredUntil: at(now, 0, 17) },
    });
  }
  if (weekday < 4 || weekday === 6) {
    list.push({
      label: "Morgen",
      period: { startsAt: at(now, 1, 8), desiredUntil: at(now, 1, 17) },
    });
  }
  if (weekday < 3) {
    list.push({
      label: "Rest der Woche",
      period: { startsAt: at(now, 1, 8), desiredUntil: at(now, 4 - weekday, 17) },
    });
  }
  const toMonday = 7 - weekday;
  list.push({
    label: "Nächste Woche",
    period: { startsAt: at(now, toMonday, 8), desiredUntil: at(now, toMonday + 4, 17) },
  });
  return list;
}

function searchPath(period: Period, categoryId: string, q: string): string {
  const params = new URLSearchParams({ ...period });
  if (categoryId) params.set("categoryId", categoryId);
  if (q.trim()) params.set("q", q.trim());
  return `/api/devices/search?${params.toString()}`;
}

export function SearchPage() {
  const [now] = useState(() => new Date());
  const [quickPeriods] = useState(() => presets(now));
  const [startsAt, setStartsAt] = useState(() => at(now, 1, 8));
  const [desiredUntil, setDesiredUntil] = useState(() => at(now, 1, 17));
  const [categoryId, setCategoryId] = useState("");
  const [q, setQ] = useState("");
  // The search that produced the current hits; it starts with the pre-filled period so the page
  // shows free units right away. Its period (not the possibly edited inputs) goes to the calendar.
  const [searched, setSearched] = useState(() => {
    const period = { startsAt: at(now, 1, 8), desiredUntil: at(now, 1, 17) };
    return { period, path: searchPath(period, "", "") };
  });
  const [picked, setPicked] = useState<Hit | null>(null);
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
      setError("Das Ende muss nach dem Start liegen.");
      return;
    }
    const path = searchPath(period, categoryId, q);
    // Same query again (e.g. "Suchen" pressed twice): fetch fresh availability anyway.
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

  function onRequested() {
    reloadMine();
    reloadHits();
  }

  return (
    <>
      <PageHeader
        title="Stück suchen"
        description="Zeitraum wählen, freies Stück finden und im Kalender anfragen."
      />
      <Alert>{error || searchError}</Alert>

      <div className="page-grid">
        <div>
          <form className="panel" onSubmit={search}>
            <fieldset className="chips">
              <legend className="sr-only">Schnellauswahl Zeitraum</legend>
              {quickPeriods.map((preset) => {
                const active =
                  preset.period.startsAt === startsAt &&
                  preset.period.desiredUntil === desiredUntil;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    className="chip"
                    aria-pressed={active}
                    disabled={busy}
                    onClick={() => applyPreset(preset.period)}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </fieldset>
            <div className="form-grid cols-2">
              <Field label="Start" htmlFor="from">
                <input
                  id="from"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  required
                />
              </Field>
              <Field label="Ende" htmlFor="until">
                <input
                  id="until"
                  type="datetime-local"
                  min={startsAt}
                  value={desiredUntil}
                  onChange={(e) => setDesiredUntil(e.target.value)}
                  required
                />
              </Field>
              <Field label="Kategorie" htmlFor="category" optional>
                <CategorySelect
                  id="category"
                  value={categoryId}
                  onChange={setCategoryId}
                  emptyLabel="Alle Kategorien"
                />
              </Field>
              <Field label="Gerätename" htmlFor="q" optional>
                <input
                  id="q"
                  data-shortcut="search"
                  title="Tastenkürzel: /"
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="z. B. ThinkPad"
                />
              </Field>
            </div>
            <div className="form-actions">
              <button type="submit" disabled={busy}>
                <Icon name="search" /> {busy ? "Suche…" : "Freie Stücke suchen"}
              </button>
            </div>
          </form>

          {hits && (
            <>
              <div className="section-title">
                <h2>Ergebnisse</h2>
                <span className="muted small">
                  {hits.length} freie{hits.length === 1 ? "s" : ""} Stück
                  {hits.length === 1 ? "" : "e"}
                </span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Gerät</th>
                      <th>Seriennummer</th>
                      <th>Kategorie</th>
                      <th>
                        <span className="sr-only">Aktionen</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {hits.length === 0 && (
                      <tr>
                        <td colSpan={4} className="empty">
                          Kein freies Stück in diesem Zeitraum. Versuchen Sie einen anderen Zeitraum
                          oder eine andere Kategorie.
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
                            onClick={() => setPicked(hit)}
                          >
                            <Icon name="calendar" /> Kalender & anfragen
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

        <aside className="aside-stack" aria-label="Meine Termine und Hilfe">
          <section className="card">
            <div className="card-title">
              <h2>Meine nächsten Termine</h2>
              <Link to="/my-requests" className="small">
                Alle
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>
                Keine anstehenden Ausleihen.
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
                    {item.room && <div className="muted small">Raum {item.room.name}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-title">
              <h2>So funktioniert’s</h2>
            </div>
            <ol className="steps">
              <li>Zeitraum wählen oder eine Schnellauswahl nutzen.</li>
              <li>Beim passenden Stück den Kalender öffnen und Raum angeben.</li>
              <li>Die Verwaltung bestätigt, Sie erhalten eine E-Mail.</li>
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
          onRequested={onRequested}
          onClose={() => setPicked(null)}
        />
      )}
    </>
  );
}
