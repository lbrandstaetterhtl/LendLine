import type { SubmitEvent } from "react";
import { useState } from "react";

import { api } from "../api/client";
import { errorMessage, useApi } from "../api/useApi";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/permissions";
import { Icon } from "../components/icons";
import { UserTabs } from "../components/SettingsTabs";
import { Alert, Field, Modal, PageHeader } from "../components/ui";
import { useFeature } from "../ui/UiContext";

type Group = {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  borrowCategoryIds: string[];
  manageCategoryIds: string[];
  maxDays: number | null;
  maxOpenPerUser: number | null;
  autoApprove: boolean | null;
  ldapGroupDns: string[];
  isDefault: boolean;
  sortOrder: number;
  members: number;
};

type PermissionSection = {
  title: string;
  permissions: { key: string; label: string; hint?: string }[];
};

type Category = { id: string; name: string };

type GroupForm = Omit<Group, "id" | "members">;

const emptyForm: GroupForm = {
  name: "",
  description: "",
  permissions: ["catalog.view", "requests.create"],
  borrowCategoryIds: [],
  manageCategoryIds: [],
  maxDays: null,
  maxOpenPerUser: null,
  autoApprove: null,
  ldapGroupDns: [],
  isDefault: false,
  sortOrder: 10,
};

// Mirrors `implied` in backend/src/lib/permissions.ts: ticking one right ticks what it needs.
const implied: Record<string, string[]> = {
  "requests.create": ["catalog.view"],
  "requests.decide": ["requests.view"],
  "loans.manage": ["requests.view"],
  "devices.manage": ["catalog.view"],
  "devices.images": ["catalog.view"],
  "devices.defective": ["catalog.view"],
  "users.manage": ["users.view"],
  "users.emergency": ["users.view"],
  "groups.manage": ["users.view"],
};

function withImplied(keys: Iterable<string>): Set<string> {
  const result = new Set<string>();
  const add = (key: string) => {
    if (result.has(key)) return;
    result.add(key);
    for (const next of implied[key] ?? []) add(next);
  };
  for (const key of keys) add(key);
  return result;
}

/**
 * Rights ticked only because another ticked right needs them (shown ticked and locked).
 */
function requiredBy(selected: Set<string>, key: string): string[] {
  return [...selected].filter((other) => other !== key && (implied[other] ?? []).includes(key));
}

