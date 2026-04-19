import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAuth } from "./useAuth";
import { useStore } from "../store";
import { INITIAL_OBS_STATE } from "../store/obsSlice";

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
    expect(() => renderHook(() => useAuth())).toThrow("useAuth must be called inside an authenticated route tree");
  });

  it("returns the user from the store", () => {
    useStore.getState().setUser({ id: "u1", username: "admin", role: "ADMIN" });
    const { result } = renderHook(() => useAuth());
    expect(result.current.user).toEqual({ id: "u1", username: "admin", role: "ADMIN" });
  });

  it("isRole returns true when role meets minimum", () => {
    useStore.getState().setUser({ id: "u1", username: "admin", role: "ADMIN" });
    const { result } = renderHook(() => useAuth());
    expect(result.current.isRole("ADMIN")).toBe(true);
    expect(result.current.isRole("AvPowerUser")).toBe(true);
    expect(result.current.isRole("AvVolunteer")).toBe(true);
  });

  it("isRole returns false when role is below minimum", () => {
    useStore.getState().setUser({ id: "u1", username: "vol", role: "AvVolunteer" });
    const { result } = renderHook(() => useAuth());
    expect(result.current.isRole("ADMIN")).toBe(false);
    expect(result.current.isRole("AvPowerUser")).toBe(false);
    expect(result.current.isRole("AvVolunteer")).toBe(true);
  });

  it("AvPowerUser satisfies AvVolunteer but not ADMIN", () => {
    useStore.getState().setUser({ id: "u1", username: "power", role: "AvPowerUser" });
    const { result } = renderHook(() => useAuth());
    expect(result.current.isRole("AvVolunteer")).toBe(true);
    expect(result.current.isRole("AvPowerUser")).toBe(true);
    expect(result.current.isRole("ADMIN")).toBe(false);
  });

  it("updates when store changes", () => {
    useStore.getState().setUser({ id: "u1", username: "admin", role: "ADMIN" });
    const { result, rerender } = renderHook(() => useAuth());
    expect(result.current.user.username).toBe("admin");

    useStore.getState().setUser({ id: "u2", username: "vol", role: "AvVolunteer" });
    rerender();
    expect(result.current.user.username).toBe("vol");
  });
});
