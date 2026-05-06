// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./index";
import { INITIAL_RELAY_STATE } from "./platformSlice";

beforeEach(() => {
  useStore.setState({
    platformStates: new Map(),
    relayState: INITIAL_RELAY_STATE,
    platformHealth: new Map(),
    platformReadiness: [],
  });
});

describe("platformSlice", () => {
  it("starts with correct initial values", () => {
    const { platformStates, relayState, platformHealth, platformReadiness } = useStore.getState();
    expect(platformStates.size).toBe(0);
    expect(relayState).toEqual({ running: false, obsConnected: false });
    expect(platformHealth.size).toBe(0);
    expect(platformReadiness).toEqual([]);
  });

  it("setPlatformState creates a new entry", () => {
    useStore.getState().setPlatformState("youtube", { state: "streaming" });
    const entry = useStore.getState().platformStates.get("youtube");
    expect(entry).toEqual({ state: "streaming" });
  });

  it("setPlatformState updates an existing entry", () => {
    useStore.getState().setPlatformState("youtube", { state: "idle" });
    useStore.getState().setPlatformState("youtube", { state: "error", error: "connection lost" });
    const entry = useStore.getState().platformStates.get("youtube");
    expect(entry).toEqual({ state: "error", error: "connection lost" });
  });

  it("setPlatformState preserves other platform entries", () => {
    useStore.getState().setPlatformState("youtube", { state: "streaming" });
    useStore.getState().setPlatformState("facebook", { state: "idle" });
    expect(useStore.getState().platformStates.get("youtube")).toEqual({ state: "streaming" });
    expect(useStore.getState().platformStates.get("facebook")).toEqual({ state: "idle" });
  });

  it("setRelayState updates relay state", () => {
    useStore.getState().setRelayState({ running: true, obsConnected: true });
    expect(useStore.getState().relayState).toEqual({ running: true, obsConnected: true });
  });

  it("setPlatformHealth creates and updates entries", () => {
    useStore.getState().setPlatformHealth("youtube", { bitrate: 4500 });
    expect(useStore.getState().platformHealth.get("youtube")).toEqual({ bitrate: 4500 });
    useStore.getState().setPlatformHealth("youtube", { bitrate: 6000 });
    expect(useStore.getState().platformHealth.get("youtube")).toEqual({ bitrate: 6000 });
  });

  it("setPlatformReadiness updates readiness", () => {
    const platforms = [{ platformType: "youtube", label: "YouTube", healthy: true, privacy: "unlisted" }];
    useStore.getState().setPlatformReadiness(platforms);
    expect(useStore.getState().platformReadiness).toEqual(platforms);
    useStore.getState().setPlatformReadiness([]);
    expect(useStore.getState().platformReadiness).toEqual([]);
  });
});
