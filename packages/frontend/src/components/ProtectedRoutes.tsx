import { Redirect, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useStore } from "../store";

interface ProtectedRoutesProps {
  children: ReactNode;
}

/**
 * Reads auth state from the Zustand store (not from useAuth, which throws
 * when user is null — we need to handle the null case gracefully here).
 *
 * Redirects:
 *   - No user → /login
 *   - requiresPasswordChange → /change-password
 *   - Non-ADMIN accessing /admin/* → /dashboards
 */
export function ProtectedRoutes({ children }: ProtectedRoutesProps): ReactNode {
  const user = useStore((s) => s.user);
  const location = useLocation();

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (user.requiresPasswordChange && location.pathname !== "/change-password") {
    return <Redirect to="/change-password" />;
  }

  if (location.pathname.startsWith("/admin") && user.role !== "ADMIN") {
    return <Redirect to="/dashboards" />;
  }

  return <>{children}</>;
}
