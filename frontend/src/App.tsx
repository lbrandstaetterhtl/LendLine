import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { AccountPage } from "./pages/AccountPage";
import { AdminAuditPage } from "./pages/AdminAuditPage";
import { AdminBorrowedPage } from "./pages/AdminBorrowedPage";
import { AdminBrandingPage } from "./pages/AdminBrandingPage";
import { AdminCategoriesPage } from "./pages/AdminCategoriesPage";
import { AdminDevicesPage } from "./pages/AdminDevicesPage";
import { AdminEmailsPage } from "./pages/AdminEmailsPage";
import { AdminHomePage } from "./pages/AdminHomePage";
import { AdminMaintenancePage } from "./pages/AdminMaintenancePage";
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

function Protected({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const { pathname, search } = useLocation();
  if (!ready)
    return (
      <div className="auth-wrap">
        <p className="muted">Laden…</p>
      </div>
    );
  // The login page brings the person back here afterwards (bookmark, link from an e-mail).
  if (!user) return <Navigate to="/login" replace state={{ from: `${pathname}${search}` }} />;
  // The server refuses everything else until then, see requireAuth.
  if (user.mustChangePassword && pathname !== "/konto") return <Navigate to="/konto" replace />;
  return children;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "ADMIN") return <Navigate to="/search" replace />;
  return children;
}

/**
 * Unknown addresses go to the start page of the person's role.
 */
function RoleHome() {
  const { user } = useAuth();
  return <Navigate to={user?.role === "ADMIN" ? "/admin" : "/search"} replace />;
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready)
    return (
      <div className="auth-wrap">
        <p className="muted">Laden…</p>
      </div>
    );
  if (user) return <Navigate to={user.role === "ADMIN" ? "/admin" : "/search"} replace />;
  return children;
}

export function App() {
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
        <Route
          path="/admin"
          element={
            <AdminOnly>
              <AdminHomePage />
            </AdminOnly>
          }
        />
        <Route
          path="/admin/devices"
          element={
            <AdminOnly>
              <AdminDevicesPage />
            </AdminOnly>
          }
        />
        <Route
          path="/admin/categories"
          element={
            <AdminOnly>
              <AdminCategoriesPage />
            </AdminOnly>
          }
        />
        <Route
          path="/admin/rooms"
          element={
            <AdminOnly>
              <AdminRoomsPage />
            </AdminOnly>
          }
        />
        <Route
          path="/admin/users"
          element={
            <AdminOnly>
              <AdminUsersPage />
            </AdminOnly>
          }
        />
        <Route
          path="/admin/requests"
          element={
            <AdminOnly>
              <AdminRequestsPage />
            </AdminOnly>
          }
        />
        <Route
          path="/admin/borrowed"
          element={
            <AdminOnly>
              <AdminBorrowedPage />
            </AdminOnly>
          }
        />
        <Route
          path="/admin/protokoll"
          element={
            <AdminOnly>
              <AdminAuditPage />
            </AdminOnly>
          }
        />
        <Route
          path="/admin/erscheinungsbild"
          element={
            <AdminOnly>
              <AdminBrandingPage />
            </AdminOnly>
          }
        />
        <Route
          path="/admin/einstellungen"
          element={
            <AdminOnly>
              <AdminSettingsPage />
            </AdminOnly>
          }
        />
        <Route
          path="/admin/emails"
          element={
            <AdminOnly>
              <AdminEmailsPage />
            </AdminOnly>
          }
        />
        <Route
          path="/admin/wartung"
          element={
            <AdminOnly>
              <AdminMaintenancePage />
            </AdminOnly>
          }
        />
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
