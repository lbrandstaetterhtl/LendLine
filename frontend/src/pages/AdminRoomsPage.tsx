import type { SubmitEvent } from "react";
import { useState } from "react";

import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { useTerms } from "../branding/BrandingContext";
import { Icon } from "../components/icons";
import { Alert, Field, Modal, PageHeader } from "../components/ui";
import { format, useI18n } from "../i18n";

type Room = { id: string; name: string; building: string; description: string };

const empty = { name: "", building: "", description: "" };

export function AdminRoomsPage() {
  const terms = useTerms();
  const { m } = useI18n();
  const t = m.rooms;
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
      setInfo(format(editingId ? t.saved : t.created, { room: terms.room, name: form.name }));
      setEditor(null);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : m.categories.saveFailed);
    }
  }

  async function remove(room: Room) {
    if (!window.confirm(format(t.confirmDelete, { room: terms.room, name: room.name }))) return;
    setError("");
    setInfo("");
    try {
      await api(`/api/rooms/${room.id}`, { method: "DELETE" });
      setInfo(format(t.deleted, { room: terms.room, name: room.name }));
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : m.categories.deleteFailed);
    }
  }

  return (
    <>
      <PageHeader
        title={terms.rooms}
        description={format(t.description, { room: terms.room })}
        actions={
          <button
            type="button"
            onClick={() => open()}
            data-shortcut="new"
            title={m.categories.shortcutNew}
          >
            <Icon name="plus" /> {format(t.create, { room: terms.room })}
          </button>
        }
      />
      <Alert>{error || loadError}</Alert>
      <Alert tone="ok">{info}</Alert>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{terms.room}</th>
              <th>{t.building}</th>
              <th>{t.descriptionLabel}</th>
              <th>
                <span className="sr-only">{m.table.actions}</span>
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
                      {m.common.edit}
                    </button>
                    <button type="button" className="danger sm" onClick={() => void remove(room)}>
                      {m.common.delete}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rooms?.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  {format(t.none, { rooms: terms.rooms })}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editor && (
        <Modal
          variant="sheet"
          title={format(editingId ? t.edit : t.create, { room: terms.room })}
          onClose={() => setEditor(null)}
          footer={
            <>
              <button type="button" className="secondary" onClick={() => setEditor(null)}>
                {m.common.cancel}
              </button>
              <button type="submit" form="room-form">
                {editingId ? t.saveChanges : format(t.create, { room: terms.room })}
              </button>
            </>
          }
        >
          <Alert>{formError}</Alert>
          <form id="room-form" className="form-stack" onSubmit={(event) => void onSubmit(event)}>
            <Field label={t.name} htmlFor="room-name" hint={t.nameHint}>
              <input
                id="room-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                maxLength={80}
              />
            </Field>
            <Field label={t.building} htmlFor="building" optional>
              <input
                id="building"
                value={form.building}
                onChange={(e) => setForm({ ...form, building: e.target.value })}
                maxLength={80}
                placeholder={t.buildingPlaceholder}
              />
            </Field>
            <Field label={t.descriptionLabel} htmlFor="room-desc" optional>
              <textarea
                id="room-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={500}
                placeholder={t.descriptionPlaceholder}
              />
            </Field>
          </form>
        </Modal>
      )}
    </>
  );
}