export function AdminGroupsPage() {
  const { user: me } = useAuth();
  const editable = can(me, "groups.manage");
  const advanced = useFeature("groups.advanced");
  const { data: groups, error, reload } = useApi<Group[]>("/api/groups");
  const { data: sections } = useApi<PermissionSection[]>("/api/groups/permissions");
  const { data: categories } = useApi<Category[]>("/api/categories");
  const [editor, setEditor] = useState<{ id: string | null; form: GroupForm } | null>(null);
  const [deleting, setDeleting] = useState<Group | null>(null);
  const [info, setInfo] = useState("");
  const labels = new Map(
    (sections ?? []).flatMap((section) => section.permissions.map((p) => [p.key, p.label] as const))
  );
  const total = labels.size;

  function open(group?: Group) {
    if (!group) {
      setEditor({ id: null, form: emptyForm });
      return;
    }
    const { id, members: _members, ...form } = group;
    setEditor({ id, form });
  }

  function duplicate(group: Group) {
    const { id: _id, members: _members, ...form } = group;
    setEditor({ id: null, form: { ...form, name: `${group.name} (Kopie)`, isDefault: false } });
  }

  return (
    <>
      <UserTabs />
      <PageHeader
        title="Gruppen und Rechte"
        description="Jede Person gehört zu genau einer Gruppe. Die Gruppe legt fest, was sie sehen und tun darf, aus welchen Kategorien sie ausleiht und welche sie verwaltet."
        actions={
          editable && (
            <button
              type="button"
              onClick={() => open()}
              data-shortcut="new"
              title="Tastenkürzel: n"
            >
              <Icon name="plus" /> Gruppe anlegen
            </button>
          )
        }
      />
      <Alert>{error}</Alert>
      <Alert tone="ok">{info}</Alert>
      <div className="group-list">
        {groups?.map((group) => (
          <section className="card group-card" key={group.id}>
            <div className="card-title">
              <h2>
                {group.name}
                {group.isDefault && (
                  <span className="badge st-returned" title="Neue Konten landen hier">
                    Standard
                  </span>
                )}
              </h2>
              <span className="muted small">
                {group.members} {group.members === 1 ? "Mitglied" : "Mitglieder"}
              </span>
            </div>
            {group.description && <p className="muted small">{group.description}</p>}
            <p className="small">
              <strong>
                {group.permissions.length} von {total} Rechten
              </strong>
              {group.permissions.length > 0 && (
                <span className="muted">
                  {" "}
                  ·{" "}
                  {group.permissions
                    .slice(0, 4)
                    .map((key) => labels.get(key) ?? key)
                    .join(", ")}
                  {group.permissions.length > 4 ? " …" : ""}
                </span>
              )}
            </p>
            {advanced && (
              <ScopeLine label="Leiht aus" ids={group.borrowCategoryIds} categories={categories} />
            )}
            {advanced && group.manageCategoryIds.length > 0 && (
              <ScopeLine label="Verwaltet" ids={group.manageCategoryIds} categories={categories} />
            )}
            <div className="form-actions">
              <button type="button" className="secondary sm" onClick={() => open(group)}>
                {editable ? "Bearbeiten" : "Ansehen"}
              </button>
              {editable && (
                <>
                  <button type="button" className="ghost sm" onClick={() => duplicate(group)}>
                    Kopieren
                  </button>
                  {!group.isDefault && (
                    <button type="button" className="ghost sm" onClick={() => setDeleting(group)}>
                      Löschen
                    </button>
                  )}
                </>
              )}
            </div>
          </section>
        ))}
      </div>

      {editor && sections && (
        <GroupEditor
          id={editor.id}
          initial={editor.form}
          sections={sections}
          categories={categories ?? []}
          readOnly={!editable}
          myPermissions={new Set(me?.permissions)}
          onClose={() => setEditor(null)}
          onSaved={(message) => {
            setEditor(null);
            setInfo(message);
            reload();
          }}
        />
      )}
      {deleting && groups && (
        <DeleteGroup
          group={deleting}
          groups={groups}
          onClose={() => setDeleting(null)}
          onDeleted={(message) => {
            setDeleting(null);
            setInfo(message);
            reload();
          }}
        />
      )}
    </>
  );
}

function ScopeLine({
  label,
  ids,
  categories,
}: {
  label: string;
  ids: string[];
  categories: Category[] | null;
}) {
  const names = ids.map((id) => categories?.find((category) => category.id === id)?.name ?? "…");
  return (
    <p className="muted small" style={{ margin: "4px 0 0" }}>
      {label}: {ids.length === 0 ? "alle Kategorien" : names.join(", ")}
    </p>
  );
}

