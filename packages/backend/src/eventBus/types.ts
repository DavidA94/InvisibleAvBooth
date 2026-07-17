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
export const BUS_OBS_AUDIO_LEVELS = "bus:obs:audio:levels" as const;
export const BUS_SESSION_MANIFEST_UPDATED = "bus:session:manifest:updated" as const;
export const BUS_DEVICE_CAPABILITIES_UPDATED = "bus:device:capabilities:updated" as const;

// ── Relay events ─────────────────────────────────────────────────────────────

export const BUS_RELAY_STATE_CHANGED = "bus:relay:state:changed" as const;
export const BUS_FORWARDER_EXITED = "bus:forwarder:exited" as const;

// ── Platform events ──────────────────────────────────────────────────────────

export const BUS_PLATFORM_STATE_CHANGED = "bus:platform:state:changed" as const;
export const BUS_PLATFORM_HEALTH_UPDATED = "bus:platform:health:updated" as const;
export const BUS_PLATFORM_READINESS_CHANGED = "bus:platform:readiness:changed" as const;

// ── Lower-Third events ───────────────────────────────────────────────────────

export const BUS_LOWER_THIRD_STATE_CHANGED = "bus:lower-third:state:changed" as const;

// ── Camera events ────────────────────────────────────────────────────────────

export const BUS_CAMERA_STATE_CHANGED = "bus:camera:state:changed" as const;

// ── Hot-reload events (admin config changes that services need to pick up) ───

/** Emitted when a camera device is created, updated, or deleted in admin. */
export const BUS_CAMERA_DEVICE_CHANGED = "bus:camera:device:changed" as const;
/** Emitted when camera presets are created, updated, deleted, or reordered. */
export const BUS_CAMERA_PRESETS_CHANGED = "bus:camera:presets:changed" as const;
/** Emitted when OBS device config is created, updated, or deleted in admin. */
export const BUS_OBS_CONFIG_CHANGED = "bus:obs:config:changed" as const;
/** Emitted when metadata templates (title, description, lower-third) are created, updated, or deleted. */
export const BUS_TEMPLATES_CHANGED = "bus:templates:changed" as const;
