import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./index";
import { INITIAL_OBS_STATE } from "./obsSlice";
import type { ObsState } from "../types";

beforeEach(() => {
  useStore.setState({ user: null, obsState: INITIAL_OBS_STATE, obsPending: false, manifest: {}, interpolatedStreamTitle: "", notifications: [] });
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
