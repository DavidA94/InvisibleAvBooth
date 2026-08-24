import { IonApp, setupIonicReact } from "@ionic/react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import type { ReactNode } from "react";

/* Ionic core + theme CSS */
import "@ionic/react/css/core.css";
import "@ionic/react/css/normalize.css";
import "@ionic/react/css/structure.css";
import "@ionic/react/css/typography.css";
import "@ionic/react/css/padding.css";
import "@ionic/react/css/text-alignment.css";
import "@ionic/react/css/flex-utils.css";

/* Project theme — must load after Ionic defaults so our overrides win */
import "./theme/variables.css";
import "./theme/shared.css";

import { SocketProvider } from "./providers/SocketProvider";
import { ProtectedRoutes } from "./components/ProtectedRoutes";
import { GlobalTitleBar } from "./components/GlobalTitleBar";
import { NotificationLayer } from "./components/NotificationLayer";
import { LoginPage } from "./pages/LoginPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { DashboardSelectionScreen } from "./pages/DashboardSelectionScreen";
import { Dashboard } from "./pages/Dashboard";
import { AdminUserManagement } from "./pages/AdminUserManagement";
import { AdminDeviceManagement } from "./pages/AdminDeviceManagement";
import { AdminIndexPage } from "./pages/AdminIndexPage";
import { AdminTemplatesPage } from "./pages/AdminTemplatesPage";
import { AdminPlatformManagement } from "./pages/AdminPlatformManagement";
import { LowerThirdOverlay } from "./overlay/LowerThirdOverlay";
import { useStore } from "./store";

setupIonicReact({ mode: "md" });

function RoleRedirect(): ReactNode {
  const role = useStore((s) => s.user?.role);
  return <Navigate to={role === "ADMIN" ? "/admin" : "/dashboards"} replace />;
}

export function App(): ReactNode {
  return (
    <IonApp>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/overlay/lower-thirds" element={<LowerThirdOverlay />} />
          <Route
            path="*"
            element={
              <ProtectedRoutes>
                <SocketProvider>
                  <NotificationLayer />
                  <div className="app-shell">
                    <GlobalTitleBar />
                    <div className="app-content">
                      <Routes>
                        <Route path="/change-password" element={<ChangePasswordPage />} />
                        <Route path="/dashboards" element={<DashboardSelectionScreen />} />
                        <Route path="/dashboard/:slug" element={<Dashboard />} />
                        <Route path="/admin" element={<AdminIndexPage />} />
                        <Route path="/admin/users" element={<AdminUserManagement />} />
                        <Route path="/admin/devices" element={<AdminDeviceManagement />} />
                        <Route path="/admin/templates" element={<AdminTemplatesPage />} />
                        <Route path="/admin/platforms" element={<AdminPlatformManagement />} />
                        <Route path="/admin/platforms/youtube" element={<AdminPlatformManagement />} />
                        <Route path="/admin/platforms/facebook" element={<AdminPlatformManagement />} />
                        <Route path="*" element={<RoleRedirect />} />
                      </Routes>
                    </div>
                  </div>
                </SocketProvider>
              </ProtectedRoutes>
            }
          />
        </Routes>
      </BrowserRouter>
    </IonApp>
  );
}
