import type { BUS_LOWER_THIRD_STATE_CHANGED } from "../../../eventBus/types.js";
import type { LowerThirdState } from "@invisible-av-booth/shared";

export interface LowerThirdEventMap {
  [BUS_LOWER_THIRD_STATE_CHANGED]: LowerThirdState;
}
