import { Navigate, useLocation } from "react-router";
import type { ReactNode } from "react";
import { useStore } from "../store";

interface ProtectedRoutesProps {
  children: ReactNode;
}

export function ProtectedRoutes({ children }: ProtectedRoutesProps): ReactNode {
  const user = useStore((s) => s.user);
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.requiresPasswordChange && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  if (location.pathname.startsWith("/admin") && user.role !== "ADMIN") {
    return <Navigate to="/dashboards" replace />;
  }

  return <>{children}</>;
}
