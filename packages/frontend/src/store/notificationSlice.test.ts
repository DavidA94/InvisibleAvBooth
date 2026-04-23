import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./index";
import { INITIAL_OBS_STATE } from "./obsSlice";
import type { Notification } from "../types";

beforeEach(() => {
  useStore.setState({ user: null, obsState: INITIAL_OBS_STATE, obsPending: false, manifest: {}, interpolatedStreamTitle: "", notifications: [] });
});

describe("notificationSlice", () => {
  const notification: Notification = { id: "n1", level: "toast", severity: "info", message: "Connected" };

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
