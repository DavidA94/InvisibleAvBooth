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
import { setAuthExpiredHandler } from "./api/client";
import { useStore } from "./store";

setupIonicReact({ mode: "md" });

// Global handler: when a 401 is received or token expires, clear auth state.
// ProtectedRoutes will redirect to /login when user becomes null.
setAuthExpiredHandler(() => {
  useStore.getState().clearUser();
});

export function App(): ReactNode {
  return (
    <IonApp>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
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
                        <Route path="/dashboard/:id" element={<Dashboard />} />
                        <Route path="/admin/users" element={<AdminUserManagement />} />
                        <Route path="/admin/devices" element={<AdminDeviceManagement />} />
                        <Route path="*" element={<Navigate to="/dashboards" replace />} />
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
