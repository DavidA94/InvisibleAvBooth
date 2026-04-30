import type { ReactNode } from "react";
import { IonButton } from "@ionic/react";
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
    <div data-testid={TEST_ID_ADMIN_INDEX_PAGE} className="admin-index-wrapper">
      <h2 className="admin-index-heading">Admin Pages</h2>
      <div className="admin-index-grid">
        {ADMIN_SECTIONS.map((section) => (
          <IonButton
            key={section.path}
            href={section.path}
            expand="block"
            fill="outline"
            className="admin-index-button"
            onClick={(e) => { e.preventDefault(); navigate(section.path); }}
          >
            {section.label}
          </IonButton>
        ))}
      </div>
    </div>
  );
}
