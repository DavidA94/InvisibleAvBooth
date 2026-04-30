import type { ReactNode, MouseEvent } from "react";
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

  function handleClick(e: MouseEvent, path: string): void {
    if (e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    navigate(path);
  }

  return (
    <div data-testid={TEST_ID_ADMIN_INDEX_PAGE} className="admin-index-grid">
      {ADMIN_SECTIONS.map((section) => (
        <a
          key={section.path}
          href={section.path}
          className="admin-index-card"
          onClick={(e) => handleClick(e, section.path)}
        >
          {section.label}
        </a>
      ))}
    </div>
  );
}
