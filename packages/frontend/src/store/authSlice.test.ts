import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./index";
import { INITIAL_OBS_STATE } from "./obsSlice";
import type { AuthUser } from "../types";

beforeEach(() => {
  useStore.setState({ user: null, obsState: INITIAL_OBS_STATE, obsPending: false, manifest: {}, interpolatedStreamTitle: "", notifications: [] });
});

describe("authSlice", () => {
  const testUser: AuthUser = { id: "u1", username: "admin", role: "ADMIN" };

  it("starts with null user", () => {
    expect(useStore.getState().user).toBeNull();
  });

  it("setUser stores the user", () => {
    useStore.getState().setUser(testUser);
    expect(useStore.getState().user).toEqual(testUser);
  });

  it("clearUser resets user to null", () => {
    useStore.getState().setUser(testUser);
    useStore.getState().clearUser();
    expect(useStore.getState().user).toBeNull();
  });
});
