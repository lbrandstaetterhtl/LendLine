import type { Device, DeviceStatus } from "../types";

import { useState } from "react";
import { Link } from "react-router-dom";

import { useApi } from "../api/useApi";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/permissions";
import { useTerms } from "../branding/BrandingContext";
import { CategorySelect } from "../components/CategorySelect";
import { DeviceFieldList, FieldFilter, useFieldOptions } from "../components/DeviceFields";
import { DeviceImages, ImagePopup, PieceListDialog } from "../components/DeviceImages";
import { Icon } from "../components/icons";
import { RequestSent } from "../components/RequestSent";
import { Alert, Field, PageHeader } from "../components/ui";
import { format, useI18n } from "../i18n";

export function DevicesPage() {
  const terms = useTerms();
  const { m } = useI18n();
  const t = m.catalog;
  const { user } = useAuth();
  const seesDefective = can(user, "devices.defective") || can(user, "devices.manage");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState<"" | DeviceStatus>("");
  const [fieldFilter, setFieldFilter] = useState({ field: "", value: "" });
  const fieldOptions = useFieldOptions();
  const params = new URLSearchParams();
  if (categoryId) params.set("categoryId", categoryId);
  if (status) params.set("status", status);
  if (fieldFilter.field && fieldFilter.value) {
    params.set("field", fieldFilter.field);
    params.set("value", fieldFilter.value);
  }
  const query = params.toString();
  const { data: all, error } = useApi<Device[]>(`/api/devices${query ? `?${query}` : ""}`);
  const [term, setTerm] = useState("");
  const needle = term.trim().toLowerCase();
  // The text search also finds property values ("16 GB", "USB-C").
  const devices = needle
    ? all?.filter((device) =>
        [device.name, device.description, ...device.fields.map((field) => field.value)]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      )
    : all;
  const [preview, setPreview] = useState<{
    name: string;
    images: { id: string; url: string }[];
    index: number;
  } | null>(null);
  const [pieceDevice, setPieceDevice] = useState<Device | null>(null);
  const [sent, setSent] = useState("");

  return (
    <>
      <PageHeader
        title={terms.catalog}
        description={format(t.description, { devices: terms.devices })}
        actions={
          <Link className="btn" to="/search">
            <Icon name="search" /> {format(m.nav.searchUnits, { unit: terms.unit })}
          </Link>
        }
      />
      <Alert>{error}</Alert>
      <RequestSent message={sent} />
      <div className="toolbar">
        <Field label={t.search} htmlFor="device-search" className="grow">
          <input
            id="device-search"
            data-shortcut="search"
            title={t.searchShortcut}
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t.searchPlaceholder}
          />
        </Field>
        <Field label={t.category} htmlFor="category">
          <CategorySelect
            id="category"
            value={categoryId}
            onChange={setCategoryId}
            emptyLabel={t.allCategories}
          />
        </Field>
        <Field label={t.availability} htmlFor="status">
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as "" | DeviceStatus)}
          >
            <option value="">{t.all}</option>
            <option value="AVAILABLE">{t.anyFree}</option>
            <option value="BORROWED">{t.anyBorrowed}</option>
            {seesDefective && <option value="DEFECTIVE">{t.anyDefective}</option>}
          </select>
        </Field>
        <FieldFilter options={fieldOptions} filter={fieldFilter} onChange={setFieldFilter} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{terms.device}</th>
              <th>{t.category}</th>
              <th className="num">{t.available}</th>
              <th className="num">{t.total}</th>
              <th>{t.descriptionLabel}</th>
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
                </td>
                <td>
                  <span className="tag">{device.category}</span>
                </td>
                <td className="num">{device.quantityAvailable}</td>
                <td className="num muted">{device.quantityTotal}</td>
                <td className="muted">
                  {device.description || (device.fields.length > 0 ? "" : "–")}
                  <DeviceFieldList fields={device.fields} />
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
                  <button
                    type="button"
                    className="secondary sm"
                    onClick={() => setPieceDevice(device)}
                  >
                    <Icon name="calendar" /> {t.calendar}
                  </button>
                </td>
              </tr>
            ))}
            {devices?.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  {format(t.none, { devices: terms.devices })}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pieceDevice && (
        <PieceListDialog
          key={pieceDevice.id}
          deviceId={pieceDevice.id}
          name={pieceDevice.name}
          onRequested={(message) => {
            setPieceDevice(null);
            setSent(message);
          }}
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
