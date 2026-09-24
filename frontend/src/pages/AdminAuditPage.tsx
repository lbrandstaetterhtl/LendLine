import type { AuditEvent, AuditPage } from "../components/AuditTimeline";

import { useEffect, useState } from "react";

import { api } from "../api/client";
import { errorMessage, useApi } from "../api/useApi";
import { AuditTimeline } from "../components/AuditTimeline";
import { Alert, Field, PageHeader } from "../components/ui";

const categories = [
  { value: "", label: "Alle" },
  { value: "requests", label: "Ausleihen" },
  { value: "devices", label: "Geräte" },
  { value: "masterdata", label: "Stammdaten" },
  { value: "users", label: "Benutzer" },
  { value: "auth", label: "Anmeldungen" },
  { value: "system", label: "System" },
];

type Actor = { id: string; name: string };

export function AdminAuditPage() {
  const [today] = useState(() => new Date());
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [actorId, setActorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data: actors } = useApi<Actor[]>("/api/admin/audit/actors");

  // Search while typing, but only once the input has been still for a moment.
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const params = new URLSearchParams({ limit: "50" });
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  if (actorId) params.set("actorId", actorId);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const path = `/api/admin/audit?${params.toString()}`;
  const filtered = Boolean(q || category || actorId || from || to);

  function reset() {
    setSearch("");
    setQ("");
    setCategory("");
    setActorId("");
    setFrom("");
    setTo("");
  }

  return (
    <>
      <PageHeader
        title="Protokoll"
        description="Wer hat wann was geändert: Ausleihen, Geräte, Stammdaten, Benutzer, Anmeldungen und Systemeinstellungen, mit allen Einzelheiten."
      />

      <fieldset className="segmented">
        <legend className="sr-only">Bereich</legend>
        {categories.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={category === item.value}
            onClick={() => setCategory(item.value)}
          >
            {item.label}
          </button>
        ))}
      </fieldset>

      <div className="toolbar">
        <Field label="Suche" htmlFor="audit-search" className="grow">
          <input
            id="audit-search"
            data-shortcut="search"
            title="Tastenkürzel: /"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Gerät, Seriennummer, Person …"
          />
        </Field>
        <Field label="Person" htmlFor="audit-actor">
          <select
            id="audit-actor"
            value={actorId}
            onChange={(event) => setActorId(event.target.value)}
          >
            <option value="">Alle Personen</option>
            {actors?.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Von" htmlFor="audit-from">
          <input
            id="audit-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => setFrom(event.target.value)}
          />
        </Field>
        <Field label="Bis" htmlFor="audit-to">
          <input
            id="audit-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
          />
        </Field>
        {filtered && (
          <button type="button" className="ghost" onClick={reset}>
            Filter zurücksetzen
          </button>
        )}
      </div>

      {/* A new filter is a new result list; the key drops pages loaded for the old one. */}
      <AuditResults key={path} path={path} today={today} filtered={filtered} />
    </>
  );
}

function AuditResults({ path, today, filtered }: { path: string; today: Date; filtered: boolean }) {
  const { data, error, loading } = useApi<AuditPage>(path);
  const [more, setMore] = useState<{ items: AuditEvent[]; nextCursor: string | null } | null>(null);
  const [moreError, setMoreError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  const events = [...(data?.items ?? []), ...(more?.items ?? [])];
  const nextCursor = more ? more.nextCursor : (data?.nextCursor ?? null);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    setMoreError("");
    try {
      const page = await api<AuditPage>(`${path}&cursor=${encodeURIComponent(nextCursor)}`);
      setMore({ items: [...(more?.items ?? []), ...page.items], nextCursor: page.nextCursor });
    } catch (err) {
      setMoreError(errorMessage(err, "Weitere Einträge konnten nicht geladen werden"));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <Alert>{error || moreError}</Alert>
      {data && events.length === 0 && (
        <div className="panel empty-state">
          <strong>{filtered ? "Keine passenden Einträge" : "Noch keine Einträge"}</strong>
          {filtered
            ? "Passen Sie die Filter an."
            : "Vorgänge erscheinen hier, sobald jemand etwas ändert."}
        </div>
      )}
      {events.length > 0 && <AuditTimeline events={events} today={today} />}
      {loading && !data && <p className="muted">Laden…</p>}
      {nextCursor && (
        <div className="audit-more">
          <button
            type="button"
            className="secondary"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? "Laden…" : "Ältere Einträge laden"}
          </button>
        </div>
      )}
    </>
  );
}
