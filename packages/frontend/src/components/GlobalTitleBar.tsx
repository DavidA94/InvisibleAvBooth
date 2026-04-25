import type { ReactNode } from "react";
import { IonButton } from "@ionic/react";
import { useLocation, useNavigate } from "react-router";
import { useStore } from "../store";
import { clearAuthToken } from "../api/client";

export function GlobalTitleBar(): ReactNode {
  const user = useStore((s) => s.user);
  const location = useLocation();
  const navigate = useNavigate();

  if (!user) return null;

  const isChangePassword = location.pathname === "/change-password";
  const isDashboard = location.pathname.startsWith("/dashboard/");
  const dashboardName = localStorage.getItem("dashboardName");

  const handleLogout = (): void => {
    clearAuthToken();
    useStore.getState().clearUser();
    navigate("/login", { replace: true });
  };

  return (
    <div data-testid="global-title-bar" className="title-bar">
      {!isChangePassword && (
        <span data-testid="title-bar-dashboard-nav" className="title-bar-navigation">
          {isDashboard && dashboardName ? (
            <>
              <span>{dashboardName}</span>
              <IonButton fill="clear" size="small" className="title-bar-link" onClick={() => navigate("/dashboards")}>
                (change)
              </IonButton>
            </>
          ) : (
            <>
              <em className="text-muted">No Dashboard Selected</em>
              <IonButton fill="clear" size="small" className="title-bar-link" onClick={() => navigate("/dashboards")}>
                (choose)
              </IonButton>
            </>
          )}
        </span>
      )}
      <span className="fill-remaining" />
      <span data-testid="title-bar-username" className="margin-right-tight">
        {user.username}
      </span>
      {!isChangePassword && (
        <span data-testid="title-bar-role" className="text-muted margin-right-standard">
          ({user.role})
        </span>
      )}
      <IonButton data-testid="title-bar-logout-btn" fill="clear" size="small" onClick={handleLogout}>
        Logout
      </IonButton>
    </div>
  );
}
