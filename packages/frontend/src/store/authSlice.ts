import type { StateCreator } from "zustand";
import type { AuthUser } from "../types";

function readUserFromCookie(): AuthUser | null {
  try {
    const match = document.cookie.split("; ").find((c) => c.startsWith("user_info="));
    if (!match) return null;
    const decoded = decodeURIComponent(match.split("=").slice(1).join("="));
    return JSON.parse(decoded) as AuthUser;
  } catch {
    return null;
  }
}

export interface AuthSlice {
  user: AuthUser | null;
  setUser: (user: AuthUser) => void;
  clearUser: () => void;
}

export const createAuthSlice: StateCreator<AuthSlice> = (set) => ({
  user: readUserFromCookie(),
  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null }),
});
