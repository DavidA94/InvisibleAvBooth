import type { StateCreator } from "zustand";
import type { MixerState, MixerChannelState, MixerChannelLevel } from "@invisible-av-booth/shared";

export interface MixerSlice {
  /** Full mixer state by mixerId. */
  mixerStates: Record<string, MixerState>;
  /** Per-mixer, per-channel level in dBFS (mixerId → channel → dBFS). */
  mixerLevels: Record<string, Record<number, number>>;
  /** Replace the full state for one mixer (used for both initial + update). */
  setMixerState: (mixerId: string, state: MixerState) => void;
  /**
   * Merge a single channel's state into a mixer (design-doc delta form). The
   * backend currently sends full state via setMixerState, but this keeps the
   * per-channel merge available for callers/tests that use the delta shape.
   */
  applyMixerChannelUpdate: (mixerId: string, channel: MixerChannelState) => void;
  /** Replace per-channel levels for one mixer. */
  setMixerLevels: (mixerId: string, levels: MixerChannelLevel[]) => void;
  /** Replace all mixer states (initial state, an array). */
  setAllMixerStates: (states: MixerState[]) => void;
}

export const createMixerSlice: StateCreator<MixerSlice> = (set) => ({
  mixerStates: {},
  mixerLevels: {},

  setMixerState: (mixerId, state) =>
    set((prev) => ({
      mixerStates: { ...prev.mixerStates, [mixerId]: state },
    })),

  applyMixerChannelUpdate: (mixerId, channel) =>
    set((prev) => {
      const existing = prev.mixerStates[mixerId];
      if (!existing) return prev;
      const channels = existing.channels.map((current) => (current.channel === channel.channel ? channel : current));
      return {
        mixerStates: { ...prev.mixerStates, [mixerId]: { ...existing, channels } },
      };
    }),

  setMixerLevels: (mixerId, levels) =>
    set((prev) => {
      const byChannel: Record<number, number> = {};
      for (const level of levels) byChannel[level.channel] = level.levelDb;
      return {
        mixerLevels: { ...prev.mixerLevels, [mixerId]: byChannel },
      };
    }),

  setAllMixerStates: (states) =>
    set({
      mixerStates: Object.fromEntries(states.map((state) => [state.mixerId, state])),
    }),
});
