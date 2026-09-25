import { NavLink } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { canOpen } from "../auth/permissions";

type Tab = { to: string; label: string };

/**
 * Tabs of one menu entry. Each tab is its own page with its own address, so bookmarks and shortcuts
 * keep working; tabs the person may not open are left out.
 */
function PageTabs({ title, tabs }: { title: string; tabs: Tab[] }) {
  const { user } = useAuth();
  const shown = tabs.filter((tab) => canOpen(user, tab.to));
  if (shown.length < 2) return null;
  return (
    <nav className="settings-tabs" aria-label={title}>
      <span className="settings-tabs-title">{title}</span>
      <div className="settings-tabs-list">
        {shown.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end>
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function SettingsTabs() {
  return (
    <PageTabs
      title="Einstellungen"
      tabs={[
        { to: "/admin/erscheinungsbild", label: "Erscheinungsbild" },
        { to: "/admin/einstellungen", label: "Regeln & Formular" },
        { to: "/admin/emails", label: "E-Mails" },
        { to: "/admin/wartung", label: "Wartung" },
      ]}
    />
  );
}

export function UserTabs() {
  return (
    <PageTabs
      title="Benutzer"
      tabs={[
        { to: "/admin/users", label: "Benutzer" },
        { to: "/admin/gruppen", label: "Gruppen und Rechte" },
      ]}
    />
  );
}
