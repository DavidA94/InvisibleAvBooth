import type { BUS_CAMERA_STATE_CHANGED } from "../../../eventBus/types.js";
import type { CameraState } from "@invisible-av-booth/shared";

// EventMap slice — merged into the root EventMap in eventBus.ts
export interface CameraEventMap {
  [BUS_CAMERA_STATE_CHANGED]: { cameraId: string; state: CameraState };
}
