import type { ReactNode, MouseEvent } from "react";
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

function navLink(navigate: (path: string) => void, path: string) {
  return (e: MouseEvent) => {
    // Allow Ctrl+Click / Cmd+Click to open in new tab
    if (e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    navigate(path);
  };
}

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
              <a href="/dashboards" className="title-bar-link" onClick={navLink(navigate, "/dashboards")}>
                (CHANGE)
              </a>
            </>
          ) : (
            <>
              <em className="text-muted">No Dashboard Selected</em>
              <a href="/dashboards" className="title-bar-link" onClick={navLink(navigate, "/dashboards")}>
                (CHANGE)
              </a>
            </>
          )}
          {user.role === "ADMIN" && (
            <>
              <span className="title-bar-separator">|</span>
              <a
                data-testid={TEST_ID_TITLE_BAR_ADMIN_LINK}
                href="/admin"
                className="title-bar-link"
                onClick={navLink(navigate, "/admin")}
              >
                Admin Pages
              </a>
            </>
          )}
        </span>
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
