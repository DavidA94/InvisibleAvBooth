import type { StateCreator } from "zustand";
import type { AuthUser } from "../types";
import { getAuthToken } from "../api/client";

function readUserFromStorage(): AuthUser | null {
  // If we have a token, try to read the cached user info
  if (!getAuthToken()) return null;
  try {
    const raw = localStorage.getItem("authUser");
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
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
  user: readUserFromStorage(),
  setUser: (user) => {
    localStorage.setItem("authUser", JSON.stringify(user));
    set({ user });
  },
  clearUser: () => {
    localStorage.removeItem("authUser");
    set({ user: null });
  },
});
