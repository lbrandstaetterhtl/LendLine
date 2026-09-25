import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useAuth } from "./auth/AuthContext";
import { homePath } from "./auth/permissions";
import { useTerms } from "./branding/BrandingContext";
import { Layout } from "./components/Layout";
import { useI18n } from "./i18n";
import { AccountPage } from "./pages/AccountPage";
import { AdminAuditPage } from "./pages/AdminAuditPage";
import { AdminBorrowedPage } from "./pages/AdminBorrowedPage";
import { AdminBrandingPage } from "./pages/AdminBrandingPage";
import { AdminCategoriesPage } from "./pages/AdminCategoriesPage";
import { AdminDevicesPage } from "./pages/AdminDevicesPage";
import { AdminEmailsPage } from "./pages/AdminEmailsPage";
import { AdminGroupsPage } from "./pages/AdminGroupsPage";
import { AdminHomePage } from "./pages/AdminHomePage";
import { AdminMaintenancePage } from "./pages/AdminMaintenancePage";
import { AdminModePage } from "./pages/AdminModePage";
import { AdminRequestsPage } from "./pages/AdminRequestsPage";
import { AdminRoomsPage } from "./pages/AdminRoomsPage";
import { AdminSettingsPage } from "./pages/AdminSettingsPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { DevicesPage } from "./pages/DevicesPage";
import { HelpPage } from "./pages/HelpPage";
import { LoginPage } from "./pages/LoginPage";
import { MyRequestsPage } from "./pages/MyRequestsPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SearchPage } from "./pages/SearchPage";
import { useCanOpen } from "./ui/UiContext";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const { pathname, search } = useLocation();
  const openable = useCanOpen();
  const { m } = useI18n();
  if (!ready)
    return (
      <div className="auth-wrap">
        <p className="muted">{m.common.loading}</p>
      </div>
    );
  // The login page brings the person back here afterwards (bookmark, link from an e-mail).
  if (!user) return <Navigate to="/login" replace state={{ from: `${pathname}${search}` }} />;
  // The server refuses everything else until then, see requireAuth.
  if (user.mustChangePassword && pathname !== "/konto") return <Navigate to="/konto" replace />;
  // Pages the group may not open lead to the person's start page (the API refuses them anyway).
  if (!openable(pathname)) return <Navigate to={homePath(user)} replace />;
  return children;
}

/**
 * Unknown addresses go to the start page of the person's group.
 */
function RoleHome() {
  const { user } = useAuth();
  return <Navigate to={homePath(user)} replace />;
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const { m } = useI18n();
  if (!ready)
    return (
      <div className="auth-wrap">
        <p className="muted">{m.common.loading}</p>
      </div>
    );
  if (user) return <Navigate to={homePath(user)} replace />;
  return children;
}

export function App() {
  const { subtitle } = useTerms();
  // The tab title follows the company's subtitle in the current language.
  useEffect(() => {
    document.title = subtitle ? `LendLine · ${subtitle}` : "LendLine";
  }, [subtitle]);
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />
      <Route
        path="/register"
        element={
          <GuestOnly>
            <RegisterPage />
          </GuestOnly>
        }
      />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/search" element={<SearchPage />} />
        <Route path="/devices" element={<DevicesPage />} />
        <Route path="/my-requests" element={<MyRequestsPage />} />
        <Route path="/hilfe" element={<HelpPage />} />
        <Route path="/konto" element={<AccountPage />} />
        <Route path="/admin" element={<AdminHomePage />} />
        <Route path="/admin/devices" element={<AdminDevicesPage />} />
        <Route path="/admin/categories" element={<AdminCategoriesPage />} />
        <Route path="/admin/rooms" element={<AdminRoomsPage />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
        <Route path="/admin/requests" element={<AdminRequestsPage />} />
        <Route path="/admin/borrowed" element={<AdminBorrowedPage />} />
        <Route path="/admin/gruppen" element={<AdminGroupsPage />} />
        <Route path="/admin/modus" element={<AdminModePage />} />
        <Route path="/admin/protokoll" element={<AdminAuditPage />} />
        <Route path="/admin/erscheinungsbild" element={<AdminBrandingPage />} />
        <Route path="/admin/einstellungen" element={<AdminSettingsPage />} />
        <Route path="/admin/emails" element={<AdminEmailsPage />} />
        <Route path="/admin/wartung" element={<AdminMaintenancePage />} />
      </Route>
      <Route
        path="*"
        element={
          <Protected>
            <RoleHome />
          </Protected>
        }
      />
    </Routes>
  );
}
