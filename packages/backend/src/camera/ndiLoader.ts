import { logger } from "../logger.js";

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
    logger.error("NDI SDK (grandiose) not available — camera features disabled");
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
