// Socket.io event name constants shared between frontend and backend.
//
// Naming convention:
//   CTS_*  — client-to-server events (frontend emits, backend handles)
//   STC_*  — server-to-client events (backend emits, frontend handles)
//
// BUS_* (internal EventBus) constants are backend-only and live in
// packages/backend/src/socketEvents.ts.

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
