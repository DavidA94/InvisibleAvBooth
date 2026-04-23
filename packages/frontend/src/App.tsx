import { IonApp, IonRouterOutlet, setupIonicReact } from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";
import { Route, Redirect, Switch } from "react-router-dom";
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

// Force Material Design mode — we're a tablet web app in a controlled environment,
// not a native app. MD mode gives consistent rendering regardless of user-agent.
setupIonicReact({ mode: "md" });

export function App(): ReactNode {
  return (
    <IonApp>
      <IonReactRouter>
        <Switch>
          <Route exact path="/login" component={LoginPage} />
          <Route>
            <ProtectedRoutes>
              <SocketProvider>
                <NotificationLayer />
                <div className="app-shell">
                  <GlobalTitleBar />
                  <div className="app-content">
                    <IonRouterOutlet>
                      <Route exact path="/change-password" component={ChangePasswordPage} />
                      <Route exact path="/dashboards" component={DashboardSelectionScreen} />
                      <Route exact path="/dashboard/:id" component={Dashboard} />
                      <Route exact path="/api/admin/users" component={AdminUserManagement} />
                      <Route exact path="/api/admin/devices" component={AdminDeviceManagement} />
                      <Route exact path="/" render={() => <Redirect to="/dashboards" />} />
                    </IonRouterOutlet>
                  </div>
                </div>
              </SocketProvider>
            </ProtectedRoutes>
          </Route>
        </Switch>
      </IonReactRouter>
    </IonApp>
  );
}
