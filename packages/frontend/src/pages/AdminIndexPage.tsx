import type { ReactNode } from "react";
import { IonPage, IonContent, IonButton } from "@ionic/react";
import { useNavigate } from "react-router";
import { TEST_ID_ADMIN_INDEX_PAGE } from "../constants/testIds";

const ADMIN_SECTIONS = [
  { label: "Dashboard Management", path: "/admin/dashboards" },
  { label: "User Management", path: "/admin/users" },
  { label: "Device Management", path: "/admin/devices" },
  { label: "Templates", path: "/admin/templates" },
  { label: "Streaming Platforms", path: "/admin/platforms" },
] as const;

export function AdminIndexPage(): ReactNode {
  const navigate = useNavigate();

  return (
    <IonPage data-testid={TEST_ID_ADMIN_INDEX_PAGE}>
      <IonContent className="ion-padding">
        <h2 className="admin-page-title">Admin Pages</h2>
        <div className="admin-index-grid">
          {ADMIN_SECTIONS.map((section) => (
            <IonButton
              key={section.path}
              href={section.path}
              expand="block"
              fill="outline"
              className="admin-index-button"
              onClick={(e) => {
                e.preventDefault();
                navigate(section.path);
              }}
            >
              {section.label}
            </IonButton>
          ))}
        </div>
      </IonContent>
    </IonPage>
  );
}
