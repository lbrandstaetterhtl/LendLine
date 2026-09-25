import { NavLink } from "react-router-dom";

import { useI18n } from "../i18n";
import { useCanOpen } from "../ui/UiContext";

type Tab = { to: string; label: string };

/**
 * Tabs of one menu entry. Each tab is its own page with its own address, so bookmarks and shortcuts
 * keep working; tabs the person may not open are left out.
 */
function PageTabs({ title, tabs }: { title: string; tabs: Tab[] }) {
  const openable = useCanOpen();
  const shown = tabs.filter((tab) => openable(tab.to));
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
  const { m } = useI18n();
  return (
    <PageTabs
      title={m.nav.settings}
      tabs={[
        { to: "/admin/modus", label: m.nav.tabMode },
        { to: "/admin/erscheinungsbild", label: m.nav.tabAppearance },
        { to: "/admin/einstellungen", label: m.nav.tabRules },
        { to: "/admin/emails", label: m.nav.tabMail },
        { to: "/admin/wartung", label: m.nav.tabMaintenance },
      ]}
    />
  );
}

export function UserTabs() {
  const { m } = useI18n();
  return (
    <PageTabs
      title={m.nav.users}
      tabs={[
        { to: "/admin/users", label: m.nav.users },
        { to: "/admin/gruppen", label: m.nav.tabGroups },
      ]}
    />
  );
}
