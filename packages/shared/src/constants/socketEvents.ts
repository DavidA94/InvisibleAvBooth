// Socket.io event name constants shared between frontend and backend.
//
// Naming convention:
//   CTS_*  — client-to-server events (frontend emits, backend handles)
//   STC_*  — server-to-client events (backend emits, frontend handles)
//   STO_*  — server-to-overlay events (backend emits on /overlay ns, overlay handles)
//   OTS_*  — overlay-to-server events (overlay emits on /overlay ns, backend handles)
//
// BUS_* (internal EventBus) constants are backend-only and live in
// packages/backend/src/eventBus/types.ts.

// ── Client → Server ───────────────────────────────────────────────────────────

export const CTS_OBS_COMMAND = "cts:obs:command" as const;
export const CTS_OBS_RECONNECT = "cts:obs:reconnect" as const;
export const CTS_SESSION_MANIFEST_UPDATE = "cts:session:manifest:update" as const;
export const CTS_PLATFORM_COMMAND = "cts:platform:command" as const;
export const CTS_REQUEST_INITIAL_STATE = "cts:request:initial:state" as const;

// ── Server → Client ───────────────────────────────────────────────────────────

export const STC_OBS_STATE = "stc:obs:state" as const;
export const STC_OBS_ERROR = "stc:obs:error" as const;
export const STC_OBS_ERROR_RESOLVED = "stc:obs:error:resolved" as const;
export const STC_SESSION_MANIFEST_UPDATED = "stc:session:manifest:updated" as const;
export const STC_DEVICE_CAPABILITIES = "stc:device:capabilities" as const;
export const STC_PLATFORM_STATE = "stc:platform:state" as const;
export const STC_PLATFORM_HEALTH = "stc:platform:health" as const;
export const STC_RELAY_STATE = "stc:relay:state" as const;
export const STC_PLATFORM_READINESS = "stc:platform:readiness" as const;

// ── Lower Thirds: Client → Server ─────────────────────────────────────────────

export const CTS_LOWER_THIRD_COMMAND = "cts:lower-third:command" as const;

// ── Lower Thirds: Server → Client ─────────────────────────────────────────────

export const STC_LOWER_THIRD_STATE = "stc:lower-third:state" as const;

// ── Lower Thirds: Server → Overlay (/overlay namespace) ───────────────────────

export const STO_LOWER_THIRD_SHOW = "sto:lower-third:show" as const;
export const STO_LOWER_THIRD_DISMISS = "sto:lower-third:dismiss" as const;
export const STO_LOWER_THIRD_PUSH_UP = "sto:lower-third:push-up" as const;
export const STO_LOWER_THIRD_PAGE = "sto:lower-third:page" as const;
export const STO_LOWER_THIRD_STATE = "sto:lower-third:state" as const;
export const STO_LOWER_THIRD_MEASURE = "sto:lower-third:measure" as const;
export const STO_LOWER_THIRD_FORCE_CLEAR = "sto:lower-third:force-clear" as const;

// ── Lower Thirds: Overlay → Server (/overlay namespace) ───────────────────────

export const OTS_LOWER_THIRD_PHASE = "ots:lower-third:phase" as const;
export const OTS_LOWER_THIRD_RESOLUTION = "ots:lower-third:resolution" as const;
export const OTS_LOWER_THIRD_PAGES = "ots:lower-third:pages" as const;
