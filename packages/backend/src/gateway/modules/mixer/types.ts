import type { BUS_MIXER_STATE_CHANGED, BUS_MIXER_LEVELS, BUS_MIXER_DEVICE_CHANGED } from "../../../eventBus/types.js";
import type { MixerState, MixerChannelLevel } from "@invisible-av-booth/shared";

// EventMap slice — merged into the root EventMap in eventBus.ts
export interface MixerEventMap {
  [BUS_MIXER_STATE_CHANGED]: { mixerId: string; state: MixerState };
  [BUS_MIXER_LEVELS]: { mixerId: string; levels: MixerChannelLevel[] };
  [BUS_MIXER_DEVICE_CHANGED]: { action: "created" | "updated" | "deleted"; mixerId: string };
}
