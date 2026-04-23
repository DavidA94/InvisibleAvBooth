import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "./useAuth";
import { useStore } from "../store";
import { INITIAL_OBS_STATE } from "../store/obsSlice";
import type { Role } from "../types";

beforeEach(() => {
  useStore.setState({
    user: null,
    obsState: INITIAL_OBS_STATE,
    obsPending: false,
    manifest: {},
    interpolatedStreamTitle: "",
    notifications: [],
  });
});

describe("useAuth", () => {
  it("throws when user is null", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow("useAuth must be called inside an authenticated route tree");
    spy.mockRestore();
  });

  it("returns the user from the store", () => {
    useStore.getState().setUser({ id: "u1", username: "admin", role: "ADMIN" });
    const { result } = renderHook(() => useAuth());
    expect(result.current.user).toEqual({ id: "u1", username: "admin", role: "ADMIN" });
  });

  it.each<{ userRole: Role; isAdmin: boolean; isPowerUser: boolean; isVolunteer: boolean }>([
    { userRole: "ADMIN", isAdmin: true, isPowerUser: true, isVolunteer: true },
    { userRole: "AvPowerUser", isAdmin: false, isPowerUser: true, isVolunteer: true },
    { userRole: "AvVolunteer", isAdmin: false, isPowerUser: false, isVolunteer: true },
  ])("isRole for $userRole: ADMIN=$isAdmin, AvPowerUser=$isPowerUser, AvVolunteer=$isVolunteer", ({ userRole, isAdmin, isPowerUser, isVolunteer }) => {
    useStore.getState().setUser({ id: "u1", username: "user", role: userRole });
    const { result } = renderHook(() => useAuth());
    expect(result.current.isRole("ADMIN")).toBe(isAdmin);
    expect(result.current.isRole("AvPowerUser")).toBe(isPowerUser);
    expect(result.current.isRole("AvVolunteer")).toBe(isVolunteer);
  });

  it("updates when store changes", () => {
    useStore.getState().setUser({ id: "u1", username: "admin", role: "ADMIN" });
    const { result } = renderHook(() => useAuth());
    expect(result.current.user.username).toBe("admin");

    act(() => {
      useStore.getState().setUser({ id: "u2", username: "vol", role: "AvVolunteer" });
    });
    expect(result.current.user.username).toBe("vol");
  });
});
