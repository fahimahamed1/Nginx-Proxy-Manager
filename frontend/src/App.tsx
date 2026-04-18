// Root app component with routing
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { AppLayout } from "@/components/layout/app-layout";
import { Providers } from "@/components/providers";
import { SetupGuard } from "@/components/setup-guard";
import { LoginPage } from "@/pages/login";
import { SetupPage } from "@/pages/setup";
import { DashboardPage } from "@/pages/dashboard";
import { ProxyHostsPage } from "@/pages/proxy-hosts";
import { RedirectionHostsPage } from "@/pages/redirection-hosts";
import { DeadHostsPage } from "@/pages/dead-hosts";
import { StreamsPage } from "@/pages/streams";
import { CertificatesPage } from "@/pages/certificates";
import { AccessListsPage } from "@/pages/access-lists";
import { UsersPage } from "@/pages/users";
import { AuditLogPage } from "@/pages/audit-log";
import { SettingsPage } from "@/pages/settings";
import { NotFoundPage } from "@/pages/not-found";

// Redirects to /login if not authenticated
function ProtectedLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}

// Redirects to / if already authenticated
function PublicRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<SetupPage />} />
      </Route>

      <Route element={<ProtectedLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="proxy-hosts" element={<ProxyHostsPage />} />
        <Route path="redirection-hosts" element={<RedirectionHostsPage />} />
        <Route path="dead-hosts" element={<DeadHostsPage />} />
        <Route path="streams" element={<StreamsPage />} />
        <Route path="certificates" element={<CertificatesPage />} />
        <Route path="access-lists" element={<AccessListsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="audit-log" element={<AuditLogPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Providers>
      <SetupGuard>
        <AppRoutes />
      </SetupGuard>
    </Providers>
  );
}
