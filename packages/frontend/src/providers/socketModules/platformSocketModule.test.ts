import { describe, it, expect, beforeEach } from "vitest";
import { STC_PLATFORM_STATE, STC_PLATFORM_HEALTH, STC_RELAY_STATE, STC_PLATFORM_READINESS } from "@invisible-av-booth/shared";
import { registerPlatformSocketHandlers } from "./platformSocketModule";
import { useStore } from "../../store";

// Handler-capturing fake socket — each registered handler is stored by event name
// so tests can invoke it directly and observe the store mutation.
function makeFakeSocket(): {
  handlers: Record<string, (payload: unknown) => void>;
  on: (event: string, handler: (payload: unknown) => void) => void;
} {
  const handlers: Record<string, (payload: unknown) => void> = {};
  return {
    handlers,
    on: (event, handler) => {
      handlers[event] = handler;
    },
  };
}

beforeEach(() => {
  useStore.setState({
    platformStates: new Map(),
    platformHealth: new Map(),
    relayState: { running: false, obsConnected: false },
    platformReadiness: false,
  });
});

describe("registerPlatformSocketHandlers", () => {
  it("registers listeners for all four platform events", () => {
    const fake = makeFakeSocket();
    registerPlatformSocketHandlers(fake as never);

    expect(Object.keys(fake.handlers)).toEqual(expect.arrayContaining([STC_PLATFORM_STATE, STC_PLATFORM_HEALTH, STC_RELAY_STATE, STC_PLATFORM_READINESS]));
    expect(Object.keys(fake.handlers)).toHaveLength(4);
  });

  it("STC_PLATFORM_STATE handler updates the platform state in the store", () => {
    const fake = makeFakeSocket();
    registerPlatformSocketHandlers(fake as never);

    fake.handlers[STC_PLATFORM_STATE]!({ platformType: "youtube", state: { state: "streaming" } });

    expect(useStore.getState().platformStates.get("youtube")).toEqual({ state: "streaming" });
  });

  it("STC_PLATFORM_HEALTH handler updates platform health in the store", () => {
    const fake = makeFakeSocket();
    registerPlatformSocketHandlers(fake as never);

    fake.handlers[STC_PLATFORM_HEALTH]!({ platformType: "facebook", health: { bitrate: 4000 } });

    expect(useStore.getState().platformHealth.get("facebook")).toEqual({ bitrate: 4000 });
  });

  it("STC_RELAY_STATE handler updates relay state in the store", () => {
    const fake = makeFakeSocket();
    registerPlatformSocketHandlers(fake as never);

    fake.handlers[STC_RELAY_STATE]!({ running: true, obsConnected: true });

    expect(useStore.getState().relayState).toEqual({ running: true, obsConnected: true });
  });

  it("STC_PLATFORM_READINESS handler updates readiness in the store", () => {
    const fake = makeFakeSocket();
    registerPlatformSocketHandlers(fake as never);

    fake.handlers[STC_PLATFORM_READINESS]!({ ready: true });

    expect(useStore.getState().platformReadiness).toBe(true);
  });
});
