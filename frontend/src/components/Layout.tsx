import type { Messages } from "../i18n/de";

import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useApi } from "../api/useApi";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/permissions";
import { type Terms, useBranding, useTerms } from "../branding/BrandingContext";
import { format, useI18n } from "../i18n";
import { goKeyFor, goShortcuts, isTyping } from "../shortcuts";
import { useCanOpen } from "../ui/UiContext";
import { Icon, type IconName } from "./icons";
import { LanguageSwitch } from "./LanguageSwitch";
import { BrandLogo, LogoMark, Wordmark } from "./Logo";
import { ThemeSwitch } from "./ThemeSwitch";
import { NAV_REFRESH_EVENT } from "./ui";

type NavItem = {
  to: string;
  /**
   * Text in the current language, with the company's terms ("Stück" → "Ausrüstung").
   */
  label: (m: Messages, terms: Terms) => string;
  icon: IconName;
  end?: boolean;
  count?: "openRequests" | "activeLoans";
  /**
   * Further paths that belong to this entry (the tabs of one page).
   */
  alsoActiveOn?: string[];
};

const lendLinks: NavItem[] = [
  {
    to: "/search",
    label: (m, terms) => format(m.nav.searchUnits, { unit: terms.unit }),
    icon: "search",
  },
  { to: "/devices", label: (_m, terms) => terms.catalog, icon: "box", end: true },
  { to: "/my-requests", label: (m) => m.nav.myRequests, icon: "list" },
];

const adminLinks: NavItem[] = [
  { to: "/admin", label: (m) => m.nav.overview, icon: "home", end: true },
  { to: "/admin/requests", label: (m) => m.nav.requests, icon: "inbox", count: "openRequests" },
  { to: "/admin/borrowed", label: (m) => m.nav.loans, icon: "clock", count: "activeLoans" },
];

const adminDataLinks: NavItem[] = [
  { to: "/admin/devices", label: (_m, terms) => terms.devices, icon: "box" },
  { to: "/admin/categories", label: (m) => m.nav.categories, icon: "tag" },
  { to: "/admin/rooms", label: (_m, terms) => terms.rooms, icon: "door" },
  {
    to: "/admin/users",
    label: (m) => m.nav.users,
    icon: "users",
    alsoActiveOn: ["/admin/users", "/admin/gruppen"],
  },
];

// One entry for everything that configures the installation; the pages are tabs of it
// (components/SettingsTabs.tsx), and their old addresses stay valid.
export const settingsPaths = [
  "/admin/modus",
  "/admin/erscheinungsbild",
  "/admin/einstellungen",
  "/admin/emails",
  "/admin/wartung",
];

const adminSystemLinks: NavItem[] = [
  { to: "/admin/protokoll", label: (m) => m.nav.audit, icon: "file" },
  {
    to: "/admin/erscheinungsbild",
    label: (m) => m.nav.settings,
    icon: "sliders",
    alsoActiveOn: settingsPaths,
  },
];

/**
 * Global keys: "?" help, "/" search field, "n" create, "g" + letter to jump to a page. Dialogs
 * handle their own keys; while one is open (or a field has focus) nothing fires here.
 */
function useShortcuts(openable: (path: string) => boolean) {
  const navigate = useNavigate();
  useEffect(() => {
    let goPending = 0;
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target) || document.querySelector("dialog[open]")) return;
      const main = document.getElementById("inhalt");
      if (goPending && Date.now() - goPending < 1500) {
        goPending = 0;
        const target = goShortcuts.find(
          (shortcut) => shortcut.key === event.key.toLowerCase() && openable(shortcut.to)
        );
        if (target) {
          event.preventDefault();
          void navigate(target.to);
        }
        return;
      }
      if (event.key === "g") {
        goPending = Date.now();
      } else if (event.key === "?") {
        event.preventDefault();
        void navigate("/hilfe");
      } else if (event.key === "/") {
        const field = main?.querySelector<HTMLElement>('[data-shortcut="search"]');
        if (field) {
          event.preventDefault();
          field.focus();
        }
      } else if (event.key === "n") {
        const create = main?.querySelector<HTMLElement>('[data-shortcut="new"]');
        if (create) {
          event.preventDefault();
          if (create instanceof HTMLButtonElement) create.click();
          else create.focus();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openable, navigate]);
}

/**
 * After a page change the keyboard continues at the page heading, not at the top of the sidebar.
 */
function useFocusOnNavigation() {
  const { pathname } = useLocation();
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    const heading = document.querySelector<HTMLElement>("#inhalt h1");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [pathname]);
}

type Counts = { openRequests: number; activeLoans: number; maintenance: boolean };

