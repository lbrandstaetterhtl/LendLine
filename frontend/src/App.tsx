import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { AdminAuditPage } from "./pages/AdminAuditPage";
import { AdminBorrowedPage } from "./pages/AdminBorrowedPage";
import { AdminBrandingPage } from "./pages/AdminBrandingPage";
import { AdminCategoriesPage } from "./pages/AdminCategoriesPage";
import { AdminDevicesPage } from "./pages/AdminDevicesPage";
import { AdminHomePage } from "./pages/AdminHomePage";
import { AdminMaintenancePage } from "./pages/AdminMaintenancePage";
import { AdminRequestsPage } from "./pages/AdminRequestsPage";
import { AdminRoomsPage } from "./pages/AdminRoomsPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { DevicesPage } from "./pages/DevicesPage";
import { LoginPage } from "./pages/LoginPage";
import { MyRequestsPage } from "./pages/MyRequestsPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SearchPage } from "./pages/SearchPage";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready)
    return (
      <div className="auth-wrap">
        <p className="muted">Laden…</p>
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "ADMIN") return <Navigate to="/search" replace />;
  return children;
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
          path="/admin/wartung"
          element={
            <AdminOnly>
              <AdminMaintenancePage />
            </AdminOnly>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/search" replace />} />
    </Routes>
  );
}
