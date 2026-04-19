import type { StateCreator } from "zustand";
import type { AuthUser } from "../types";

export interface AuthSlice {
  user: AuthUser | null;
  setUser: (user: AuthUser) => void;
  clearUser: () => void;
}

export const createAuthSlice: StateCreator<AuthSlice> = (set) => ({
  user: null,
  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null }),
});
