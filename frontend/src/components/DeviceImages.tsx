import type { BorrowRequest, DeviceStatus, FormField, Period, RequestForm } from "../types";

import type { KeyboardEvent } from "react";
import { useMemo, useRef, useState } from "react";

import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { useTerms } from "../branding/BrandingContext";
import { requestStatusLabel, toLocalInput } from "../types";
import { Icon } from "./icons";
import { DeviceBadge } from "./StatusBadge";
import { Alert, Field, Modal } from "./ui";

type ImageRef = { id: string; url: string };
type Room = { id: string; name: string; building: string };

export function DeviceImages({
  images,
  alt,
  onOpen,
}: {
  images: ImageRef[];
  alt: string;
  onOpen?: (index: number) => void;
}) {
  if (images.length === 0) return <span className="muted">–</span>;
  return (
    <div className="thumbs">
      {images.slice(0, 3).map((image, index) =>
        onOpen ? (
          <button
            key={image.id}
            type="button"
            className="ghost"
            style={{ height: "auto", padding: 0 }}
            onClick={() => onOpen(index)}
            aria-label={`Bild ${index + 1} von ${alt} öffnen`}
          >
            <img className="thumb-img" src={image.url} alt="" />
          </button>
        ) : (
          <img key={image.id} className="thumb-img" src={image.url} alt={alt} />
        )
      )}
      {images.length > 3 && <span className="tag">+{images.length - 3}</span>}
    </div>
  );
}

type Booking = { id: string; startsAt: string; endsAt: string; state: string; borrower?: string };
type CalendarUnit = { id: string; serialNumber: string; status: DeviceStatus; bookings: Booking[] };

type OwnPeriod = Period & {
  key: string;
  /**
   * Short text for the chip, e.g. "28.09. 11:00 – 12.10. 21:00".
   */
  label: string;
  /**
   * Devices and status, e.g. "ThinkPad T14 (offen)".
   */
  detail: string;
  roomId: string | null;
};

/**
 * The periods of the user's open and approved requests that have not ended yet, one entry per
 * period (several devices booked for the same time share it), soonest first.
 */
