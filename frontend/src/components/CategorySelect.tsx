import { useApi } from "../api/useApi";
import { useI18n } from "../i18n";

export type Category = { id: string; name: string };

type Props = {
  id: string;
  value: string;
  onChange: (categoryId: string) => void;
  /**
   * Label of the empty option, e.g. "Alle Kategorien" for filters.
   */
  emptyLabel?: string;
  required?: boolean;
};

export function CategorySelect({ id, value, onChange, emptyLabel, required }: Props) {
  const { data: categories, error } = useApi<Category[]>("/api/categories");
  const { m } = useI18n();

  return (
    <>
      <select
        id={id}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{emptyLabel ?? m.misc.chooseCategory}</option>
        {categories?.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      {error && (
        <p className="hint" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
    </>
  );
}
