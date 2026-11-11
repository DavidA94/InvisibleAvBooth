import type { StateCreator } from "zustand";
import type { MixerState, MixerChannelState, MixerChannelLevel } from "@invisible-av-booth/shared";

export interface MixerSlice {
  /** Full mixer state by mixerId. */
  mixerStates: Record<string, MixerState>;
  /** Per-mixer, per-channel level in dBFS (mixerId → channel → dBFS). */
  mixerLevels: Record<string, Record<number, number>>;
  /**
   * Preset ids currently awaiting a backend apply/verify ack (the button shows a
   * loading state while its id is here). Keyed as a flat set of presetId — preset
   * ids are globally unique, so no mixer nesting is needed. Populated on tap,
   * cleared when STC_MIXER_PRESET_RESULT arrives.
   */
  pendingPresetIds: string[];
  /**
   * performance.now() when each pending preset was tapped — used ONLY to log the
   * tap→ack round-trip so slow applies can be diagnosed from app.log.
   */
  presetPendingSince: Record<string, number>;
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
  /** Mark a preset as awaiting its apply/verify ack (button → loading). */
  markPresetPending: (presetId: string) => void;
  /** Clear a preset's pending flag (ack arrived — button → idle). */
  clearPresetPending: (presetId: string) => void;
}

export const createMixerSlice: StateCreator<MixerSlice> = (set) => ({
  mixerStates: {},
  mixerLevels: {},
  pendingPresetIds: [],
  presetPendingSince: {},

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

  markPresetPending: (presetId) =>
    set((prev) => ({
      pendingPresetIds: prev.pendingPresetIds.includes(presetId) ? prev.pendingPresetIds : [...prev.pendingPresetIds, presetId],
      presetPendingSince: { ...prev.presetPendingSince, [presetId]: performance.now() },
    })),

  clearPresetPending: (presetId) =>
    set((prev) => {
      const { [presetId]: _started, ...rest } = prev.presetPendingSince;
      return { pendingPresetIds: prev.pendingPresetIds.filter((id) => id !== presetId), presetPendingSince: rest };
    }),
});