function ownPeriods(requests: BorrowRequest[] | null): OwnPeriod[] {
  const now = Date.now();
  const byPeriod = new Map<string, OwnPeriod & { devices: string[]; statuses: Set<string> }>();
  for (const request of requests ?? []) {
    if (request.status !== "OPEN" && request.status !== "APPROVED") continue;
    if (new Date(request.desiredUntil).getTime() <= now) continue;
    const startsAt = toLocalInput(new Date(request.startsAt));
    const desiredUntil = toLocalInput(new Date(request.desiredUntil));
    const key = `${startsAt}|${desiredUntil}`;
    const entry = byPeriod.get(key) ?? {
      key,
      startsAt,
      desiredUntil,
      label: "",
      detail: "",
      roomId: request.room?.id ?? null,
      devices: [],
      statuses: new Set<string>(),
    };
    entry.devices.push(request.device.name);
    entry.statuses.add(requestStatusLabel[request.status].toLowerCase());
    byPeriod.set(key, entry);
  }
  return [...byPeriod.values()]
    .toSorted((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map(({ devices, statuses, ...entry }) => ({
      ...entry,
      label: `${shortDateTime(entry.startsAt)} – ${shortDateTime(entry.desiredUntil)}`,
      detail: `${devices.join(", ")} (${[...statuses].join(", ")})`,
    }));
}

function shortDateTime(value: string) {
  return new Date(value).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function monthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function dayKind(day: Date, unit: CalendarUnit): "defective" | "borrowed" | "open" | "free" {
  if (unit.status === "DEFECTIVE") return "defective";
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);
  const hits = unit.bookings.filter(
    (booking) => new Date(booking.startsAt) <= end && new Date(booking.endsAt) > start
  );
  if (hits.some((booking) => booking.state === "APPROVED")) return "borrowed";
  if (hits.some((booking) => booking.state === "OPEN")) return "open";
  return hits.length > 0 ? "borrowed" : "free";
}

const dateTime = (value: string) =>
  new Date(value).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const stateLabel: Record<string, string> = {
  RETURNED: "Zurückgegeben",
  OPEN: "Angefragt",
  APPROVED: "Bestätigt",
};

/**
 * True when the unit already has an open or approved booking overlapping the period, the same rule
 * the server applies when the request is sent.
 */
function unitBusy(unit: CalendarUnit, period: Period) {
  const start = new Date(period.startsAt).getTime();
  const end = new Date(period.desiredUntil).getTime();
  return unit.bookings.some(
    (booking) =>
      (booking.state === "OPEN" || booking.state === "APPROVED") &&
      new Date(booking.startsAt).getTime() < end &&
      new Date(booking.endsAt).getTime() > start
  );
}

function overlapsDay(day: Date, period: Period) {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);
  return new Date(period.startsAt) <= end && new Date(period.desiredUntil) > start;
}

export function PieceCalendarDialog({
  deviceId,
  deviceName,
  unit,
  period,
  onRequested,
  onClose,
}: {
  deviceId: string;
  deviceName: string;
  unit: CalendarUnit;
  /**
   * Period from the search; pre-fills the request and is highlighted in the calendar.
   */
  period?: Period;
  /**
   * Called after a request was created, so the opener can refresh its data.
   */
  onRequested?: () => void;
  onClose: () => void;
}) {
  const [cursor, setCursor] = useState(() => (period ? new Date(period.startsAt) : new Date()));
  const [roomId, setRoomId] = useState("");
  const [startsAt, setStartsAt] = useState(period?.startsAt ?? "");
  const [desiredUntil, setDesiredUntil] = useState(period?.desiredUntil ?? "");
  const [comment, setComment] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean>>({});
  const { data: form } = useApi<RequestForm>("/api/settings/request-form");
  const terms = useTerms();
  const [formError, setFormError] = useState("");
  const [info, setInfo] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const { data: allRooms, error: roomsError } = useApi<Room[]>("/api/rooms");
  const { data: myRequests, reload: reloadMyRequests } =
    useApi<BorrowRequest[]>("/api/requests/mine");
  const periods = useMemo(() => ownPeriods(myRequests), [myRequests]);
  // A period of one of the user's own requests, picked above the calendar.
  const [chosen, setChosen] = useState<OwnPeriod | null>(null);
  const {
    data: calendar,
    error: calendarError,
    reload: reloadCalendar,
  } = useApi<{ units: CalendarUnit[] }>(`/api/devices/${deviceId}/calendar`);
  // `unit` is what the opener knew; the calendar response adds the bookings.
  const current = calendar?.units.find((item) => item.id === unit.id) ?? unit;
  const highlight: Period | undefined = chosen ?? period;
  const rooms = (allRooms ?? []).filter((room) => room.id !== "room-unassigned");
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const days = useMemo(() => monthDays(year, month), [year, month]);
  const weeks = useMemo(
    () => Array.from({ length: 6 }, (_, week) => days.slice(week * 7, week * 7 + 7)),
    [days]
  );
  // Roving focus: the grid is one Tab stop, the arrow keys move between days.
  const [focused, setFocused] = useState(() => cursor);
  const gridRef = useRef<HTMLTableElement>(null);
  const tabDay = days.some((day) => day.toDateString() === focused.toDateString())
    ? focused.toDateString()
    : new Date(year, month, 1).toDateString();

  function onGridKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    const next = new Date(focused);
    const weekday = (next.getDay() + 6) % 7;
    switch (event.key) {
      case "ArrowLeft":
        next.setDate(next.getDate() - 1);
        break;
      case "ArrowRight":
        next.setDate(next.getDate() + 1);
        break;
      case "ArrowUp":
        next.setDate(next.getDate() - 7);
        break;
      case "ArrowDown":
        next.setDate(next.getDate() + 7);
        break;
      case "Home":
        next.setDate(next.getDate() - weekday);
        break;
      case "End":
        next.setDate(next.getDate() + 6 - weekday);
        break;
      case "PageUp":
        next.setMonth(next.getMonth() - 1);
        break;
      case "PageDown":
        next.setMonth(next.getMonth() + 1);
        break;
      default:
        return;
    }
    event.preventDefault();
    setFocused(next);
    if (next.getMonth() !== month || next.getFullYear() !== year) {
      setCursor(new Date(next.getFullYear(), next.getMonth(), 1));
    }
    // A key press commits synchronously, so the new day's button exists by the next frame.
    requestAnimationFrame(() => {
      gridRef.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus();
    });
  }

  function pickDay(day: Date, kind: string) {
    if (kind !== "free" || current.status === "DEFECTIVE") return;
    const start = new Date(day);
    start.setHours(8, 0, 0, 0);
    const end = new Date(day);
    end.setHours(17, 0, 0, 0);
    openRequest({ startsAt: toLocalInput(start), desiredUntil: toLocalInput(end) });
  }

  function choosePeriod(entry: OwnPeriod) {
    if (chosen?.key === entry.key) {
      setChosen(null);
      return;
    }
    setChosen(entry);
    const start = new Date(entry.startsAt);
    setCursor(new Date(start.getFullYear(), start.getMonth(), 1));
    setFocused(start);
  }

  function openRequest(next: Period, suggestedRoom?: string | null) {
    // Same appointment, usually the same room; only preset it while none is chosen yet.
    if (!roomId && suggestedRoom && suggestedRoom !== "room-unassigned") setRoomId(suggestedRoom);
    setStartsAt(next.startsAt);
    setDesiredUntil(next.desiredUntil);
    setFormError("");
    setInfo("");
    setRequestOpen(true);
  }

  async function submitRequest() {
    if (desiredUntil <= startsAt) {
      setFormError("Das Ende muss nach dem Start liegen.");
      return;
    }
    setFormError("");
    setSending(true);
    try {
      await api("/api/requests", {
        method: "POST",
        body: JSON.stringify({
          unitId: current.id,
          roomId: form?.room === "hidden" ? "" : roomId,
          startsAt,
          desiredUntil,
          comment: form?.comment === "hidden" ? "" : comment,
          fields: fieldValues,
        }),
      });
      reloadCalendar();
      reloadMyRequests();
      onRequested?.();
      setInfo(
        form?.autoApprove
          ? "Ausleihe bestätigt. Die Bestätigung erhalten Sie auch per E-Mail."
          : "Anfrage gesendet. Die Verwaltung prüft sie. Den Stand sehen Sie unter „Meine Anfragen“."
      );
      setComment("");
      setFieldValues({});
      setRequestOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Anfrage fehlgeschlagen");
    } finally {
      setSending(false);
    }
  }

  const monthLabel = cursor.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  // The server refuses longer loans; the picker already stops at the limit.
  const latestEnd =
    form && startsAt
      ? toLocalInput(new Date(new Date(startsAt).getTime() + form.maxDays * 24 * 60 * 60 * 1000))
      : undefined;

  return (
    <Modal
      title={`${terms.unit} ${current.serialNumber}`}
      description={
        <>
          {deviceName} · <DeviceBadge status={current.status} />
        </>
      }
      onClose={onClose}
      size="lg"
    >
      <Alert>{calendarError || roomsError}</Alert>
      <Alert tone="ok">{info}</Alert>
      {highlight ? (
        <div className="period-bar">
          <div>
            <span className="muted small">
              {chosen ? `Zeitraum Ihrer Anfrage · ${chosen.detail}` : "Zeitraum aus der Suche"}
            </span>
            <strong>
              {dateTime(highlight.startsAt)} – {dateTime(highlight.desiredUntil)}
            </strong>
          </div>
          {unitBusy(current, highlight) ? (
            <span className="muted small">In diesem Zeitraum schon belegt.</span>
          ) : (
            <button type="button" onClick={() => openRequest(highlight, chosen?.roomId)}>
              Für diesen Zeitraum anfragen
            </button>
          )}
        </div>
      ) : (
        <p className="muted small">Wählen Sie einen freien Tag, um eine Anfrage zu stellen.</p>
      )}
      {periods.length > 0 && (
        <fieldset className="chips own-periods">
          <legend>Zeitraum aus meinen Anfragen</legend>
          {periods.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className="chip"
              aria-pressed={chosen?.key === entry.key}
              title={entry.detail}
              onClick={() => choosePeriod(entry)}
            >
              {entry.label}
            </button>
          ))}
        </fieldset>
      )}
      <div className="cal-toolbar">
        <button
          type="button"
          className="secondary sm icon"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          aria-label="Vorheriger Monat"
        >
          <Icon name="left" />
        </button>
        <strong aria-live="polite">{monthLabel}</strong>
        <button
          type="button"
          className="secondary sm icon"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          aria-label="Nächster Monat"
        >
          <Icon name="right" />
        </button>
      </div>
      {/* The WAI-ARIA date picker pattern: a table with role="grid" and arrow-key navigation. */}
      <table
        ref={gridRef}
        className="cal-grid"
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role
        role="grid"
        tabIndex={-1}
        aria-label={`Kalender ${monthLabel}. Pfeiltasten wechseln den Tag, Bild auf/ab den Monat.`}
        onKeyDown={onGridKeyDown}
      >
        <thead>
          <tr>
            {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((label) => (
              <th key={label} scope="col" className="cal-head">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]?.toISOString()}>
              {week.map((day) => {
                const kind = dayKind(day, current);
                const label =
                  kind === "borrowed"
                    ? "belegt"
                    : kind === "open"
                      ? "angefragt"
                      : kind === "defective"
                        ? "defekt"
                        : "frei";
                return (
                  <td key={day.toISOString()}>
                    <button
                      type="button"
                      className={`cal-day cal-${kind}${day.getMonth() === month ? "" : " cal-out"}${
                        highlight && overlapsDay(day, highlight) ? " cal-selected" : ""
                      }`}
                      title={`${day.toLocaleDateString("de-DE")}: ${label}`}
                      aria-label={`${day.toLocaleDateString("de-DE")}, ${label}`}
                      // Not `disabled`: taken days stay reachable, so their status can be read out.
                      aria-disabled={kind !== "free"}
                      tabIndex={day.toDateString() === tabDay ? 0 : -1}
                      onFocus={() => setFocused(day)}
                      onClick={() => pickDay(day, kind)}
                    >
                      <span>{day.getDate()}</span>
                      <span className="cal-label">{label}</span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="legend" aria-hidden="true">
        <span>
          <i /> frei
        </span>
        <span>
          <i className="open" /> angefragt
        </span>
        <span>
          <i className="borrowed" /> belegt
        </span>
        <span>
          <i className="defective" /> defekt
        </span>
        {period && (
          <span>
            <i className="selected" /> gesuchter Zeitraum
          </span>
        )}
      </div>

      <div className="section-title">
        <h2>Zeiträume</h2>
      </div>
      <ul className="period-list">
        {current.bookings.length === 0 && <li className="muted">Noch keine Buchungen.</li>}
        {current.bookings.map((booking) => (
          <li key={booking.id}>
            <span>
              {dateTime(booking.startsAt)} – {dateTime(booking.endsAt)}
              {booking.borrower ? <span className="muted"> · {booking.borrower}</span> : null}
            </span>
            <span className="muted">{stateLabel[booking.state] ?? booking.state}</span>
          </li>
        ))}
      </ul>

      {requestOpen && (
        <Modal
          title="Ausleihe anfragen"
          description={`${deviceName} · ${terms.unit} ${current.serialNumber}`}
          onClose={() => setRequestOpen(false)}
          size="sm"
          footer={
            <>
              <button type="button" className="secondary" onClick={() => setRequestOpen(false)}>
                Abbrechen
              </button>
              <button type="submit" form="request-form" disabled={sending}>
                {sending ? "Wird gesendet…" : "Anfrage senden"}
              </button>
            </>
          }
        >
          <Alert>{formError}</Alert>
          <form
            id="request-form"
            className="form-grid cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              void submitRequest();
            }}
          >
            <Field label="Start" htmlFor="cal-from">
              <input
                id="cal-from"
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                required
              />
            </Field>
            <Field label="Ende" htmlFor="cal-until">
              <input
                id="cal-until"
                type="datetime-local"
                min={startsAt}
                max={latestEnd}
                value={desiredUntil}
                onChange={(event) => setDesiredUntil(event.target.value)}
                required
              />
            </Field>
            {form?.room !== "hidden" && (
              <Field
                label={terms.room}
                htmlFor="cal-room"
                className="span-full"
                optional={form?.room === "optional"}
                hint="Wo es eingesetzt wird."
              >
                <select
                  id="cal-room"
                  value={roomId}
                  onChange={(event) => setRoomId(event.target.value)}
                  required={form?.room !== "optional"}
                >
                  <option value="">{terms.room} wählen…</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                      {room.building ? ` · ${room.building}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {form?.fields.map((field) => (
              <CustomField
                key={field.id}
                field={field}
                value={fieldValues[field.id]}
                onChange={(value) => setFieldValues((values) => ({ ...values, [field.id]: value }))}
              />
            ))}
            {form?.comment !== "hidden" && (
              <Field
                label={form?.commentLabel ?? "Kommentar"}
                htmlFor="cal-comment"
                optional={form?.comment !== "required"}
                className="span-full"
              >
                <textarea
                  id="cal-comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  maxLength={1000}
                  required={form?.comment === "required"}
                  placeholder={form?.commentHint ?? "z. B. Zweck oder Zubehörwunsch"}
                />
              </Field>
            )}
          </form>
        </Modal>
      )}
    </Modal>
  );
}

/**
 * One of the company's own request fields (settings → Anfrageformular).
 */
function CustomField({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
}) {
  const id = `cal-field-${field.id}`;
  if (field.type === "checkbox") {
    return (
      <div className="field span-full">
        <label className="check" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            required={field.required}
            onChange={(event) => onChange(event.target.checked)}
          />
          {field.label}
        </label>
        {field.hint && <p className="hint">{field.hint}</p>}
      </div>
    );
  }
  const text = typeof value === "string" ? value : "";
  return (
    <Field
      label={field.label}
      htmlFor={id}
      optional={!field.required}
      hint={field.hint || undefined}
      className="span-full"
    >
      {field.type === "select" ? (
        <select
          id={id}
          value={text}
          required={field.required}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Bitte wählen…</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea
          id={id}
          value={text}
          maxLength={500}
          required={field.required}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          value={text}
          maxLength={500}
          required={field.required}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

export function PieceListDialog({
  deviceId,
  name,
  onClose,
}: {
  deviceId: string;
  name: string;
  onClose: () => void;
}) {
  const terms = useTerms();
  const [selected, setSelected] = useState<CalendarUnit | null>(null);
  const { data, error } = useApi<{ units: CalendarUnit[] }>(`/api/devices/${deviceId}/calendar`);
  const units = data?.units;

  return (
    <Modal
      title={name}
      description={`Alle ${terms.units}. Zum Anfragen den Kalender öffnen.`}
      onClose={onClose}
    >
      <Alert>{error}</Alert>
      <div className="table-wrap table-plain" style={{ marginBottom: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Seriennummer</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Aktionen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {units?.length === 0 && (
              <tr>
                <td colSpan={3} className="empty">
                  Keine {terms.units} vorhanden.
                </td>
              </tr>
            )}
            {units?.map((unit) => (
              <tr key={unit.id}>
                <td className="mono">{unit.serialNumber}</td>
                <td>
                  <DeviceBadge status={unit.status} />
                </td>
                <td className="actions-cell">
                  <button type="button" className="secondary sm" onClick={() => setSelected(unit)}>
                    <Icon name="calendar" /> Kalender
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <PieceCalendarDialog
          key={selected.id}
          deviceId={deviceId}
          deviceName={name}
          unit={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </Modal>
  );
}

export function ImagePopup({
  images,
  alt,
  index,
  onIndex,
  onClose,
}: {
  images: ImageRef[];
  alt: string;
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const image = images[index] ?? images[0];
  if (!image) return null;

  // Arrow keys page through the images, wherever the focus is inside the dialog.
  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (images.length < 2) return;
    if (event.key === "ArrowLeft") onIndex((index + images.length - 1) % images.length);
    else if (event.key === "ArrowRight") onIndex((index + 1) % images.length);
  }

  return (
    <Modal
      title={alt}
      description={images.length > 1 ? `Bild ${index + 1} von ${images.length}` : undefined}
      onClose={onClose}
      onKeyDown={onKeyDown}
      size="lg"
      footer={
        images.length > 1 ? (
          <>
            <button
              type="button"
              className="secondary"
              onClick={() => onIndex((index + images.length - 1) % images.length)}
            >
              <Icon name="left" /> Zurück
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => onIndex((index + 1) % images.length)}
            >
              Weiter <Icon name="right" />
            </button>
          </>
        ) : undefined
      }
    >
      <img className="preview-large" src={image.url} alt={alt} />
    </Modal>
  );
}
