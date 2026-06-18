import { logger } from "../logger.js";
import { eventBus } from "../eventBus/eventBus.js";
import { BUS_DEVICE_CAPABILITIES_UPDATED } from "../eventBus/types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ndiModule: any = null;
let ndiLoadPromise: Promise<boolean> | null = null;
let ndiAvailable = false;

export async function loadNdi(): Promise<boolean> {
  if (ndiLoadPromise) return ndiLoadPromise;
  ndiLoadPromise = (async () => {
    try {
      ndiModule = await import("grandi");
      ndiAvailable = true;
      logger.info("NDI SDK loaded successfully (grandi)");
    } catch {
      ndiAvailable = false;
      logger.error("NDI SDK not available — camera features are disabled. Install grandi dependencies (libavahi-client3, avahi-daemon) to enable cameras.");
      eventBus.emit(BUS_DEVICE_CAPABILITIES_UPDATED, {
        deviceId: "ndi",
        capabilities: { deviceId: "ndi", deviceType: "camera-ptz", features: { ndi: false } },
      });
    }
    return ndiAvailable;
  })();
  return ndiLoadPromise;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getNdiModule(): any {
  return ndiModule;
}

export function isNdiAvailable(): boolean {
  return ndiAvailable;
}
