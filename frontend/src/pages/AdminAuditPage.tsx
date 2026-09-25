import type { AuditEvent, AuditPage } from "../components/AuditTimeline";

import { useEffect, useState } from "react";

import { api } from "../api/client";
import { errorMessage, useApi } from "../api/useApi";
import { AuditTimeline } from "../components/AuditTimeline";
import { Alert, Field, PageHeader } from "../components/ui";
import { useI18n } from "../i18n";

const categories = ["", "requests", "devices", "masterdata", "users", "auth", "system"] as const;

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
  const { m, locale } = useI18n();
  const t = m.audit;

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
      <PageHeader title={t.title} description={t.description} />

      <fieldset className="segmented">
        <legend className="sr-only">{t.area}</legend>
        {categories.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={category === value}
            onClick={() => setCategory(value)}
          >
            {t.categories[value || "all"]}
          </button>
        ))}
      </fieldset>

      <div className="toolbar">
        <Field
          label={t.search}
          htmlFor="audit-search"
          className="grow"
          hint={locale === "de" ? undefined : t.searchGermanHint}
        >
          <input
            id="audit-search"
            data-shortcut="search"
            title={m.catalog.searchShortcut}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t.searchPlaceholder}
          />
        </Field>
        <Field label={t.person} htmlFor="audit-actor">
          <select
            id="audit-actor"
            value={actorId}
            onChange={(event) => setActorId(event.target.value)}
          >
            <option value="">{t.allPeople}</option>
            {actors?.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.from} htmlFor="audit-from">
          <input
            id="audit-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => setFrom(event.target.value)}
          />
        </Field>
        <Field label={t.to} htmlFor="audit-to">
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
            {t.resetFilters}
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
  const { m } = useI18n();
  const t = m.audit;

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
      setMoreError(errorMessage(err, t.moreFailed));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <Alert>{error || moreError}</Alert>
      {data && events.length === 0 && (
        <div className="panel empty-state">
          <strong>{filtered ? t.noMatches : t.noEntries}</strong>
          {filtered ? t.adjustFilters : t.appearHere}
        </div>
      )}
      {events.length > 0 && <AuditTimeline events={events} today={today} />}
      {loading && !data && <p className="muted">{m.common.loading}</p>}
      {nextCursor && (
        <div className="audit-more">
          <button
            type="button"
            className="secondary"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? m.common.loading : t.loadOlder}
          </button>
        </div>
      )}
    </>
  );
}
