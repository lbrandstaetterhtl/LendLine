import type { DeviceStatus, Period } from "../types";

import { useMemo, useState } from "react";

import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { toLocalInput } from "../types";
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
  const [formError, setFormError] = useState("");
  const [info, setInfo] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const { data: allRooms, error: roomsError } = useApi<Room[]>("/api/rooms");
  const {
    data: calendar,
    error: calendarError,
    reload: reloadCalendar,
  } = useApi<{ units: CalendarUnit[] }>(`/api/devices/${deviceId}/calendar`);
  // `unit` is what the opener knew; the calendar response adds the bookings.
  const current = calendar?.units.find((item) => item.id === unit.id) ?? unit;
  const rooms = (allRooms ?? []).filter((room) => room.id !== "room-unassigned");
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const days = useMemo(() => monthDays(year, month), [year, month]);

  function pickDay(day: Date, kind: string) {
    if (kind !== "free" || current.status === "DEFECTIVE") return;
    const start = new Date(day);
    start.setHours(8, 0, 0, 0);
    const end = new Date(day);
    end.setHours(17, 0, 0, 0);
    openRequest({ startsAt: toLocalInput(start), desiredUntil: toLocalInput(end) });
  }

  function openRequest(next: Period) {
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
        body: JSON.stringify({ unitId: current.id, roomId, startsAt, desiredUntil, comment }),
      });
      reloadCalendar();
      onRequested?.();
      setInfo(
        "Anfrage gesendet. Die Verwaltung prüft sie. Den Stand sehen Sie unter „Meine Anfragen“."
      );
      setComment("");
      setRequestOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Anfrage fehlgeschlagen");
    } finally {
      setSending(false);
    }
  }

  const monthLabel = cursor.toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  return (
    <Modal
      title={`Stück ${current.serialNumber}`}
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
      {period ? (
        <div className="period-bar">
          <div>
            <span className="muted small">Zeitraum aus der Suche</span>
            <strong>
              {dateTime(period.startsAt)} – {dateTime(period.desiredUntil)}
            </strong>
          </div>
          <button type="button" onClick={() => openRequest(period)}>
            Für diesen Zeitraum anfragen
          </button>
        </div>
      ) : (
        <p className="muted small">Wählen Sie einen freien Tag, um eine Anfrage zu stellen.</p>
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
      <div className="cal-grid" role="grid" aria-label={`Kalender ${monthLabel}`}>
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((label) => (
          <div key={label} className="cal-head">
            {label}
          </div>
        ))}
        {days.map((day) => {
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
            <button
              type="button"
              key={day.toISOString()}
              className={`cal-day cal-${kind}${day.getMonth() === month ? "" : " cal-out"}${
                period && overlapsDay(day, period) ? " cal-selected" : ""
              }`}
              title={`${day.toLocaleDateString("de-DE")}: ${label}`}
              aria-label={`${day.toLocaleDateString("de-DE")}, ${label}`}
              disabled={kind !== "free"}
              onClick={() => pickDay(day, kind)}
            >
              <span>{day.getDate()}</span>
              <span className="cal-label">{label}</span>
            </button>
          );
        })}
      </div>
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
        {current.bookings.length === 0 && (
          <li className="muted">Keine Buchungen für dieses Stück.</li>
        )}
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
          description={`${deviceName} · Stück ${current.serialNumber}`}
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
                value={desiredUntil}
                onChange={(event) => setDesiredUntil(event.target.value)}
                required
              />
            </Field>
            <Field
              label="Raum"
              htmlFor="cal-room"
              className="span-full"
              hint="Wo das Gerät eingesetzt wird."
            >
              <select
                id="cal-room"
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
                required
              >
                <option value="">Raum wählen…</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                    {room.building ? ` · ${room.building}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Kommentar" htmlFor="cal-comment" optional className="span-full">
              <textarea
                id="cal-comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                maxLength={1000}
                placeholder="z. B. Zweck oder Zubehörwunsch"
              />
            </Field>
          </form>
        </Modal>
      )}
    </Modal>
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
  const [selected, setSelected] = useState<CalendarUnit | null>(null);
  const { data, error } = useApi<{ units: CalendarUnit[] }>(`/api/devices/${deviceId}/calendar`);
  const units = data?.units;

  return (
    <Modal
      title={name}
      description="Stücke dieses Geräts. Öffnen Sie den Kalender, um ein Stück anzufragen."
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
                  Keine Stücke vorhanden.
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

  return (
    <Modal
      title={alt}
      description={images.length > 1 ? `Bild ${index + 1} von ${images.length}` : undefined}
      onClose={onClose}
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
