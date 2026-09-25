import type { Role } from "../types";

import type { SubmitEvent } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { useAuth } from "../auth/AuthContext";
import { Icon } from "../components/icons";
import { Alert, Field, Modal, PageHeader, refreshNav } from "../components/ui";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  authSource: "LOCAL" | "LDAP";
  mustChangePassword: boolean;
  createdAt: string;
};

const emptyForm = { name: "", email: "", password: "", role: "USER" as Role };

export function AdminUsersPage() {
  const { user: me } = useAuth();
  const { data: users, error: loadError, reload } = useApi<ManagedUser[]>("/api/users");
  const { data: policy } = useApi<{ registration: { enabled: boolean; domains: string[] } }>(
    "/api/admin/settings/policy"
  );
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
      user ? { name: user.name, email: user.email, password: "", role: user.role } : emptyForm
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
            role: form.role,
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
        `Benutzer „${user.name}“ löschen?\n\nKonten mit Anfragen, das eigene Konto und der letzte Administrator können nicht gelöscht werden.`
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
      <PageHeader
        title="Benutzer"
        description="Lokale Konten anlegen, Rollen vergeben und Passwörter zurücksetzen."
        actions={
          <button type="button" onClick={() => open()} data-shortcut="new" title="Tastenkürzel: n">
            <Icon name="plus" /> Benutzer anlegen
          </button>
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
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>E-Mail</th>
              <th>Rolle</th>
              <th>Anmeldung</th>
              <th>
                <span className="sr-only">Aktionen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users?.map((user) => (
              <tr key={user.id}>
                <td style={{ fontWeight: 550 }}>
                  {user.name}
                  {user.id === me?.id && <span className="muted small"> (Sie)</span>}
                </td>
                <td className="muted">{user.email}</td>
                <td>
                  {user.role === "ADMIN" ? (
                    <span className="badge st-borrowed">Verwaltung</span>
                  ) : (
                    <span className="tag">Nutzer</span>
                  )}
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
                    <button type="button" className="secondary sm" onClick={() => open(user)}>
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      className="danger sm"
                      disabled={user.id === me?.id}
                      onClick={() => void remove(user)}
                    >
                      Löschen
                    </button>
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
              <button type="submit" form="user-form">
                {editingId ? "Änderungen speichern" : "Benutzer anlegen"}
              </button>
            </>
          }
        >
          <Alert>{formError}</Alert>
          <form id="user-form" className="form-stack" onSubmit={(event) => void onSubmit(event)}>
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
              label="Rolle"
              htmlFor="user-role"
              hint="Die Verwaltung kann Anfragen bestätigen und Stammdaten pflegen."
            >
              <select
                id="user-role"
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value as Role })}
                disabled={editingId === me?.id}
              >
                <option value="USER">Nutzer</option>
                <option value="ADMIN">Verwaltung</option>
              </select>
            </Field>
          </form>
          {editing && editing.id !== me?.id && (
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
