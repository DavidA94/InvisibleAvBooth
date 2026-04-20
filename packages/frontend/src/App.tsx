import { IonApp, IonRouterOutlet, setupIonicReact } from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";
import { Route, Redirect, Switch } from "react-router-dom";
import type { ReactNode } from "react";

/* Ionic core + theme CSS */
import "@ionic/react/css/core.css";
import "@ionic/react/css/normalize.css";
import "@ionic/react/css/structure.css";
import "@ionic/react/css/typography.css";

/* Project theme — must load after Ionic defaults so our overrides win */
import "./theme/variables.css";

import { SocketProvider } from "./providers/SocketProvider";
import { ProtectedRoutes } from "./components/ProtectedRoutes";
import { GlobalTitleBar } from "./components/GlobalTitleBar";
import { LoginPage } from "./pages/LoginPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { DashboardSelectionScreen } from "./pages/DashboardSelectionScreen";
import { Dashboard } from "./pages/Dashboard";

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
                <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                  <GlobalTitleBar />
                  <div style={{ flex: 1, position: "relative" }}>
                    <IonRouterOutlet>
                      <Route exact path="/change-password" component={ChangePasswordPage} />
                      <Route exact path="/dashboards" component={DashboardSelectionScreen} />
                      <Route exact path="/dashboard/:id" component={Dashboard} />
                      <Route exact path="/admin/users" render={() => <div>Admin Users (coming soon)</div>} />
                      <Route exact path="/admin/devices" render={() => <div>Admin Devices (coming soon)</div>} />
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
