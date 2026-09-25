import type { SubmitEvent } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/permissions";
import { Icon } from "../components/icons";
import { UserTabs } from "../components/SettingsTabs";
import { Alert, Field, Modal, PageHeader, refreshNav } from "../components/ui";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  group: { id: string; name: string };
  authSource: "LOCAL" | "LDAP";
  mustChangePassword: boolean;
  createdAt: string;
};

type GroupSummary = {
  id: string;
  name: string;
  permissions: string[];
  isDefault: boolean;
  members: number;
};

const emptyForm = { name: "", email: "", password: "", groupId: "" };

export function AdminUsersPage() {
  const { user: me } = useAuth();
  const canManage = can(me, "users.manage");
  const canEmergency = can(me, "users.emergency");
  const canRules = can(me, "settings.rules");
  const { data: users, error: loadError, reload } = useApi<ManagedUser[]>("/api/users");
  const { data: groups } = useApi<GroupSummary[]>("/api/groups");
  const { data: policy } = useApi<{ registration: { enabled: boolean; domains: string[] } }>(
    canRules ? "/api/admin/settings/policy" : null
  );
  const [groupFilter, setGroupFilter] = useState("");
  const shownUsers = groupFilter ? users?.filter((user) => user.group.id === groupFilter) : users;
  const mine = new Set<string>(me?.permissions);
  // The API refuses groups with rights the actor lacks; the list says so up front.
  const grantable = (group: GroupSummary) =>
    group.permissions.every((permission) => mine.has(permission));
  const defaultGroup = groups?.find((group) => group.isDefault)?.id ?? groups?.[0]?.id ?? "";
  const [form, setForm] = useState(emptyForm);
  // null: closed; id null: creating; id set: editing that record.
  const [editor, setEditor] = useState<{ id: string | null } | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [info, setInfo] = useState("");
  const editingId = editor?.id ?? null;
  const editing = users?.find((user) => user.id === editingId);

  function open(user?: ManagedUser) {
    setForm(
      user
        ? { name: user.name, email: user.email, password: "", groupId: user.group.id }
        : { ...emptyForm, groupId: defaultGroup }
    );
    setFormError("");
    setEditor({ id: user?.id ?? null });
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    try {
      if (editingId) {
        await api(`/api/users/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name,
            groupId: form.groupId,
            ...(form.password ? { password: form.password } : {}),
          }),
        });
      } else {
        await api("/api/users", { method: "POST", body: JSON.stringify(form) });
      }
      setInfo(`Benutzer „${form.name}“ ${editingId ? "gespeichert" : "angelegt"}.`);
      setEditor(null);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  /**
   * Immediate measures for a misused or compromised account.
   */
  async function emergency(user: ManagedUser, action: "sessions" | "requests") {
    const question =
      action === "sessions"
        ? `„${user.name}“ auf allen Geräten sofort abmelden?`
        : `Alle offenen Anfragen von „${user.name}“ ablehnen? Es werden keine E-Mails verschickt.`;
    if (!window.confirm(question)) return;
    setFormError("");
    try {
      if (action === "sessions") {
        const result = await api<{ revoked: number }>(`/api/users/${user.id}/sessions/revoke`, {
          method: "POST",
        });
        setInfo(`„${user.name}“ abgemeldet (${result.revoked} Sitzungen).`);
      } else {
        const result = await api<{ rejected: number }>(
          `/api/users/${user.id}/requests/reject-open`,
          {
            method: "POST",
            body: JSON.stringify({ reason: "Von der Verwaltung gesammelt abgelehnt" }),
          }
        );
        setInfo(`${result.rejected} offene Anfragen von „${user.name}“ abgelehnt.`);
        refreshNav();
      }
      setEditor(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Aktion fehlgeschlagen");
    }
  }

  async function remove(user: ManagedUser) {
    if (
      !window.confirm(
        `Benutzer „${user.name}“ löschen?\n\nKonten mit Anfragen und das eigene Konto können nicht gelöscht werden, ebenso die letzte Person, die Gruppen verwalten darf.`
      )
    )
      return;
    setError("");
    setInfo("");
    try {
      await api(`/api/users/${user.id}`, { method: "DELETE" });
      setInfo(`Benutzer „${user.name}“ gelöscht.`);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
    }
  }

  return (
    <>
      <UserTabs />
      <PageHeader
        title="Benutzer"
        description="Konten anlegen, einer Gruppe zuordnen und Passwörter zurücksetzen. Was jemand darf, legt die Gruppe fest."
        actions={
          canManage && (
            <button
              type="button"
              onClick={() => open()}
              data-shortcut="new"
              title="Tastenkürzel: n"
            >
              <Icon name="plus" /> Benutzer anlegen
            </button>
          )
        }
      />
      {policy && (
        <p className="muted small page-note">
          Selbstregistrierung:{" "}
          {policy.registration.enabled
            ? `an${policy.registration.domains.length > 0 ? ` (nur ${policy.registration.domains.map((domain) => `@${domain}`).join(", ")})` : " (alle Adressen)"}`
            : "aus – Konten legen Sie hier an"}
          {" · "}
          <Link to="/admin/einstellungen">ändern</Link>
        </p>
      )}
      <Alert>{error || loadError}</Alert>
      <Alert tone="ok">{info}</Alert>
      {groups && groups.length > 1 && (
        <div className="toolbar">
          <Field label="Gruppe" htmlFor="user-group-filter">
            <select
              id="user-group-filter"
              value={groupFilter}
              onChange={(event) => setGroupFilter(event.target.value)}
            >
              <option value="">Alle Gruppen</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} ({group.members})
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>E-Mail</th>
              <th>Gruppe</th>
              <th>Anmeldung</th>
              <th>
                <span className="sr-only">Aktionen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shownUsers?.map((user) => (
              <tr key={user.id}>
                <td style={{ fontWeight: 550 }}>
                  {user.name}
                  {user.id === me?.id && <span className="muted small"> (Sie)</span>}
                </td>
                <td className="muted">{user.email}</td>
                <td>
                  <span className="tag">{user.group.name}</span>
                </td>
                <td className="muted">
                  {user.authSource === "LDAP" ? "Verzeichnis" : "Lokal"}
                  {user.mustChangePassword && (
                    <span className="badge st-open" title="Wird bei der nächsten Anmeldung ersetzt">
                      vorläufiges Passwort
                    </span>
                  )}
                </td>
                <td className="actions-cell">
                  <div className="actions">
                    {(canManage || canEmergency) && (
                      <button type="button" className="secondary sm" onClick={() => open(user)}>
                        {canManage ? "Bearbeiten" : "Maßnahmen"}
                      </button>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        className="danger sm"
                        disabled={user.id === me?.id}
                        onClick={() => void remove(user)}
                      >
                        Löschen
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editor && (
        <Modal
          variant="sheet"
          title={editingId ? "Benutzer bearbeiten" : "Benutzer anlegen"}
          description={editing?.email}
          onClose={() => setEditor(null)}
          footer={
            <>
              <button type="button" className="secondary" onClick={() => setEditor(null)}>
                Abbrechen
              </button>
              {canManage && (
                <button type="submit" form="user-form">
                  {editingId ? "Änderungen speichern" : "Benutzer anlegen"}
                </button>
              )}
            </>
          }
        >
          <Alert>{formError}</Alert>
          <form id="user-form" className="form-stack" onSubmit={(event) => void onSubmit(event)}>
            <fieldset className="plain-fieldset" disabled={!canManage}>
              <Field label="Name" htmlFor="user-name">
                <input
                  id="user-name"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  required
                  minLength={2}
                  maxLength={120}
                />
              </Field>
              <Field
                label="E-Mail"
                htmlFor="user-email"
                hint={editingId ? "Die E-Mail-Adresse kann nicht geändert werden." : undefined}
              >
                <input
                  id="user-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  required
                  disabled={Boolean(editingId)}
                  autoComplete="off"
                />
              </Field>
              <Field
                label={editingId ? "Neues Passwort" : "Passwort"}
                htmlFor="user-password"
                optional={Boolean(editingId)}
                hint={
                  editingId
                    ? editing?.authSource === "LDAP"
                      ? "Leer lassen, um nichts zu ändern. Ein neues Passwort macht aus dem Verzeichnis-Konto ein lokales Konto."
                      : "Leer lassen, um das Passwort nicht zu ändern."
                    : "Mindestens 8 Zeichen."
                }
              >
                <input
                  id="user-password"
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  required={!editingId}
                  minLength={8}
                  autoComplete="new-password"
                />
              </Field>
              <Field
                label="Gruppe"
                htmlFor="user-group"
                hint={
                  editingId === me?.id
                    ? "Die eigene Gruppe können Sie nicht ändern."
                    : "Die Gruppe legt fest, was die Person darf. Gruppen mit Rechten, die Sie selbst nicht haben, können Sie nicht vergeben."
                }
              >
                <select
                  id="user-group"
                  value={form.groupId}
                  onChange={(event) => setForm({ ...form, groupId: event.target.value })}
                  disabled={editingId === me?.id}
                  required
                >
                  {groups?.map((group) => (
                    <option
                      key={group.id}
                      value={group.id}
                      disabled={!grantable(group) && group.id !== editing?.group.id}
                    >
                      {group.name}
                      {group.isDefault ? " (Standard)" : ""}
                      {grantable(group) ? "" : " – mehr Rechte als Sie"}
                    </option>
                  ))}
                </select>
              </Field>
            </fieldset>
          </form>
          {editing && editing.id !== me?.id && canEmergency && (
            <div className="modal-section">
              <h3>Sofortmaßnahmen</h3>
              <p className="muted small">
                Bei Verdacht auf Missbrauch: Die Person verliert sofort den Zugang bzw. ihre offenen
                Anfragen blockieren keine Stücke mehr.
              </p>
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary sm"
                  onClick={() => void emergency(editing, "sessions")}
                >
                  Überall abmelden
                </button>
                <button
                  type="button"
                  className="danger sm"
                  onClick={() => void emergency(editing, "requests")}
                >
                  Offene Anfragen ablehnen
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
