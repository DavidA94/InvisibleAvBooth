// Event name constants for all three event layers.
//
// Naming convention:
//   BUS_*  — internal EventBus events (backend-only, never cross the socket boundary)
//   CTS_*  — client-to-server Socket.io events (frontend emits, backend handles)
//   STC_*  — server-to-client Socket.io events (backend emits, frontend handles)
//
// Using constants instead of inline strings prevents typos, enables IDE autocomplete,
// and gives a single place to audit the full event contract.

// ── EventBus (internal) ───────────────────────────────────────────────────────

export const BUS_OBS_STATE_CHANGED = "bus:obs:state:changed" as const;
export const BUS_OBS_ERROR = "bus:obs:error" as const;
export const BUS_OBS_ERROR_RESOLVED = "bus:obs:error:resolved" as const;
export const BUS_SESSION_MANIFEST_UPDATED = "bus:session:manifest:updated" as const;
export const BUS_DEVICE_CAPABILITIES_UPDATED = "bus:device:capabilities:updated" as const;

// ── Client → Server ───────────────────────────────────────────────────────────

export const CTS_OBS_COMMAND = "cts:obs:command" as const;
export const CTS_OBS_RECONNECT = "cts:obs:reconnect" as const;
export const CTS_SESSION_MANIFEST_UPDATE = "cts:session:manifest:update" as const;

// ── Server → Client ───────────────────────────────────────────────────────────

export const STC_OBS_STATE = "stc:obs:state" as const;
export const STC_OBS_ERROR = "stc:obs:error" as const;
export const STC_OBS_ERROR_RESOLVED = "stc:obs:error:resolved" as const;
export const STC_SESSION_MANIFEST_UPDATED = "stc:session:manifest:updated" as const;
export const STC_DEVICE_CAPABILITIES = "stc:device:capabilities" as const;