function GroupEditor({
  id,
  initial,
  sections,
  categories,
  readOnly,
  myPermissions,
  onClose,
  onSaved,
}: {
  id: string | null;
  initial: GroupForm;
  sections: PermissionSection[];
  categories: Category[];
  readOnly: boolean;
  myPermissions: Set<string>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [form, setForm] = useState<GroupForm>({
    ...initial,
    permissions: [...withImplied(initial.permissions)],
  });
  const [dns, setDns] = useState(initial.ldapGroupDns.join("\n"));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const selected = new Set(form.permissions);
  const advanced = useFeature("groups.advanced");
  const had = new Set(initial.permissions);

  function toggle(key: string, on: boolean) {
    const next = new Set(form.permissions);
    if (on) for (const item of withImplied([key])) next.add(item);
    else next.delete(key);
    setForm({ ...form, permissions: [...withImplied(next)] });
  }

  function setSection(section: PermissionSection, on: boolean) {
    const next = new Set(form.permissions);
    for (const permission of section.permissions) {
      // Only rights one may hand out; the others stay as they were.
      if (!on) next.delete(permission.key);
      else if (myPermissions.has(permission.key) || had.has(permission.key))
        next.add(permission.key);
    }
    setForm({ ...form, permissions: [...withImplied(next)] });
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const body = {
      ...form,
      ldapGroupDns: dns
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    };
    try {
      await api(id ? `/api/groups/${id}` : "/api/groups", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      onSaved(`Gruppe „${form.name}“ ${id ? "gespeichert" : "angelegt"}.`);
    } catch (err) {
      setError(errorMessage(err, "Speichern fehlgeschlagen"));
      setSaving(false);
    }
  }

  return (
    <Modal
      variant="sheet"
      title={readOnly ? form.name : id ? "Gruppe bearbeiten" : "Gruppe anlegen"}
      description={id ? initial.name : "Name, Rechte und Grenzen der neuen Gruppe."}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="secondary" onClick={onClose}>
            {readOnly ? "Schließen" : "Abbrechen"}
          </button>
          {!readOnly && (
            <button type="submit" form="group-form" disabled={saving}>
              {id ? "Änderungen speichern" : "Gruppe anlegen"}
            </button>
          )}
        </>
      }
    >
      <Alert>{error}</Alert>
      <form id="group-form" onSubmit={(event) => void onSubmit(event)}>
        <fieldset className="plain-fieldset" disabled={readOnly}>
          <section className="form-section">
            <h3>Allgemein</h3>
            <div className="form-grid cols-2">
              <Field label="Name" htmlFor="group-name">
                <input
                  id="group-name"
                  value={form.name}
                  minLength={2}
                  maxLength={60}
                  required
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </Field>
              <Field label="Reihenfolge" htmlFor="group-order" hint="Kleinere Zahlen stehen oben.">
                <input
                  id="group-order"
                  type="number"
                  min={0}
                  max={1000}
                  value={form.sortOrder}
                  onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })}
                />
              </Field>
              <Field
                label="Beschreibung"
                htmlFor="group-description"
                optional
                className="span-full"
              >
                <input
                  id="group-description"
                  value={form.description}
                  maxLength={300}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </Field>
              <label className="check span-full" htmlFor="group-default">
                <input
                  id="group-default"
                  type="checkbox"
                  checked={form.isDefault}
                  disabled={initial.isDefault}
                  onChange={(event) => setForm({ ...form, isDefault: event.target.checked })}
                />
                Standardgruppe: neue Konten (Registrierung, erste Verzeichnis-Anmeldung) landen hier
              </label>
            </div>
          </section>

          <section className="form-section">
            <h3>Rechte</h3>
            <p className="hint">
              {selected.size} Rechte gewählt. Rechte, die ein anderes voraussetzt, werden
              mitgesetzt. Rechte, die Sie selbst nicht haben, können Sie nicht vergeben.
            </p>
            {sections.map((section) => {
              const all = section.permissions.every((permission) => selected.has(permission.key));
              return (
                <fieldset className="permission-section" key={section.title}>
                  <legend>
                    {section.title}
                    {!readOnly && (
                      <button
                        type="button"
                        className="ghost sm"
                        onClick={() => setSection(section, !all)}
                      >
                        {all ? "Keine" : "Alle"}
                      </button>
                    )}
                  </legend>
                  {section.permissions.map((permission) => {
                    const needers = requiredBy(selected, permission.key);
                    const locked = needers.length > 0;
                    const forbidden =
                      !myPermissions.has(permission.key) && !had.has(permission.key);
                    return (
                      <label
                        className={`permission${forbidden ? " is-forbidden" : ""}`}
                        key={permission.key}
                        htmlFor={`perm-${permission.key}`}
                        title={
                          forbidden
                            ? "Dieses Recht haben Sie selbst nicht"
                            : locked
                              ? "Wird für ein anderes gewähltes Recht gebraucht"
                              : undefined
                        }
                      >
                        <input
                          id={`perm-${permission.key}`}
                          type="checkbox"
                          checked={selected.has(permission.key)}
                          disabled={locked || (forbidden && !selected.has(permission.key))}
                          onChange={(event) => toggle(permission.key, event.target.checked)}
                        />
                        <span>
                          <strong>{permission.label}</strong>
                          {permission.hint && <span className="hint">{permission.hint}</span>}
                          {locked && (
                            <span className="hint">
                              Nötig für:{" "}
                              {needers
                                .map(
                                  (key) =>
                                    sections
                                      .flatMap((s) => s.permissions)
                                      .find((p) => p.key === key)?.label ?? key
                                )
                                .join(", ")}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              );
            })}
          </section>

          {advanced && (
            <>
              <section className="form-section">
                <h3>Kategorien</h3>
                <div className="form-grid cols-2">
                  <CategoryScope
                    label="Darf ausleihen aus"
                    hint="Nichts gewählt: aus allen Kategorien. Andere Kategorien sieht die Gruppe im Katalog nicht."
                    categories={categories}
                    value={form.borrowCategoryIds}
                    onChange={(borrowCategoryIds) => setForm({ ...form, borrowCategoryIds })}
                  />
                  <CategoryScope
                    label="Verwaltet"
                    hint="Gilt für Anfragen, Rückgaben, Geräte und Bilder. Nichts gewählt: alle Kategorien."
                    categories={categories}
                    value={form.manageCategoryIds}
                    onChange={(manageCategoryIds) => setForm({ ...form, manageCategoryIds })}
                  />
                </div>
              </section>

              <section className="form-section">
                <h3>Ausleihregeln dieser Gruppe</h3>
                <p className="hint">
                  Leer lassen: es gilt die Einstellung unter „Regeln & Formular“.
                </p>
                <div className="form-grid cols-2">
                  <Field label="Höchstdauer (Tage)" htmlFor="group-days" optional>
                    <input
                      id="group-days"
                      type="number"
                      min={1}
                      max={365}
                      value={form.maxDays ?? ""}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          maxDays: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                    />
                  </Field>
                  <Field label="Offene Anfragen pro Person" htmlFor="group-open" optional>
                    <input
                      id="group-open"
                      type="number"
                      min={1}
                      max={100}
                      value={form.maxOpenPerUser ?? ""}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          maxOpenPerUser: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                    />
                  </Field>
                  <Field label="Automatisch bestätigen" htmlFor="group-auto">
                    <select
                      id="group-auto"
                      value={form.autoApprove === null ? "" : String(form.autoApprove)}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          autoApprove:
                            event.target.value === "" ? null : event.target.value === "true",
                        })
                      }
                    >
                      <option value="">Wie allgemein eingestellt</option>
                      <option value="true">Ja</option>
                      <option value="false">Nein</option>
                    </select>
                  </Field>
                </div>
              </section>

              <section className="form-section">
                <h3>Verzeichnis (LDAP)</h3>
                <Field
                  label="Verzeichnisgruppen"
                  htmlFor="group-dns"
                  optional
                  hint="Eine vollständige DN pro Zeile, z. B. CN=IT-Team,OU=Groups,DC=firma,DC=de. Wer bei der Anmeldung Mitglied ist, kommt in diese Gruppe."
                >
                  <textarea
                    id="group-dns"
                    value={dns}
                    onChange={(event) => setDns(event.target.value)}
                    spellCheck={false}
                  />
                </Field>
              </section>
            </>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}

function CategoryScope({
  label,
  hint,
  categories,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  categories: Category[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const chosen = new Set(value);
  return (
    <fieldset className="category-scope">
      <legend>{label}</legend>
      <p className="hint">{hint}</p>
      {categories.map((category) => (
        <label className="check" key={category.id} htmlFor={`${label}-${category.id}`}>
          <input
            id={`${label}-${category.id}`}
            type="checkbox"
            checked={chosen.has(category.id)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...value, category.id]
                  : value.filter((id) => id !== category.id)
              )
            }
          />
          {category.name}
        </label>
      ))}
      {categories.length === 0 && <p className="muted small">Noch keine Kategorien.</p>}
    </fieldset>
  );
}

function DeleteGroup({
  group,
  groups,
  onClose,
  onDeleted,
}: {
  group: Group;
  groups: Group[];
  onClose: () => void;
  onDeleted: (message: string) => void;
}) {
  const others = groups.filter((other) => other.id !== group.id);
  const [moveTo, setMoveTo] = useState(
    others.find((other) => other.isDefault)?.id ?? others[0]?.id ?? ""
  );
  const [error, setError] = useState("");

  async function confirm() {
    setError("");
    try {
      const query = group.members > 0 ? `?moveTo=${encodeURIComponent(moveTo)}` : "";
      await api(`/api/groups/${group.id}${query}`, { method: "DELETE" });
      onDeleted(`Gruppe „${group.name}“ gelöscht.`);
    } catch (err) {
      setError(errorMessage(err, "Löschen fehlgeschlagen"));
    }
  }

  return (
    <Modal
      title={`Gruppe „${group.name}“ löschen`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" className="secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="danger" onClick={() => void confirm()}>
            Löschen
          </button>
        </>
      }
    >
      <Alert>{error}</Alert>
      {group.members > 0 ? (
        <Field
          label={`${group.members} ${group.members === 1 ? "Mitglied wechselt" : "Mitglieder wechseln"} in die Gruppe`}
          htmlFor="group-move"
        >
          <select
            id="group-move"
            value={moveTo}
            onChange={(event) => setMoveTo(event.target.value)}
          >
            {others.map((other) => (
              <option key={other.id} value={other.id}>
                {other.name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <p>Die Gruppe hat keine Mitglieder.</p>
      )}
    </Modal>
  );
}
