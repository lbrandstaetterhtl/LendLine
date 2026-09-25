import type { DeviceField } from "../types";

import { useId } from "react";

import { useApi } from "../api/useApi";
import { useFeature } from "../ui/UiContext";
import { Icon } from "./icons";
import { Field } from "./ui";

type FieldOption = { name: string; values: string[] };

/**
 * Property names and values in use across all devices (GET /api/devices/fields).
 */
export function useFieldOptions() {
  return useApi<FieldOption[]>("/api/devices/fields").data ?? [];
}

/**
 * A device's properties as small "Name Wert" tags.
 */
export function DeviceFieldList({ fields }: { fields?: DeviceField[] }) {
  const enabled = useFeature("devices.properties");
  if (!enabled || !fields?.length) return null;
  return (
    <ul className="device-fields" aria-label="Eigenschaften">
      {fields.map((field) => (
        <li key={field.name}>
          <span>{field.name}</span> {field.value}
        </li>
      ))}
    </ul>
  );
}

export type FieldFilterValue = { field: string; value: string };

/**
 * "Eigenschaft" and "Wert" selects built from the values actually in use. Only a complete pair
 * filters; changing the property clears the value.
 */
export function FieldFilter({
  options,
  filter,
  onChange,
}: {
  options: FieldOption[];
  filter: FieldFilterValue;
  onChange: (filter: FieldFilterValue) => void;
}) {
  const id = useId();
  const enabled = useFeature("devices.properties");
  if (!enabled || options.length === 0) return null;
  const values = options.find((option) => option.name === filter.field)?.values ?? [];
  return (
    <>
      <Field label="Eigenschaft" htmlFor={`${id}-field`} optional>
        <select
          id={`${id}-field`}
          value={filter.field}
          onChange={(event) => onChange({ field: event.target.value, value: "" })}
        >
          <option value="">Alle</option>
          {options.map((option) => (
            <option key={option.name} value={option.name}>
              {option.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Wert" htmlFor={`${id}-value`} optional>
        <select
          id={`${id}-value`}
          value={filter.value}
          disabled={!filter.field}
          onChange={(event) => onChange({ ...filter, value: event.target.value })}
        >
          <option value="">{filter.field ? "Wert wählen…" : "erst Eigenschaft wählen"}</option>
          {values.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}

/**
 * Free "Name: Wert" rows for the device editor. Names and values already used elsewhere are offered
 * as suggestions, so "RAM" does not turn into "Ram" or "Arbeitsspeicher" on the next device.
 */
export function DeviceFieldsEditor({
  fields,
  options,
  onChange,
}: {
  fields: DeviceField[];
  options: FieldOption[];
  onChange: (fields: DeviceField[]) => void;
}) {
  const id = useId();
  const namesId = `${id}-names`;

  function update(index: number, patch: Partial<DeviceField>) {
    onChange(
      fields.map((field, position) => (position === index ? { ...field, ...patch } : field))
    );
  }

  return (
    <div className="field-rows">
      <datalist id={namesId} aria-label="Vorhandene Eigenschaften">
        {options.map((option) => (
          <option key={option.name} value={option.name}>
            {option.name}
          </option>
        ))}
      </datalist>
      {fields.map((field, index) => {
        const valuesId = `${id}-values-${index}`;
        const known = options.find((option) => option.name === field.name)?.values ?? [];
        const duplicate = fields.some(
          (other, position) =>
            position !== index &&
            other.name.trim() !== "" &&
            other.name.trim().toLowerCase() === field.name.trim().toLowerCase()
        );
        return (
          // Rows have no id of their own; the position is stable while editing.
          // oxlint-disable-next-line react/no-array-index-key
          <div className="field-row" key={index}>
            <datalist id={valuesId} aria-label="Vorhandene Werte">
              {known.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </datalist>
            <input
              aria-label={`Eigenschaft ${index + 1}: Name`}
              list={namesId}
              value={field.name}
              maxLength={40}
              required
              placeholder="z. B. RAM"
              aria-invalid={duplicate}
              title={duplicate ? "Diese Eigenschaft gibt es schon" : undefined}
              onChange={(event) => update(index, { name: event.target.value })}
            />
            <input
              aria-label={`Eigenschaft ${index + 1}: Wert`}
              list={valuesId}
              value={field.value}
              maxLength={200}
              required
              placeholder="z. B. 16 GB"
              onChange={(event) => update(index, { value: event.target.value })}
            />
            <button
              type="button"
              className="ghost icon sm"
              aria-label={`Eigenschaft ${index + 1} entfernen`}
              title="Entfernen"
              onClick={() => onChange(fields.filter((_, position) => position !== index))}
            >
              <Icon name="x" />
            </button>
          </div>
        );
      })}
      <div>
        <button
          type="button"
          className="secondary sm"
          disabled={fields.length >= 30}
          onClick={() => onChange([...fields, { name: "", value: "" }])}
        >
          <Icon name="plus" /> Eigenschaft hinzufügen
        </button>
      </div>
    </div>
  );
}
