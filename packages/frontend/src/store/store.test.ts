import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./index";
import { INITIAL_OBS_STATE } from "./obsSlice";
import type { AuthUser, ObsState, SessionManifest, Notification } from "../types";

// Reset store to initial state between tests
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

describe("obsSlice", () => {
  const connectedState: ObsState = {
    connected: true,
    streaming: true,
    recording: false,
    streamTimecode: "00:05:00",
    commandedState: { streaming: true, recording: false },
  };

  it("starts with disconnected initial state", () => {
    const { obsState, obsPending } = useStore.getState();
    expect(obsState.connected).toBe(false);
    expect(obsState.streaming).toBe(false);
    expect(obsState.recording).toBe(false);
    expect(obsPending).toBe(false);
  });

  it("setObsState updates state and clears pending", () => {
    useStore.getState().setObsPending(true);
    useStore.getState().setObsState(connectedState);
    expect(useStore.getState().obsState).toEqual(connectedState);
    expect(useStore.getState().obsPending).toBe(false);
  });

  it("setObsPending updates pending flag", () => {
    useStore.getState().setObsPending(true);
    expect(useStore.getState().obsPending).toBe(true);
    useStore.getState().setObsPending(false);
    expect(useStore.getState().obsPending).toBe(false);
  });
});

describe("sessionManifestSlice", () => {
  it("starts with empty manifest and empty title", () => {
    expect(useStore.getState().manifest).toEqual({});
    expect(useStore.getState().interpolatedStreamTitle).toBe("");
  });

  it("setManifest updates manifest and interpolated title", () => {
    const manifest: SessionManifest = { speaker: "John", title: "Grace" };
    useStore.getState().setManifest(manifest, "Apr 18 – John – Grace");
    expect(useStore.getState().manifest).toEqual(manifest);
    expect(useStore.getState().interpolatedStreamTitle).toBe("Apr 18 – John – Grace");
  });
});

describe("notificationSlice", () => {
  const notification: Notification = {
    id: "n1",
    level: "toast",
    severity: "info",
    message: "Connected",
  };

  it("starts with empty notifications", () => {
    expect(useStore.getState().notifications).toEqual([]);
  });

  it("addNotification appends to the list", () => {
    useStore.getState().addNotification(notification);
    expect(useStore.getState().notifications).toHaveLength(1);
    expect(useStore.getState().notifications[0]).toEqual(notification);
  });

  it("addNotification preserves existing notifications", () => {
    const second: Notification = { id: "n2", level: "banner", severity: "error", message: "Error" };
    useStore.getState().addNotification(notification);
    useStore.getState().addNotification(second);
    expect(useStore.getState().notifications).toHaveLength(2);
  });

  it("removeNotification removes by id", () => {
    useStore.getState().addNotification(notification);
    useStore.getState().removeNotification("n1");
    expect(useStore.getState().notifications).toHaveLength(0);
  });

  it("removeNotification does not affect other notifications", () => {
    const second: Notification = { id: "n2", level: "banner", severity: "error", message: "Error" };
    useStore.getState().addNotification(notification);
    useStore.getState().addNotification(second);
    useStore.getState().removeNotification("n1");
    expect(useStore.getState().notifications).toHaveLength(1);
    expect(useStore.getState().notifications[0]?.id).toBe("n2");
  });
});
