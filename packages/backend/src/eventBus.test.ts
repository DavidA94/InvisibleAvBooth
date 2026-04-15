import { describe, it, expect, vi, beforeEach } from "vitest";
import { eventBus } from "./eventBus.js";
import type { ObsState, ObsError, ObsErrorCode } from "./eventBus.js";

// The eventBus is a module-level singleton. We track and remove all handlers
// in beforeEach to keep tests isolated from one another.
const cleanups: Array<() => void> = [];

beforeEach(() => {
  cleanups.forEach((fn) => fn());
  cleanups.length = 0;
});

function subscribe<K extends Parameters<typeof eventBus.subscribe>[0]>(event: K, handler: Parameters<typeof eventBus.subscribe<K>>[1]): void {
  eventBus.subscribe(event, handler);
  cleanups.push(() => eventBus.unsubscribe(event, handler));
}

const baseObsState: ObsState = {
  connected: true,
  streaming: false,
  recording: false,
  commandedState: { streaming: false, recording: false },
};

describe("eventBus — obs:state:changed", () => {
  it("delivers payload to subscriber", () => {
    const handler = vi.fn();
    subscribe("obs:state:changed", handler);
    eventBus.emit("obs:state:changed", { state: baseObsState });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]?.[0]).toEqual({ state: baseObsState });
  });

  it("delivers to multiple subscribers", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribe("obs:state:changed", a);
    subscribe("obs:state:changed", b);
    eventBus.emit("obs:state:changed", { state: baseObsState });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("stops delivering after unsubscribe", () => {
    const handler = vi.fn();
    eventBus.subscribe("obs:state:changed", handler);
    eventBus.unsubscribe("obs:state:changed", handler);
    eventBus.emit("obs:state:changed", { state: baseObsState });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("eventBus — session:manifest:updated", () => {
  it("delivers manifest and interpolatedStreamTitle", () => {
    const handler = vi.fn();
    subscribe("session:manifest:updated", handler);
    eventBus.emit("session:manifest:updated", {
      manifest: { speaker: "John" },
      interpolatedStreamTitle: "Sunday Service",
    });
    expect(handler).toHaveBeenCalledWith({
      manifest: { speaker: "John" },
      interpolatedStreamTitle: "Sunday Service",
    });
  });
});

describe("eventBus — obs:error", () => {
  it("delivers OBS_UNREACHABLE payload with retryExhausted and context", () => {
    const handler = vi.fn();
    subscribe("obs:error", handler);
    const error = Object.assign(new Error("unreachable"), {
      code: "OBS_UNREACHABLE" as ObsErrorCode,
      name: "ObsError",
    }) as ObsError & { code: "OBS_UNREACHABLE" };
    eventBus.emit("obs:error", {
      error,
      retryExhausted: true,
      context: { streaming: false, recording: false },
    });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("delivers non-unreachable error payload", () => {
    const handler = vi.fn();
    subscribe("obs:error", handler);
    const error = Object.assign(new Error("failed"), {
      code: "STREAM_START_FAILED" as ObsErrorCode,
      name: "ObsError",
    }) as ObsError & { code: "STREAM_START_FAILED" };
    eventBus.emit("obs:error", { error });
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe("eventBus — obs:error:resolved", () => {
  it("delivers errorCode", () => {
    const handler = vi.fn();
    subscribe("obs:error:resolved", handler);
    eventBus.emit("obs:error:resolved", { errorCode: "OBS_UNREACHABLE" });
    expect(handler).toHaveBeenCalledWith({ errorCode: "OBS_UNREACHABLE" });
  });
});

describe("eventBus — device:capabilities:updated", () => {
  it("delivers capabilities payload", () => {
    const handler = vi.fn();
    subscribe("device:capabilities:updated", handler);
    eventBus.emit("device:capabilities:updated", {
      deviceId: "obs-1",
      capabilities: { deviceId: "obs-1", deviceType: "obs", features: { streaming: true } },
    });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ deviceId: "obs-1" }));
  });
});

describe("eventBus — no cross-event leakage", () => {
  it("subscriber on one event does not receive emissions on another", () => {
    const handler = vi.fn();
    subscribe("obs:error:resolved", handler);
    eventBus.emit("obs:state:changed", { state: baseObsState });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("ObsError", () => {
  it("sets code and name correctly", async () => {
    const { ObsError } = await import("./eventBus.js");
    const err = new ObsError("OBS_UNREACHABLE", "cannot reach OBS");
    expect(err.code).toBe("OBS_UNREACHABLE");
    expect(err.name).toBe("ObsError");
    expect(err.message).toBe("cannot reach OBS");
    expect(err).toBeInstanceOf(Error);
  });
});
