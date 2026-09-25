import type { DeviceField } from "../types";

import { useId } from "react";

import { useApi } from "../api/useApi";
import { format, useI18n } from "../i18n";
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
  const { m } = useI18n();
  if (!enabled || !fields?.length) return null;
  return (
    <ul className="device-fields" aria-label={m.fields.label}>
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
  const { m } = useI18n();
  if (!enabled || options.length === 0) return null;
  const values = options.find((option) => option.name === filter.field)?.values ?? [];
  return (
    <>
      <Field label={m.fields.property} htmlFor={`${id}-field`} optional>
        <select
          id={`${id}-field`}
          value={filter.field}
          onChange={(event) => onChange({ field: event.target.value, value: "" })}
        >
          <option value="">{m.fields.all}</option>
          {options.map((option) => (
            <option key={option.name} value={option.name}>
              {option.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={m.fields.value} htmlFor={`${id}-value`} optional>
        <select
          id={`${id}-value`}
          value={filter.value}
          disabled={!filter.field}
          onChange={(event) => onChange({ ...filter, value: event.target.value })}
        >
          <option value="">{filter.field ? m.fields.chooseValue : m.fields.chooseProperty}</option>
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
  const { m } = useI18n();

  function update(index: number, patch: Partial<DeviceField>) {
    onChange(
      fields.map((field, position) => (position === index ? { ...field, ...patch } : field))
    );
  }

  return (
    <div className="field-rows">
      <datalist id={namesId} aria-label={m.fields.existingNames}>
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
            <datalist id={valuesId} aria-label={m.fields.existingValues}>
              {known.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </datalist>
            <input
              aria-label={format(m.fields.nameLabel, { index: index + 1 })}
              list={namesId}
              value={field.name}
              maxLength={40}
              required
              placeholder={m.fields.namePlaceholder}
              aria-invalid={duplicate}
              title={duplicate ? m.fields.duplicate : undefined}
              onChange={(event) => update(index, { name: event.target.value })}
            />
            <input
              aria-label={format(m.fields.valueLabel, { index: index + 1 })}
              list={valuesId}
              value={field.value}
              maxLength={200}
              required
              placeholder={m.fields.valuePlaceholder}
              onChange={(event) => update(index, { value: event.target.value })}
            />
            <button
              type="button"
              className="ghost icon sm"
              aria-label={format(m.fields.removeLabel, { index: index + 1 })}
              title={m.fields.remove}
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
          <Icon name="plus" /> {m.fields.add}
        </button>
      </div>
    </div>
  );
}
