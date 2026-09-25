import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useApi } from "../api/useApi";
import { useAuth } from "../auth/AuthContext";
import { type Terms, useBranding, useTerms } from "../branding/BrandingContext";
import { goKeyFor, goShortcuts, isTyping } from "../shortcuts";
import { Icon, type IconName } from "./icons";
import { BrandLogo, LogoMark, Wordmark } from "./Logo";
import { ThemeSwitch } from "./ThemeSwitch";
import { NAV_REFRESH_EVENT } from "./ui";

type NavItem = {
  to: string;
  /**
   * Text, or the text built from the company's terms ("Stück" → "Ausrüstung").
   */
  label: string | ((terms: Terms) => string);
  icon: IconName;
  end?: boolean;
  count?: "openRequests" | "activeLoans";
};

const lendLinks: NavItem[] = [
  { to: "/search", label: (terms) => `${terms.unit} suchen`, icon: "search" },
  { to: "/devices", label: (terms) => terms.catalog, icon: "box", end: true },
  { to: "/my-requests", label: "Meine Anfragen", icon: "list" },
];

const adminLinks: NavItem[] = [
  { to: "/admin", label: "Übersicht", icon: "home", end: true },
  { to: "/admin/requests", label: "Anfragen", icon: "inbox", count: "openRequests" },
  { to: "/admin/borrowed", label: "Ausleihen", icon: "clock", count: "activeLoans" },
];

const adminDataLinks: NavItem[] = [
  { to: "/admin/devices", label: (terms) => terms.devices, icon: "box" },
  { to: "/admin/categories", label: "Kategorien", icon: "tag" },
  { to: "/admin/rooms", label: (terms) => terms.rooms, icon: "door" },
  { to: "/admin/users", label: "Benutzer", icon: "users" },
];

const adminSystemLinks: NavItem[] = [
  { to: "/admin/protokoll", label: "Protokoll", icon: "file" },
  { to: "/admin/erscheinungsbild", label: "Erscheinungsbild", icon: "palette" },
  { to: "/admin/einstellungen", label: "Einstellungen", icon: "sliders" },
  { to: "/admin/emails", label: "E-Mails", icon: "mail" },
  { to: "/admin/wartung", label: "Wartung", icon: "tool" },
];

const helpLinks: NavItem[] = [{ to: "/hilfe", label: "Bedienung", icon: "keyboard" }];

/**
 * Global keys: "?" help, "/" search field, "n" create, "g" + letter to jump to a page. Dialogs
 * handle their own keys; while one is open (or a field has focus) nothing fires here.
 */
function useShortcuts(isAdmin: boolean) {
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
          (shortcut) => shortcut.key === event.key.toLowerCase() && (isAdmin || !shortcut.admin)
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
  }, [isAdmin, navigate]);
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
  const { subtitle } = branding.terms;
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
  const isAdmin = user?.role === "ADMIN";
  const [menuOpen, setMenuOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const terms = useTerms();
  useShortcuts(isAdmin);
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
    isAdmin ? "/api/admin/summary" : null
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
  function renderLinks(items: NavItem[]) {
    return (
      <ul>
        {items.map((item) => {
          const count = item.count && counts ? counts[item.count] : 0;
          const key = goKeyFor(item.to);
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                title={key ? `Tastenkürzel: g, dann ${key}` : undefined}
              >
                <Icon name={item.icon} />
                {typeof item.label === "string" ? item.label : item.label(terms)}
                {count > 0 && (
                  <span className="nav-count" aria-label={`${count} offen`}>
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
        Zum Inhalt springen
      </a>

      <div className="topbar">
        <div className="brand-inline">
          <Brand />
        </div>
        <button
          type="button"
          className="ghost icon"
          aria-label="Menü öffnen"
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
          aria-label="Menü schließen"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside className="sidebar" data-open={menuOpen} ref={sidebarRef}>
        <div className="sidebar-brand">
          <Brand />
        </div>
        <nav aria-label="Hauptnavigation">
          <p className="nav-label">Ausleihe</p>
          {renderLinks(lendLinks)}
          {isAdmin && (
            <>
              <p className="nav-label">Verwaltung</p>
              {renderLinks(adminLinks)}
              <p className="nav-label">Stammdaten</p>
              {renderLinks(adminDataLinks)}
              <p className="nav-label">System</p>
              {renderLinks(adminSystemLinks)}
            </>
          )}
          <p className="nav-label">Hilfe</p>
          {renderLinks(helpLinks)}
        </nav>
        <div className="sidebar-theme">
          <span>Darstellung</span>
          <ThemeSwitch />
        </div>
        <div className="sidebar-user">
          <span className="avatar" aria-hidden="true">
            {initials(user?.name)}
          </span>
          <NavLink to="/konto" className="who" onClick={onNavigate} title="Mein Konto">
            <strong>{user?.name}</strong>
            <span>{isAdmin ? "Verwaltung" : "Nutzer"} · Mein Konto</span>
          </NavLink>
          <button
            type="button"
            className="ghost icon"
            onClick={() => void logout()}
            aria-label="Abmelden"
            title="Abmelden"
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
                <strong>Wartungsmodus aktiv.</strong> Nutzer können sich nicht anmelden, nur die
                Verwaltung arbeitet.
              </span>
              <NavLink to="/admin/wartung" onClick={onNavigate}>
                Verwalten
              </NavLink>
            </div>
          )}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
