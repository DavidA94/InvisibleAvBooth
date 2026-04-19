import { IonApp, IonRouterOutlet, setupIonicReact } from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";
import { Route, Redirect } from "react-router-dom";
import type { ReactNode } from "react";

/* Ionic core + theme CSS */
import "@ionic/react/css/core.css";
import "@ionic/react/css/normalize.css";
import "@ionic/react/css/structure.css";
import "@ionic/react/css/typography.css";

/* Project theme — must load after Ionic defaults so our overrides win */
import "./theme/variables.css";

setupIonicReact();

export function App(): ReactNode {
  return (
    <IonApp>
      <IonReactRouter>
        <IonRouterOutlet>
          {/* Auth routes */}
          <Route exact path="/login" render={() => <div>Login</div>} />
          <Route exact path="/change-password" render={() => <div>Change Password</div>} />

          {/* Dashboard routes */}
          <Route exact path="/dashboards" render={() => <div>Dashboard Selection</div>} />
          <Route exact path="/dashboard" render={() => <div>Dashboard</div>} />

          {/* Admin routes */}
          <Route exact path="/admin/users" render={() => <div>Admin Users</div>} />
          <Route exact path="/admin/devices" render={() => <div>Admin Devices</div>} />

          {/* Default redirect */}
          <Route exact path="/" render={() => <Redirect to="/login" />} />
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
  );
}
