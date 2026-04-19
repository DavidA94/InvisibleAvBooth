import type { ReactNode } from "react";
import { IonButton } from "@ionic/react";
import { useHistory, useLocation } from "react-router-dom";
import { useStore } from "../store";

export function GlobalTitleBar(): ReactNode {
  const user = useStore((s) => s.user);
  const history = useHistory();
  const location = useLocation();

  if (!user) return null;

  const isChangePassword = location.pathname === "/change-password";
  const dashboardName = localStorage.getItem("dashboardName");

  const handleLogout = async (): Promise<void> => {
    try {
      await fetch("/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // Best-effort — clear local state regardless
    }
    useStore.getState().clearUser();
    // Clear all dashboard caches from localStorage
    const keysToRemove = Object.keys(localStorage).filter((k) => k === "dashboardId" || k === "dashboardName" || k.startsWith("dashboardLayout:"));
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    history.replace("/login");
  };

  return (
    <div
      data-testid="global-title-bar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-control-gap)",
        padding: "0 var(--space-screen-edge)",
        height: "2.5rem",
        background: "var(--color-surface)",
        color: "var(--color-text)",
        fontSize: "0.875rem",
      }}
    >
      <span data-testid="title-bar-username">{user.username}</span>
      {!isChangePassword && (
        <>
          <span data-testid="title-bar-role" style={{ color: "var(--color-text-muted)" }}>
            {user.role}
          </span>
          <span
            data-testid="title-bar-dashboard-nav"
            role="button"
            tabIndex={0}
            onClick={() => history.push("/dashboards")}
            onKeyDown={(e) => e.key === "Enter" && history.push("/dashboards")}
            style={{ cursor: "pointer", flex: 1 }}
          >
            {dashboardName ?? "Choose Dashboard"}
          </span>
        </>
      )}
      {isChangePassword && <span style={{ flex: 1 }} />}
      <IonButton data-testid="title-bar-logout-btn" fill="clear" size="small" onClick={() => void handleLogout()}>
        Logout
      </IonButton>
    </div>
  );
}
