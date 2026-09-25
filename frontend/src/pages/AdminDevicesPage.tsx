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
import { format, useI18n } from "../i18n";
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
  const { m } = useI18n();
  const t = m.devices;
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
      setInfo(format(editingId ? t.saved : t.created, { name: saved.name }));
      setEditor(null);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function removeImage(deviceId: string, imageId: string) {
    if (!window.confirm(t.confirmImageRemove)) return;
    setFormError("");
    try {
      await api(`/api/devices/${deviceId}/images/${imageId}`, { method: "DELETE" });
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t.imageRemoveFailed);
    }
  }

  async function remove(device: Device) {
    if (!window.confirm(format(t.confirmDelete, { device: terms.device, name: device.name })))
      return;
    setError("");
    setInfo("");
    try {
      await api(`/api/devices/${device.id}`, { method: "DELETE" });
      setInfo(format(t.deleted, { name: device.name }));
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.deleteFailed);
    }
  }

  const available = form.units.filter((unit) => unit.status === "AVAILABLE").length;
  const borrowed = form.units.filter((unit) => unit.status === "BORROWED").length;

  return (
    <>
      <PageHeader
        title={terms.devices}
        description={format(t.description, { device: terms.device, unit: terms.unit })}
        actions={
          canManage && (
            <button
              type="button"
              onClick={openNew}
              data-shortcut="new"
              title={m.categories.shortcutNew}
            >
              <Icon name="plus" /> {format(t.create, { device: terms.device })}
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
              <th>{terms.device}</th>
              <th>{t.category}</th>
              <th className="num">{t.available}</th>
              <th className="num">{t.borrowed}</th>
              <th className="num">{t.total}</th>
              <th>{terms.units}</th>
              <th>{t.images}</th>
              <th>
                <span className="sr-only">{m.table.actions}</span>
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
                        {canManage ? m.common.edit : t.images}
                      </button>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        className="danger sm"
                        onClick={() => void remove(device)}
                      >
                        {m.common.delete}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {devices?.length === 0 && (
              <tr>
                <td colSpan={8} className="empty">
                  {format(t.none, { devices: terms.devices })}
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
          title={format(editingId ? t.edit : t.create, { device: terms.device })}
          description={editing ? editing.name : format(t.editorIntro, { units: terms.units })}
          onClose={() => setEditor(null)}
          footer={
            <>
              <button type="button" className="secondary" onClick={() => setEditor(null)}>
                {m.common.cancel}
              </button>
              <button type="submit" form="device-form" disabled={saving}>
                {saving
                  ? t.saving
                  : editingId
                    ? t.saveChanges
                    : format(t.create, { device: terms.device })}
              </button>
            </>
          }
        >
          <Alert>{formError}</Alert>
          <form id="device-form" onSubmit={(event) => void onSubmit(event)}>
            <section className="form-section">
              <h3>{t.general}</h3>
              <div className="form-grid cols-2">
                <Field label={t.name} htmlFor="name">
                  <input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    minLength={2}
                    maxLength={160}
                    placeholder={t.namePlaceholder}
                  />
                </Field>
                <Field label={t.category} htmlFor="category">
                  <CategorySelect
                    id="category"
                    value={form.categoryId}
                    onChange={(categoryId) => setForm({ ...form, categoryId })}
                    required
                  />
                </Field>
                <Field
                  label={t.descriptionLabel}
                  htmlFor="description"
                  optional
                  className="span-full"
                >
                  <textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    maxLength={2000}
                    placeholder={t.descriptionPlaceholder}
                  />
                </Field>
              </div>
            </section>

            {properties && (
              <section className="form-section">
                <h3>{t.properties}</h3>
                <p className="hint">{t.propertiesHint}</p>
                <DeviceFieldsEditor
                  fields={form.fields}
                  options={fieldOptions}
                  onChange={(fields) => setForm({ ...form, fields })}
                />
              </section>
            )}

            <section className="form-section">
              <h3>{terms.units}</h3>
              <p className="hint">
                {format(t.unitsSummary, { total: form.units.length, available, borrowed })}
              </p>
              <div className="table-wrap table-plain" style={{ marginBottom: 10 }}>
                <table>
                  <thead>
                    <tr>
                      <th>{t.serial}</th>
                      <th style={{ width: 170 }}>{t.status}</th>
                      <th style={{ width: 48 }}>
                        <span className="sr-only">{t.remove}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.units.map((unit, index) => (
                      <tr key={unit.id ?? `new-${index}`}>
                        <td>
                          <input
                            aria-label={format(t.serialLabel, {
                              unit: terms.unit,
                              index: index + 1,
                            })}
                            value={unit.serialNumber}
                            required
                            minLength={2}
                            maxLength={80}
                            placeholder={t.serialPlaceholder}
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
                              aria-label={format(t.statusLabel, {
                                unit: terms.unit,
                                index: index + 1,
                              })}
                              value={unit.status}
                              onChange={(event) =>
                                updateUnit(index, { status: event.target.value as DeviceStatus })
                              }
                            >
                              <option value="AVAILABLE">{m.status.device.AVAILABLE}</option>
                              <option value="DEFECTIVE">{m.status.device.DEFECTIVE}</option>
                            </select>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="ghost icon sm"
                            aria-label={format(t.removeUnit, {
                              unit: terms.unit,
                              index: index + 1,
                            })}
                            title={t.remove}
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
                <Icon name="plus" /> {format(t.addUnit, { unit: terms.unit })}
              </button>
            </section>

            <section className="form-section">
              <h3>{t.images}</h3>
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
                        {t.remove}
                      </button>
                    </figure>
                  ))}
                </div>
              )}
              <Field
                label={t.upload}
                htmlFor="images"
                optional
                hint={format(t.uploadHint, { device: terms.device })}
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
