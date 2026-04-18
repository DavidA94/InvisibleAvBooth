// CapabilitiesObject is cross-cutting (used by all HAL modules) so it lives here
// rather than in any single module's types file.
export interface CapabilitiesObject {
  deviceId: string;
  deviceType: "obs" | "camera-ptz" | "audio-mixer" | "text-overlay";
  features: Record<string, boolean>;
}

// Backend socket event constants.
//
// BUS_* constants are backend-only (EventBus never crosses the socket boundary).
// CTS_* and STC_* constants are shared with the frontend via @invisible-av-booth/shared.

// ── EventBus (internal, backend-only) ────────────────────────────────────────

export const BUS_OBS_STATE_CHANGED = "bus:obs:state:changed" as const;
export const BUS_OBS_ERROR = "bus:obs:error" as const;
export const BUS_OBS_ERROR_RESOLVED = "bus:obs:error:resolved" as const;
export const BUS_SESSION_MANIFEST_UPDATED = "bus:session:manifest:updated" as const;
export const BUS_DEVICE_CAPABILITIES_UPDATED = "bus:device:capabilities:updated" as const;
