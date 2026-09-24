import type { SubmitEvent } from "react";
import { useState } from "react";

import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { Icon } from "../components/icons";
import { Alert, Field, Modal, PageHeader } from "../components/ui";

type Room = { id: string; name: string; building: string; description: string };

const empty = { name: "", building: "", description: "" };

export function AdminRoomsPage() {
  const { data: rooms, error: loadError, reload } = useApi<Room[]>("/api/rooms");
  const [form, setForm] = useState(empty);
  // null: closed; id null: creating; id set: editing that record.
  const [editor, setEditor] = useState<{ id: string | null } | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [info, setInfo] = useState("");
  const editingId = editor?.id ?? null;

  function open(room?: Room) {
    setForm(
      room ? { name: room.name, building: room.building, description: room.description } : empty
    );
    setFormError("");
    setEditor({ id: room?.id ?? null });
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    try {
      if (editingId) {
        await api(`/api/rooms/${editingId}`, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await api("/api/rooms", { method: "POST", body: JSON.stringify(form) });
      }
      setInfo(`Raum „${form.name}“ ${editingId ? "gespeichert" : "angelegt"}.`);
      setEditor(null);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  async function remove(room: Room) {
    if (
      !window.confirm(
        `Raum „${room.name}“ löschen?\n\nDas geht nur, wenn keine Anfrage ihn verwendet.`
      )
    )
      return;
    setError("");
    setInfo("");
    try {
      await api(`/api/rooms/${room.id}`, { method: "DELETE" });
      setInfo(`Raum „${room.name}“ gelöscht.`);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
    }
  }

  return (
    <>
      <PageHeader
        title="Räume"
        description="Jede Ausleihe wird für einen Raum angefragt."
        actions={
          <button type="button" onClick={() => open()}>
            <Icon name="plus" /> Raum anlegen
          </button>
        }
      />
      <Alert>{error || loadError}</Alert>
      <Alert tone="ok">{info}</Alert>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Raum</th>
              <th>Gebäude</th>
              <th>Beschreibung</th>
              <th>
                <span className="sr-only">Aktionen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rooms?.map((room) => (
              <tr key={room.id}>
                <td style={{ fontWeight: 550 }}>{room.name}</td>
                <td>{room.building || "–"}</td>
                <td className="muted">{room.description || "–"}</td>
                <td className="actions-cell">
                  <div className="actions">
                    <button type="button" className="secondary sm" onClick={() => open(room)}>
                      Bearbeiten
                    </button>
                    <button type="button" className="danger sm" onClick={() => void remove(room)}>
                      Löschen
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rooms?.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  Noch keine Räume.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editor && (
        <Modal
          variant="sheet"
          title={editingId ? "Raum bearbeiten" : "Raum anlegen"}
          onClose={() => setEditor(null)}
          footer={
            <>
              <button type="button" className="secondary" onClick={() => setEditor(null)}>
                Abbrechen
              </button>
              <button type="submit" form="room-form">
                {editingId ? "Änderungen speichern" : "Raum anlegen"}
              </button>
            </>
          }
        >
          <Alert>{formError}</Alert>
          <form id="room-form" className="form-stack" onSubmit={(event) => void onSubmit(event)}>
            <Field label="Name" htmlFor="room-name" hint="Eindeutige Raumbezeichnung, z. B. A101.">
              <input
                id="room-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                maxLength={80}
              />
            </Field>
            <Field label="Gebäude" htmlFor="building" optional>
              <input
                id="building"
                value={form.building}
                onChange={(e) => setForm({ ...form, building: e.target.value })}
                maxLength={80}
                placeholder="z. B. Haus A"
              />
            </Field>
            <Field label="Beschreibung" htmlFor="room-desc" optional>
              <textarea
                id="room-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={500}
                placeholder="z. B. Seminarraum, 30 Plätze"
              />
            </Field>
          </form>
        </Modal>
      )}
    </>
  );
}
