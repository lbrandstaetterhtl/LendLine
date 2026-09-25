import type { SubmitEvent } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/permissions";
import { useTerms } from "../branding/BrandingContext";
import { Icon } from "../components/icons";
import { UserTabs } from "../components/SettingsTabs";
import { Alert, Field, Modal, PageHeader, refreshNav } from "../components/ui";
import { format, useI18n } from "../i18n";

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
  const { m } = useI18n();
  const t = m.users;
  const terms = useTerms();
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
      setInfo(format(editingId ? t.saved : t.created, { name: form.name }));
      setEditor(null);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t.saveFailed);
    }
  }

  /**
   * Immediate measures for a misused or compromised account.
   */
  async function emergency(user: ManagedUser, action: "sessions" | "requests") {
    const question =
      action === "sessions"
        ? format(t.confirmSignOut, { name: user.name })
        : format(t.confirmRejectOpen, { name: user.name });
    if (!window.confirm(question)) return;
    setFormError("");
    try {
      if (action === "sessions") {
        const result = await api<{ revoked: number }>(`/api/users/${user.id}/sessions/revoke`, {
          method: "POST",
        });
        setInfo(format(t.signedOut, { name: user.name, count: result.revoked }));
      } else {
        const result = await api<{ rejected: number }>(
          `/api/users/${user.id}/requests/reject-open`,
          {
            method: "POST",
            body: JSON.stringify({ reason: t.bulkReason }),
          }
        );
        setInfo(format(t.rejectedOpen, { name: user.name, count: result.rejected }));
        refreshNav();
      }
      setEditor(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t.actionFailed);
    }
  }

  async function remove(user: ManagedUser) {
    if (!window.confirm(format(t.confirmDelete, { name: user.name }))) return;
    setError("");
    setInfo("");
    try {
      await api(`/api/users/${user.id}`, { method: "DELETE" });
      setInfo(format(t.deleted, { name: user.name }));
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.deleteFailed);
    }
  }

  return (
    <>
      <UserTabs />
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          canManage && (
            <button
              type="button"
              onClick={() => open()}
              data-shortcut="new"
              title={m.categories.shortcutNew}
            >
              <Icon name="plus" /> {t.create}
            </button>
          )
        }
      />
      {policy && (
        <p className="muted small page-note">
          {t.registration}{" "}
          {policy.registration.enabled
            ? policy.registration.domains.length > 0
              ? format(t.registrationOnly, {
                  domains: policy.registration.domains.map((domain) => `@${domain}`).join(", "),
                })
              : t.registrationAll
            : t.registrationOff}
          {" · "}
          <Link to="/admin/einstellungen">{t.change}</Link>
        </p>
      )}
      <Alert>{error || loadError}</Alert>
      <Alert tone="ok">{info}</Alert>
      {groups && groups.length > 1 && (
        <div className="toolbar">
          <Field label={t.group} htmlFor="user-group-filter">
            <select
              id="user-group-filter"
              value={groupFilter}
              onChange={(event) => setGroupFilter(event.target.value)}
            >
              <option value="">{t.allGroups}</option>
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
              <th>{t.name}</th>
              <th>{t.email}</th>
              <th>{t.group}</th>
              <th>{t.signIn}</th>
              <th>
                <span className="sr-only">{m.table.actions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shownUsers?.map((user) => (
              <tr key={user.id}>
                <td style={{ fontWeight: 550 }}>
                  {user.name}
                  {user.id === me?.id && <span className="muted small"> {t.you}</span>}
                </td>
                <td className="muted">{user.email}</td>
                <td>
                  <span className="tag">{user.group.name}</span>
                </td>
                <td className="muted">
                  {user.authSource === "LDAP" ? t.directory : t.local}
                  {user.mustChangePassword && (
                    <span className="badge st-open" title={t.temporaryTitle}>
                      {t.temporary}
                    </span>
                  )}
                </td>
                <td className="actions-cell">
                  <div className="actions">
                    {(canManage || canEmergency) && (
                      <button type="button" className="secondary sm" onClick={() => open(user)}>
                        {canManage ? m.common.edit : t.measures}
                      </button>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        className="danger sm"
                        disabled={user.id === me?.id}
                        onClick={() => void remove(user)}
                      >
                        {m.common.delete}
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
          title={editingId ? t.edit : t.create}
          description={editing?.email}
          onClose={() => setEditor(null)}
          footer={
            <>
              <button type="button" className="secondary" onClick={() => setEditor(null)}>
                {m.common.cancel}
              </button>
              {canManage && (
                <button type="submit" form="user-form">
                  {editingId ? t.saveChanges : t.create}
                </button>
              )}
            </>
          }
        >
          <Alert>{formError}</Alert>
          <form id="user-form" className="form-stack" onSubmit={(event) => void onSubmit(event)}>
            <fieldset className="plain-fieldset" disabled={!canManage}>
              <Field label={t.name} htmlFor="user-name">
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
                label={t.email}
                htmlFor="user-email"
                hint={editingId ? t.emailFixed : undefined}
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
                label={editingId ? t.newPassword : t.password}
                htmlFor="user-password"
                optional={Boolean(editingId)}
                hint={
                  editingId
                    ? editing?.authSource === "LDAP"
                      ? t.passwordKeepLdap
                      : t.passwordKeep
                    : t.passwordMin
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
                label={t.group}
                htmlFor="user-group"
                hint={editingId === me?.id ? t.ownGroup : t.groupHint}
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
                      {group.isDefault ? t.default : ""}
                      {grantable(group) ? "" : t.moreRights}
                    </option>
                  ))}
                </select>
              </Field>
            </fieldset>
          </form>
          {editing && editing.id !== me?.id && canEmergency && (
            <div className="modal-section">
              <h3>{t.emergency}</h3>
              <p className="muted small">{format(t.emergencyHint, { units: terms.units })}</p>
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary sm"
                  onClick={() => void emergency(editing, "sessions")}
                >
                  {t.signOutEverywhere}
                </button>
                <button
                  type="button"
                  className="danger sm"
                  onClick={() => void emergency(editing, "requests")}
                >
                  {t.rejectOpen}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
