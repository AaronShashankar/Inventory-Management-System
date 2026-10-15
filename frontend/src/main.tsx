import React from "react";
import ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./app/Auth";
import { Layout } from "./components/Layout";
import { Empty, Loading } from "./components/UI";
import { Login, PasswordReset } from "./features/auth/Login";
const Dashboard = React.lazy(() =>
  import("./features/dashboard/Dashboard").then((module) => ({
    default: module.Dashboard,
  })),
);
const Catalog = React.lazy(() =>
  import("./features/catalog/Catalog").then((module) => ({
    default: module.Catalog,
  })),
);
const Inventory = React.lazy(() =>
  import("./features/inventory/Inventory").then((module) => ({
    default: module.Inventory,
  })),
);
const Operations = React.lazy(() =>
  import("./features/inventory/Operations").then((module) => ({
    default: module.Operations,
  })),
);
const Purchasing = React.lazy(() =>
  import("./features/purchasing/Purchasing").then((module) => ({
    default: module.Purchasing,
  })),
);
const Reports = React.lazy(() =>
  import("./features/reports/Reports").then((module) => ({
    default: module.Reports,
  })),
);
import {
  AuditLog,
  Team,
  OrganizationSettings,
} from "./features/settings/Settings";
import "./styles.css";
const client = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
});
function Protected() {
  const { user, loading, membership } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!membership)
    return (
      <Empty
        title="No active workspace"
        text="Ask your administrator to activate your membership."
      />
    );
  return <Outlet />;
}
function RoleRoute({ roles }: { roles: string[] }) {
  const { membership } = useAuth();
  return roles.includes(membership?.role || "") ? (
    <Outlet />
  ) : (
    <Navigate to="/app/dashboard" replace />
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <AuthProvider>
          <React.Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<PasswordReset />} />
              <Route
                path="/reset-password/:uid/:token"
                element={<PasswordReset />}
              />
              <Route element={<Protected />}>
                <Route path="/app" element={<Layout />}>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  {(
                    [
                      "products",
                      "suppliers",
                      "warehouses",
                      "locations",
                      "categories",
                      "units",
                    ] as const
                  ).map((resource) => (
                    <Route
                      key={resource}
                      path={resource}
                      element={<Catalog resource={resource} key={resource} />}
                    />
                  ))}
                  <Route path="inventory" element={<Inventory />} />
                  <Route path="operations" element={<Operations />} />
                  <Route path="purchasing" element={<Purchasing />} />
                  <Route
                    element={
                      <RoleRoute roles={["ADMIN", "MANAGER", "VIEWER"]} />
                    }
                  >
                    <Route path="reports" element={<Reports />} />
                    <Route path="audit" element={<AuditLog />} />
                  </Route>
                  <Route element={<RoleRoute roles={["ADMIN"]} />}>
                    <Route path="team" element={<Team />} />
                    <Route
                      path="organization"
                      element={<OrganizationSettings />}
                    />
                  </Route>
                </Route>
              </Route>
              <Route
                path="*"
                element={<Navigate to="/app/dashboard" replace />}
              />
            </Routes>
          </React.Suspense>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
