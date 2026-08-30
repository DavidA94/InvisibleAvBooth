import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./index";
import type { MixerState } from "@invisible-av-booth/shared";

const MIXER_STATE: MixerState = {
  mixerId: "mix1",
  connected: true,
  model: "behringer-xair",
  channelCount: 2,
  capabilities: { features: ["gain-control", "channel-metering"], gainRange: { minDb: -12, maxDb: 60 } },
  channels: [
    { channel: 1, name: "Ch 1", fader: 0.5, faderDb: -10, muted: false, gainDb: 0 },
    { channel: 2, name: "Ch 2", fader: 0.75, faderDb: 0, muted: true, gainDb: 12 },
  ],
  presets: [],
};

describe("mixerSlice", () => {
  beforeEach(() => {
    useStore.setState({ mixerStates: {}, mixerLevels: {} });
  });

  it("setMixerState stores a mixer by id", () => {
    useStore.getState().setMixerState("mix1", MIXER_STATE);
    expect(useStore.getState().mixerStates["mix1"]).toEqual(MIXER_STATE);
  });

  it("setMixerState replaces existing state for the same id", () => {
    useStore.getState().setMixerState("mix1", MIXER_STATE);
    useStore.getState().setMixerState("mix1", { ...MIXER_STATE, connected: false });
    expect(useStore.getState().mixerStates["mix1"]?.connected).toBe(false);
  });

  it("setAllMixerStates replaces all mixers keyed by id", () => {
    useStore.getState().setMixerState("mix1", MIXER_STATE);
    const other: MixerState = { ...MIXER_STATE, mixerId: "mix2" };
    useStore.getState().setAllMixerStates([other]);
    expect(useStore.getState().mixerStates["mix1"]).toBeUndefined();
    expect(useStore.getState().mixerStates["mix2"]).toEqual(other);
  });

  it("applyMixerChannelUpdate merges a single channel", () => {
    useStore.getState().setMixerState("mix1", MIXER_STATE);
    useStore.getState().applyMixerChannelUpdate("mix1", { channel: 1, name: "Vocals", fader: 0.9, faderDb: 8, muted: false, gainDb: 5 });
    const state = useStore.getState().mixerStates["mix1"]!;
    expect(state.channels.find((c) => c.channel === 1)?.name).toBe("Vocals");
    // Channel 2 unchanged.
    expect(state.channels.find((c) => c.channel === 2)?.muted).toBe(true);
  });

  it("applyMixerChannelUpdate is a no-op for an unknown mixer", () => {
    useStore.getState().applyMixerChannelUpdate("nope", { channel: 1, name: "x", fader: 0, faderDb: -60, muted: false, gainDb: 0 });
    expect(useStore.getState().mixerStates["nope"]).toBeUndefined();
  });

  it("setMixerLevels stores per-channel dBFS by channel number", () => {
    useStore.getState().setMixerLevels("mix1", [
      { channel: 1, levelDb: -18 },
      { channel: 2, levelDb: -40 },
    ]);
    expect(useStore.getState().mixerLevels["mix1"]).toEqual({ 1: -18, 2: -40 });
  });

  it("setMixerLevels replaces the prior levels for that mixer", () => {
    useStore.getState().setMixerLevels("mix1", [{ channel: 1, levelDb: -18 }]);
    useStore.getState().setMixerLevels("mix1", [{ channel: 2, levelDb: -12 }]);
    expect(useStore.getState().mixerLevels["mix1"]).toEqual({ 2: -12 });
  });
});
