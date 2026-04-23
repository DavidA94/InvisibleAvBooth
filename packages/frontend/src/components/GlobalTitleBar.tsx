import type { ReactNode } from "react";
import { IonButton } from "@ionic/react";
import { useLocation } from "react-router-dom";
import { useStore } from "../store";

export function GlobalTitleBar(): ReactNode {
  const user = useStore((s) => s.user);
  const location = useLocation();

  if (!user) return null;

  const isChangePassword = location.pathname === "/change-password";
  const isDashboard = location.pathname.startsWith("/dashboard/");
  const dashboardName = localStorage.getItem("dashboardName");

  return (
    <div data-testid="global-title-bar" className="title-bar">
      {!isChangePassword && (
        <span data-testid="title-bar-dashboard-nav" className="title-bar-navigation">
          {isDashboard && dashboardName ? (
            <>
              <span>{dashboardName}</span>
              <IonButton routerLink="/dashboards" fill="clear" size="small" className="title-bar-link">
                (change)
              </IonButton>
            </>
          ) : (
            <>
              <em className="text-muted">No Dashboard Selected</em>
              <IonButton routerLink="/dashboards" fill="clear" size="small" className="title-bar-link">
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
      <IonButton data-testid="title-bar-logout-btn" href="/api/auth/logout" fill="clear" size="small">
        Logout
      </IonButton>
    </div>
  );
}