function initials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function Brand() {
  const { branding } = useBranding();
  const { subtitle } = useTerms();
  // A company logo usually carries its own name, so it stands alone.
  if (branding.logoUrl) return <BrandLogo height={32} />;
  return (
    <>
      <LogoMark size={28} />
      <span>
        <Wordmark />
        {subtitle && <small>{subtitle}</small>}
      </span>
    </>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const terms = useTerms();
  const { m } = useI18n();
  const openable = useCanOpen();
  useShortcuts(openable);
  useFocusOnNavigation();

  // Mobile menu: focus moves into it, Escape closes it again.
  useEffect(() => {
    if (!menuOpen) return;
    sidebarRef.current?.querySelector<HTMLElement>("nav a")?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);
  const { data: counts, reload: reloadCounts } = useApi<Counts>(
    can(user, "dashboard.view") ? "/api/admin/summary" : null
  );

  // Pages announce changes (approve, return, …) so the counters never lag behind.
  useEffect(() => {
    window.addEventListener(NAV_REFRESH_EVENT, reloadCounts);
    return () => window.removeEventListener(NAV_REFRESH_EVENT, reloadCounts);
  }, [reloadCounts]);

  function onNavigate() {
    setMenuOpen(false);
    reloadCounts();
  }
  const { pathname } = useLocation();

  /**
   * The entries of a group of links the person may open; the settings entry leads to the first
   * settings tab they have.
   */
  function visible(items: NavItem[]): NavItem[] {
    return items.flatMap((item) => {
      if (!item.alsoActiveOn) return openable(item.to) ? [item] : [];
      const first = item.alsoActiveOn.find((path) => openable(path));
      return first ? [{ ...item, to: first }] : [];
    });
  }

  function section(title: string, items: NavItem[]) {
    const shown = visible(items);
    if (shown.length === 0) return null;
    return (
      <>
        <p className="nav-label">{title}</p>
        {renderLinks(shown)}
      </>
    );
  }

  function renderLinks(items: NavItem[]) {
    return (
      <ul>
        {items.map((item) => {
          const count = item.count && counts ? counts[item.count] : 0;
          const key = goKeyFor(item.to);
          const label = item.label(m, terms);
          return (
            <li key={item.to}>
              <NavLink
                // On one of its tabs the entry points at that tab, so NavLink marks it as current.
                to={item.alsoActiveOn?.includes(pathname) ? pathname : item.to}
                end={item.end}
                onClick={onNavigate}
                title={key ? format(m.nav.shortcut, { key }) : undefined}
              >
                <Icon name={item.icon} />
                {label}
                {count > 0 && (
                  <span className="nav-count" aria-label={format(m.nav.countOpen, { count })}>
                    {count}
                  </span>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="app">
      <a className="skip" href="#inhalt">
        {m.nav.skip}
      </a>

      <div className="topbar">
        <div className="brand-inline">
          <Brand />
        </div>
        <button
          type="button"
          className="ghost icon"
          aria-label={m.nav.openMenu}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <Icon name="menu" />
        </button>
      </div>
      {menuOpen && (
        <button
          type="button"
          className="scrim"
          aria-label={m.nav.closeMenu}
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside className="sidebar" data-open={menuOpen} ref={sidebarRef}>
        <div className="sidebar-brand">
          <Brand />
        </div>
        <nav aria-label={m.nav.mainNav}>
          {/* Whoever handles requests starts there, so that work comes first. Every entry is
              shown only if the person's group may open the page. */}
          {section(m.nav.sectionAdmin, adminLinks)}
          {section(m.nav.sectionLend, lendLinks)}
          {section(m.nav.sectionData, adminDataLinks)}
          {section(m.nav.sectionSystem, adminSystemLinks)}
        </nav>
        <div className="sidebar-theme">
          <NavLink to="/hilfe" className="help-link" onClick={onNavigate} title={m.nav.helpTitle}>
            <Icon name="keyboard" /> {m.nav.help}
          </NavLink>
          <LanguageSwitch />
          <ThemeSwitch />
        </div>
        <div className="sidebar-user">
          <span className="avatar" aria-hidden="true">
            {initials(user?.name)}
          </span>
          <NavLink to="/konto" className="who" onClick={onNavigate} title={m.nav.account}>
            <strong>{user?.name}</strong>
            <span>
              {user?.group.name} · {m.nav.account}
            </span>
          </NavLink>
          <button
            type="button"
            className="ghost icon"
            onClick={() => void logout()}
            aria-label={m.nav.logout}
            title={m.nav.logout}
          >
            <Icon name="logout" />
          </button>
        </div>
      </aside>

      <main id="inhalt" className="content">
        <div className="content-inner">
          {counts?.maintenance && (
            <div className="maintenance-banner" aria-live="polite">
              <Icon name="tool" />
              <span>
                <strong>{m.nav.maintenanceActive}</strong> {m.nav.maintenanceText}
              </span>
              {openable("/admin/wartung") && (
                <NavLink to="/admin/wartung" onClick={onNavigate}>
                  {m.nav.manage}
                </NavLink>
              )}
            </div>
          )}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
