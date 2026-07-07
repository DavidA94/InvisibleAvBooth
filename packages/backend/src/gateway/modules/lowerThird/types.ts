import type { BUS_LOWER_THIRD_STATE_CHANGED, BUS_TEMPLATES_CHANGED } from "../../../eventBus/types.js";
import type { LowerThirdState } from "@invisible-av-booth/shared";

export interface LowerThirdEventMap {
  [BUS_LOWER_THIRD_STATE_CHANGED]: LowerThirdState;
  [BUS_TEMPLATES_CHANGED]: { action: string; templateId: string };
}
