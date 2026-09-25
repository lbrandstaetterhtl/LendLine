import type { Device, DeviceField, DeviceStatus } from "../types";

import type { SubmitEvent } from "react";
import { useState } from "react";

import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/permissions";
import { useTerms } from "../branding/BrandingContext";
import { CategorySelect } from "../components/CategorySelect";
import { DeviceFieldList, DeviceFieldsEditor, useFieldOptions } from "../components/DeviceFields";
import { DeviceImages, ImagePopup, PieceListDialog } from "../components/DeviceImages";
import { Icon } from "../components/icons";
import { DeviceBadge } from "../components/StatusBadge";
import { Alert, Field, Modal, PageHeader } from "../components/ui";
import { useFeature } from "../ui/UiContext";

type PieceForm = { id?: string; serialNumber: string; status: DeviceStatus };
type DeviceForm = {
  name: string;
  categoryId: string;
  description: string;
  fields: DeviceField[];
  units: PieceForm[];
};

const emptyForm = (): DeviceForm => ({
  name: "",
  categoryId: "",
  description: "",
  fields: [],
  units: [{ serialNumber: "", status: "AVAILABLE" }],
});

export function AdminDevicesPage() {
  const terms = useTerms();
  const { data: devices, error: loadError, reload } = useApi<Device[]>("/api/devices");
  const [form, setForm] = useState<DeviceForm>(emptyForm);
  const fieldOptions = useFieldOptions();
  const { user } = useAuth();
  const canManage = can(user, "devices.manage");
  const canImages = can(user, "devices.images");
  const properties = useFeature("devices.properties");
  // null: closed; id null: creating; id set: editing that record.
  const [editor, setEditor] = useState<{ id: string | null } | null>(null);
  const [files, setFiles] = useState<FileList | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [info, setInfo] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{
    name: string;
    images: { id: string; url: string }[];
    index: number;
  } | null>(null);
  const [pieceDevice, setPieceDevice] = useState<Device | null>(null);
  const editingId = editor?.id ?? null;
  const editing = devices?.find((device) => device.id === editingId);

  function openNew() {
    setForm(emptyForm());
    setFiles(null);
    setFormError("");
    setEditor({ id: null });
  }

  function startEdit(device: Device) {
    setForm({
      name: device.name,
      categoryId: device.categoryId,
      description: device.description,
      fields: device.fields,
      units: (device.units ?? []).map((unit) => ({
        id: unit.id,
        serialNumber: unit.serialNumber,
        status: unit.status,
      })),
    });
    setFiles(null);
    setFormError("");
    setEditor({ id: device.id });
  }

  function updateUnit(index: number, patch: Partial<PieceForm>) {
    const units = form.units.map((unit, unitIndex) =>
      unitIndex === index ? { ...unit, ...patch } : unit
    );
    setForm({ ...form, units });
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      const current = devices?.find((device) => device.id === editingId);
      // With the image right only, the device itself stays as it is.
      const saved =
        !canManage && current
          ? current
          : editingId
            ? await api<Device>(`/api/devices/${editingId}`, {
                method: "PATCH",
                body: JSON.stringify(form),
              })
            : await api<Device>("/api/devices", { method: "POST", body: JSON.stringify(form) });
      if (files?.length) {
        const body = new FormData();
        Array.from(files).forEach((file) => body.append("images", file));
        await api(`/api/devices/${saved.id}/images`, { method: "POST", body });
      }
      setInfo(editingId ? `„${saved.name}“ gespeichert.` : `„${saved.name}“ angelegt.`);
      setEditor(null);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  async function removeImage(deviceId: string, imageId: string) {
    if (!window.confirm("Dieses Bild entfernen?")) return;
    setFormError("");
    try {
      await api(`/api/devices/${deviceId}/images/${imageId}`, { method: "DELETE" });
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Bild konnte nicht entfernt werden");
    }
  }

  async function remove(device: Device) {
    if (
      !window.confirm(
        `Gerät „${device.name}“ löschen?\n\nDas geht nur, wenn keine Anfragen oder Ausleihen daran hängen.`
      )
    )
      return;
    setError("");
    setInfo("");
    try {
      await api(`/api/devices/${device.id}`, { method: "DELETE" });
      setInfo(`„${device.name}“ gelöscht.`);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
    }
  }

  const available = form.units.filter((unit) => unit.status === "AVAILABLE").length;
  const borrowed = form.units.filter((unit) => unit.status === "BORROWED").length;

  return (
    <>
      <PageHeader
        title={terms.devices}
        description="Ein Gerät ist ein Modell. Jedes Stück hat eine eigene Seriennummer und einen eigenen Status."
        actions={
          canManage && (
            <button type="button" onClick={openNew} data-shortcut="new" title="Tastenkürzel: n">
              <Icon name="plus" /> Gerät anlegen
            </button>
          )
        }
      />
      <Alert>{error || loadError}</Alert>
      <Alert tone="ok">{info}</Alert>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Gerät</th>
              <th>Kategorie</th>
              <th className="num">Verfügbar</th>
              <th className="num">Ausgeliehen</th>
              <th className="num">Gesamt</th>
              <th>Stücke</th>
              <th>Bilder</th>
              <th>
                <span className="sr-only">Aktionen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {devices?.map((device) => (
              <tr key={device.id}>
                <td>
                  <button type="button" className="linkish" onClick={() => setPieceDevice(device)}>
                    {device.name}
                  </button>
                  {device.description && <div className="muted small">{device.description}</div>}
                  <DeviceFieldList fields={device.fields} />
                </td>
                <td>
                  <span className="tag">{device.category}</span>
                </td>
                <td className="num">{device.quantityAvailable}</td>
                <td className="num">{device.quantityBorrowed ?? 0}</td>
                <td className="num muted">{device.quantityTotal}</td>
                <td>
                  <div className="unit-list">
                    {(device.units ?? []).map((unit) => (
                      <div key={unit.id}>
                        <span className="mono">{unit.serialNumber}</span>{" "}
                        <DeviceBadge status={unit.status} />
                      </div>
                    ))}
                  </div>
                </td>
                <td>
                  <DeviceImages
                    images={device.images}
                    alt={device.name}
                    onOpen={(index) =>
                      setPreview({ name: device.name, images: device.images, index })
                    }
                  />
                </td>
                <td className="actions-cell">
                  <div className="actions">
                    {(canManage || canImages) && (
                      <button
                        type="button"
                        className="secondary sm"
                        onClick={() => startEdit(device)}
                      >
                        {canManage ? "Bearbeiten" : "Bilder"}
                      </button>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        className="danger sm"
                        onClick={() => void remove(device)}
                      >
                        Löschen
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {devices?.length === 0 && (
              <tr>
                <td colSpan={8} className="empty">
                  Noch keine Geräte angelegt.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editor && (
        <Modal
          variant="sheet"
          size="lg"
          title={editingId ? "Gerät bearbeiten" : "Gerät anlegen"}
          description={editing ? editing.name : "Modell, Stücke und Bilder erfassen."}
          onClose={() => setEditor(null)}
          footer={
            <>
              <button type="button" className="secondary" onClick={() => setEditor(null)}>
                Abbrechen
              </button>
              <button type="submit" form="device-form" disabled={saving}>
                {saving ? "Speichern…" : editingId ? "Änderungen speichern" : "Gerät anlegen"}
              </button>
            </>
          }
        >
          <Alert>{formError}</Alert>
          <form id="device-form" onSubmit={(event) => void onSubmit(event)}>
            <section className="form-section">
              <h3>Allgemein</h3>
              <div className="form-grid cols-2">
                <Field label="Name" htmlFor="name">
                  <input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    minLength={2}
                    maxLength={160}
                    placeholder="z. B. ThinkPad T14"
                  />
                </Field>
                <Field label="Kategorie" htmlFor="category">
                  <CategorySelect
                    id="category"
                    value={form.categoryId}
                    onChange={(categoryId) => setForm({ ...form, categoryId })}
                    required
                  />
                </Field>
                <Field label="Beschreibung" htmlFor="description" optional className="span-full">
                  <textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    maxLength={2000}
                    placeholder="Ausstattung, Zubehör, Hinweise"
                  />
                </Field>
              </div>
            </section>

            {properties && (
              <section className="form-section">
                <h3>Eigenschaften</h3>
                <p className="hint">
                  Frei wählbar, z. B. RAM: 16 GB oder Anschlüsse: HDMI, USB-C. Nutzer sehen sie im
                  Katalog und können danach filtern.
                </p>
                <DeviceFieldsEditor
                  fields={form.fields}
                  options={fieldOptions}
                  onChange={(fields) => setForm({ ...form, fields })}
                />
              </section>
            )}

            <section className="form-section">
              <h3>Stücke</h3>
              <p className="hint">
                {form.units.length} gesamt · {available} verfügbar · {borrowed} ausgeliehen.
                „Ausgeliehen“ wird nur durch eine bestätigte Anfrage gesetzt.
              </p>
              <div className="table-wrap table-plain" style={{ marginBottom: 10 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Seriennummer</th>
                      <th style={{ width: 170 }}>Status</th>
                      <th style={{ width: 48 }}>
                        <span className="sr-only">Entfernen</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.units.map((unit, index) => (
                      <tr key={unit.id ?? `new-${index}`}>
                        <td>
                          <input
                            aria-label={`Seriennummer Stück ${index + 1}`}
                            value={unit.serialNumber}
                            required
                            minLength={2}
                            maxLength={80}
                            placeholder="z. B. LT-1001"
                            onChange={(event) =>
                              updateUnit(index, { serialNumber: event.target.value })
                            }
                          />
                        </td>
                        <td>
                          {unit.status === "BORROWED" ? (
                            <DeviceBadge status="BORROWED" />
                          ) : (
                            <select
                              aria-label={`Status Stück ${index + 1}`}
                              value={unit.status}
                              onChange={(event) =>
                                updateUnit(index, { status: event.target.value as DeviceStatus })
                              }
                            >
                              <option value="AVAILABLE">Verfügbar</option>
                              <option value="DEFECTIVE">Defekt</option>
                            </select>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="ghost icon sm"
                            aria-label={`Stück ${index + 1} entfernen`}
                            title="Entfernen"
                            disabled={unit.status === "BORROWED" || form.units.length === 1}
                            onClick={() =>
                              setForm({
                                ...form,
                                units: form.units.filter((_, unitIndex) => unitIndex !== index),
                              })
                            }
                          >
                            <Icon name="x" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="secondary sm"
                onClick={() =>
                  setForm({
                    ...form,
                    units: [...form.units, { serialNumber: "", status: "AVAILABLE" }],
                  })
                }
              >
                <Icon name="plus" /> Stück hinzufügen
              </button>
            </section>

            <section className="form-section">
              <h3>Bilder</h3>
              {editing && editing.images.length > 0 && (
                <div className="thumbs lg" style={{ marginBottom: 12 }}>
                  {editing.images.map((image) => (
                    <figure key={image.id}>
                      <img className="thumb-img" src={image.url} alt={editing.name} />
                      <button
                        type="button"
                        className="ghost sm"
                        onClick={() => void removeImage(editing.id, image.id)}
                      >
                        Entfernen
                      </button>
                    </figure>
                  ))}
                </div>
              )}
              <Field
                label="Bilder hochladen"
                htmlFor="images"
                optional
                hint="JPG, PNG, WEBP oder GIF · höchstens 8 Bilder pro Gerät · je max. 5 MB"
              >
                <input
                  id="images"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  onChange={(event) => setFiles(event.target.files)}
                />
              </Field>
            </section>
          </form>
        </Modal>
      )}

      {pieceDevice && (
        <PieceListDialog
          key={pieceDevice.id}
          deviceId={pieceDevice.id}
          name={pieceDevice.name}
          onClose={() => setPieceDevice(null)}
        />
      )}
      {preview && (
        <ImagePopup
          images={preview.images}
          alt={preview.name}
          index={preview.index}
          onIndex={(index) => setPreview({ ...preview, index })}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
