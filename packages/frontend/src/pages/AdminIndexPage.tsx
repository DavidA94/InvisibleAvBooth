import type { ReactNode } from "react";
import { IonCard, IonCardHeader, IonCardTitle } from "@ionic/react";
import { useNavigate } from "react-router";
import { TEST_ID_ADMIN_INDEX_PAGE } from "../constants/testIds";

const ADMIN_SECTIONS = [
  { label: "User Management", path: "/admin/users" },
  { label: "Device Management", path: "/admin/devices" },
  { label: "Templates", path: "/admin/templates" },
  { label: "YouTube", path: "/admin/platforms/youtube" },
  { label: "Facebook", path: "/admin/platforms/facebook" },
] as const;

export function AdminIndexPage(): ReactNode {
  const navigate = useNavigate();

  return (
    <div data-testid={TEST_ID_ADMIN_INDEX_PAGE} className="admin-index-page">
      {ADMIN_SECTIONS.map((section) => (
        <IonCard key={section.path} button onClick={() => navigate(section.path)}>
          <IonCardHeader>
            <IonCardTitle>{section.label}</IonCardTitle>
          </IonCardHeader>
        </IonCard>
      ))}
    </div>
  );
}
