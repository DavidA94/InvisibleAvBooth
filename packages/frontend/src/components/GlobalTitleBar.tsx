import type { ReactNode } from "react";
import { IonButton } from "@ionic/react";
import { useLocation, useNavigate } from "react-router";
import { useStore } from "../store";
import {
  TEST_ID_GLOBAL_TITLE_BAR,
  TEST_ID_TITLE_BAR_DASHBOARD_NAV,
  TEST_ID_TITLE_BAR_USERNAME,
  TEST_ID_TITLE_BAR_ROLE,
  TEST_ID_TITLE_BAR_LOGOUT_BUTTON,
  TEST_ID_TITLE_BAR_ADMIN_LINK,
} from "../constants/testIds";

export function GlobalTitleBar(): ReactNode {
  const user = useStore((s) => s.user);
  const location = useLocation();
  const navigate = useNavigate();

  if (!user) return null;

  const isChangePassword = location.pathname === "/change-password";
  const isDashboard = location.pathname.startsWith("/dashboard/");
  const dashboardName = localStorage.getItem("dashboardName");

  return (
    <div data-testid={TEST_ID_GLOBAL_TITLE_BAR} className="title-bar">
      {!isChangePassword && (
        <span data-testid={TEST_ID_TITLE_BAR_DASHBOARD_NAV} className="title-bar-navigation">
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
      {!isChangePassword && user.role === "ADMIN" && (
        <IonButton
          data-testid={TEST_ID_TITLE_BAR_ADMIN_LINK}
          fill="clear"
          size="small"
          className="title-bar-link"
          onClick={() => navigate("/admin")}
        >
          Admin Pages
        </IonButton>
      )}
      <span className="fill-remaining" />
      <span data-testid={TEST_ID_TITLE_BAR_USERNAME} className="margin-right-tight">
        {user.username}
      </span>
      {!isChangePassword && (
        <span data-testid={TEST_ID_TITLE_BAR_ROLE} className="text-muted margin-right-standard">
          ({user.role})
        </span>
      )}
      <IonButton data-testid={TEST_ID_TITLE_BAR_LOGOUT_BUTTON} href="/api/auth/logout" fill="clear" size="small">
        Logout
      </IonButton>
    </div>
  );
}
