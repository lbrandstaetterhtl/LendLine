import type { Category } from "../components/CategorySelect";

import type { SubmitEvent } from "react";
import { useState } from "react";

import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { Icon } from "../components/icons";
import { Alert, Field, PageHeader } from "../components/ui";
import { format, useI18n } from "../i18n";

export function AdminCategoriesPage() {
  const { data: categories, error: loadError, reload } = useApi<Category[]>("/api/categories");
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const { m } = useI18n();
  const t = m.categories;

  function reset() {
    setEditingId(null);
    setName("");
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setInfo("");
    try {
      if (editingId) {
        await api(`/api/categories/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({ name }),
        });
        setInfo(format(t.saved, { name }));
      } else {
        await api("/api/categories", { method: "POST", body: JSON.stringify({ name }) });
        setInfo(format(t.created, { name }));
      }
      reset();
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.saveFailed);
    }
  }

  async function remove(category: Category) {
    if (!window.confirm(format(t.confirmDelete, { name: category.name }))) return;
    setError("");
    setInfo("");
    try {
      await api(`/api/categories/${category.id}`, { method: "DELETE" });
      setInfo(format(t.deleted, { name: category.name }));
      if (editingId === category.id) reset();
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.deleteFailed);
    }
  }

  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <Alert>{error || loadError}</Alert>
      <Alert tone="ok">{info}</Alert>
      <form className="panel" onSubmit={(event) => void onSubmit(event)}>
        <div className="form-row">
          <Field label={editingId ? t.rename : t.new} htmlFor="category-name">
            <input
              id="category-name"
              data-shortcut="new"
              title={t.shortcutNew}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              maxLength={80}
              placeholder={t.placeholder}
            />
          </Field>
          <div className="actions">
            {editingId && (
              <button type="button" className="secondary" onClick={reset}>
                {m.common.cancel}
              </button>
            )}
            <button type="submit">
              {editingId ? (
                m.common.save
              ) : (
                <>
                  <Icon name="plus" /> {m.common.create}
                </>
              )}
            </button>
          </div>
        </div>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t.name}</th>
              <th>
                <span className="sr-only">{m.table.actions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {categories?.map((category) => (
              <tr key={category.id}>
                <td>{category.name}</td>
                <td className="actions-cell">
                  <div className="actions">
                    <button
                      type="button"
                      className="secondary sm"
                      onClick={() => {
                        setEditingId(category.id);
                        setName(category.name);
                      }}
                    >
                      {t.renameAction}
                    </button>
                    <button
                      type="button"
                      className="danger sm"
                      onClick={() => void remove(category)}
                    >
                      {m.common.delete}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {categories?.length === 0 && (
              <tr>
                <td colSpan={2} className="empty">
                  {t.none}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
