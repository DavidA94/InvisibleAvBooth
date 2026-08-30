import type {
  BUS_MIXER_STATE_CHANGED,
  BUS_MIXER_LEVELS,
  BUS_MIXER_DEVICE_CHANGED,
  BUS_MIXER_CAPTURE_PATH_LOST,
  BUS_MIXER_CAPTURE_PATH_RESTORED,
} from "../../../eventBus/types.js";
import type { MixerState, MixerChannelLevel } from "@invisible-av-booth/shared";

// EventMap slice — merged into the root EventMap in eventBus.ts
export interface MixerEventMap {
  [BUS_MIXER_STATE_CHANGED]: { mixerId: string; state: MixerState };
  [BUS_MIXER_LEVELS]: { mixerId: string; levels: MixerChannelLevel[] };
  [BUS_MIXER_DEVICE_CHANGED]: { action: "created" | "updated" | "deleted"; mixerId: string };
  [BUS_MIXER_CAPTURE_PATH_LOST]: { mixerId: string; reason: string };
  [BUS_MIXER_CAPTURE_PATH_RESTORED]: { mixerId: string };
}
