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
    <div
      data-testid="global-title-bar"
      style={{
        display: "flex",
        alignItems: "center",
        padding: "0 var(--space-screen-edge)",
        height: "2.5rem",
        background: "var(--color-surface)",
        color: "var(--color-text)",
        fontSize: "0.875rem",
      }}
    >
      {!isChangePassword && (
        <span data-testid="title-bar-dashboard-nav" style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
          {isDashboard && dashboardName ? (
            <>
              <span>{dashboardName}</span>
              <IonButton routerLink="/dashboards" fill="clear" size="small" style={{ "--padding-start": "0", "--padding-end": "0", fontSize: "0.75rem" }}>
                (change)
              </IonButton>
            </>
          ) : (
            <>
              <em style={{ color: "var(--color-text-muted)" }}>No Dashboard Selected</em>
              <IonButton routerLink="/dashboards" fill="clear" size="small" style={{ "--padding-start": "0", "--padding-end": "0", fontSize: "0.75rem" }}>
                (choose)
              </IonButton>
            </>
          )}
        </span>
      )}
      <span style={{ flex: 1 }} />
      <span data-testid="title-bar-username" style={{ marginRight: "0.25rem" }}>
        {user.username}
      </span>
      {!isChangePassword && (
        <span data-testid="title-bar-role" style={{ color: "var(--color-text-muted)", marginRight: "0.5rem" }}>
          ({user.role})
        </span>
      )}
      <IonButton data-testid="title-bar-logout-btn" href="/auth/logout" fill="clear" size="small">
        Logout
      </IonButton>
    </div>
  );
}
