import type { Device, DeviceStatus } from "../types";

import { useState } from "react";
import { Link } from "react-router-dom";

import { useApi } from "../api/useApi";
import { useAuth } from "../auth/AuthContext";
import { useTerms } from "../branding/BrandingContext";
import { CategorySelect } from "../components/CategorySelect";
import { DeviceFieldList, FieldFilter, useFieldOptions } from "../components/DeviceFields";
import { DeviceImages, ImagePopup, PieceListDialog } from "../components/DeviceImages";
import { Icon } from "../components/icons";
import { RequestSent } from "../components/RequestSent";
import { Alert, Field, PageHeader } from "../components/ui";

export function DevicesPage() {
  const terms = useTerms();
  const isAdmin = useAuth().user?.role === "ADMIN";
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
        description={`Alle ${terms.devices} mit aktuellem Bestand. Für eine Ausleihe den Zeitraum über die Suche wählen.`}
        actions={
          <Link className="btn" to="/search">
            <Icon name="search" /> {terms.unit} suchen
          </Link>
        }
      />
      <Alert>{error}</Alert>
      <RequestSent message={sent} />
      <div className="toolbar">
        <Field label="Suche" htmlFor="device-search" className="grow">
          <input
            id="device-search"
            data-shortcut="search"
            title="Tastenkürzel: /"
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Name oder Beschreibung"
          />
        </Field>
        <Field label="Kategorie" htmlFor="category">
          <CategorySelect
            id="category"
            value={categoryId}
            onChange={setCategoryId}
            emptyLabel="Alle Kategorien"
          />
        </Field>
        <Field label="Verfügbarkeit" htmlFor="status">
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as "" | DeviceStatus)}
          >
            <option value="">Alle</option>
            <option value="AVAILABLE">Mindestens eins frei</option>
            <option value="BORROWED">Mindestens eins ausgeliehen</option>
            {isAdmin && <option value="DEFECTIVE">Mindestens eins defekt</option>}
          </select>
        </Field>
        <FieldFilter options={fieldOptions} filter={fieldFilter} onChange={setFieldFilter} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{terms.device}</th>
              <th>Kategorie</th>
              <th className="num">Verfügbar</th>
              <th className="num">Gesamt</th>
              <th>Beschreibung</th>
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
                    <Icon name="calendar" /> Kalender & anfragen
                  </button>
                </td>
              </tr>
            ))}
            {devices?.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  Keine {terms.devices} gefunden.
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
