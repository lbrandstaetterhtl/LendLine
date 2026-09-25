import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/admin/erscheinungsbild", label: "Erscheinungsbild" },
  { to: "/admin/einstellungen", label: "Regeln & Formular" },
  { to: "/admin/emails", label: "E-Mails" },
  { to: "/admin/wartung", label: "Wartung" },
];

/**
 * The tabs of "Einstellungen". Each tab is its own page with its own address, so bookmarks,
 * shortcuts and the maintenance banner keep working.
 */
export function SettingsTabs() {
  return (
    <nav className="settings-tabs" aria-label="Einstellungen">
      <span className="settings-tabs-title">Einstellungen</span>
      <div className="settings-tabs-list">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end>
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
