import { logger } from "../logger.js";
import { eventBus } from "../eventBus/eventBus.js";
import { BUS_DEVICE_CAPABILITIES_UPDATED } from "../eventBus/types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ndiModule: any = null;
let ndiAttempted = false;
let ndiAvailable = false;

export async function loadNdi(): Promise<boolean> {
  if (ndiAttempted) return ndiAvailable;
  ndiAttempted = true;
  try {
    ndiModule = await import("grandiose");
    ndiAvailable = true;
    logger.info("NDI SDK loaded successfully");
  } catch {
    ndiAvailable = false;
    logger.error("NDI SDK not available — camera features are disabled. Install the NDI SDK to enable cameras.");
    eventBus.emit(BUS_DEVICE_CAPABILITIES_UPDATED, {
      deviceId: "ndi",
      capabilities: { deviceId: "ndi", deviceType: "camera-ptz", features: { ndi: false } },
    });
  }
  return ndiAvailable;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getNdiModule(): any {
  return ndiModule;
}

export function isNdiAvailable(): boolean {
  return ndiAvailable;
}
