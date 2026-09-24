import type { Category } from "../components/CategorySelect";

import type { SubmitEvent } from "react";
import { useState } from "react";

import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { Icon } from "../components/icons";
import { Alert, Field, PageHeader } from "../components/ui";

export function AdminCategoriesPage() {
  const { data: categories, error: loadError, reload } = useApi<Category[]>("/api/categories");
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

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
        setInfo(`Kategorie „${name}“ gespeichert.`);
      } else {
        await api("/api/categories", { method: "POST", body: JSON.stringify({ name }) });
        setInfo(`Kategorie „${name}“ angelegt.`);
      }
      reset();
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  async function remove(category: Category) {
    if (
      !window.confirm(
        `Kategorie „${category.name}“ löschen?\n\nDas geht nur, wenn kein Gerät sie verwendet.`
      )
    )
      return;
    setError("");
    setInfo("");
    try {
      await api(`/api/categories/${category.id}`, { method: "DELETE" });
      setInfo(`Kategorie „${category.name}“ gelöscht.`);
      if (editingId === category.id) reset();
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
    }
  }

  return (
    <>
      <PageHeader title="Kategorien" description="Feste Auswahl für die Zuordnung von Geräten." />
      <Alert>{error || loadError}</Alert>
      <Alert tone="ok">{info}</Alert>
      <form className="panel" onSubmit={(event) => void onSubmit(event)}>
        <div className="form-row">
          <Field
            label={editingId ? "Kategorie umbenennen" : "Neue Kategorie"}
            htmlFor="category-name"
          >
            <input
              id="category-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              maxLength={80}
              placeholder="z. B. Dockingstation"
            />
          </Field>
          <div className="actions">
            {editingId && (
              <button type="button" className="secondary" onClick={reset}>
                Abbrechen
              </button>
            )}
            <button type="submit">
              {editingId ? (
                "Speichern"
              ) : (
                <>
                  <Icon name="plus" /> Anlegen
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
              <th>Name</th>
              <th>
                <span className="sr-only">Aktionen</span>
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
                      Umbenennen
                    </button>
                    <button
                      type="button"
                      className="danger sm"
                      onClick={() => void remove(category)}
                    >
                      Löschen
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {categories?.length === 0 && (
              <tr>
                <td colSpan={2} className="empty">
                  Keine Kategorien.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
