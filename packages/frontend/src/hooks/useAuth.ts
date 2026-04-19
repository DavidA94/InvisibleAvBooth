import { useStore } from "../store";
import type { AuthUser, Role } from "../types";

const ROLE_HIERARCHY: Record<Role, number> = {
  ADMIN: 3,
  AvPowerUser: 2,
  AvVolunteer: 1,
};

export function useAuth(): { user: AuthUser; isRole: (minimum: Role) => boolean } {
  const user = useStore((s) => s.user);
  if (!user) {
    throw new Error("useAuth must be called inside an authenticated route tree");
  }
  return {
    user,
    isRole: (minimum: Role) => ROLE_HIERARCHY[user.role] >= ROLE_HIERARCHY[minimum],
  };
}
