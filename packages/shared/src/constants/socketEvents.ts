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

export const STC_OBS_AUDIO_LEVELS = "stc:obs:audio:levels" as const;

// ── Camera: Server → Client ───────────────────────────────────────────────────

export const STC_CAMERA_STATE = "stc:camera:state" as const;
export const STC_CAMERA_STATE_UPDATE = "stc:camera:state:update" as const;

// ── Camera: Client → Server ──────────────────────────────────────────────────

export const CTS_CAMERA_PTZ_MOVE_START = "cts:camera:ptz:move:start" as const;
export const CTS_CAMERA_PTZ_MOVE_KEEPALIVE = "cts:camera:ptz:move:keepalive" as const;
export const CTS_CAMERA_PTZ_MOVE_STOP = "cts:camera:ptz:move:stop" as const;
export const CTS_CAMERA_SET = "cts:camera:set" as const;
export const CTS_CAMERA_PRESET_ACTIVATE = "cts:camera:preset:activate" as const;
export const CTS_CAMERA_PTZ_TAP_TO_CENTER = "cts:camera:ptz:tap-to-center" as const;

// ── Mixer (Sound Board): Server → Client ──────────────────────────────────────

export const STC_MIXER_STATE = "stc:mixer:state" as const; // full state (initial + on change)
export const STC_MIXER_STATE_UPDATE = "stc:mixer:state:update" as const; // single mixer/channel delta
export const STC_MIXER_LEVELS = "stc:mixer:levels" as const; // per-channel meter levels (throttled)
export const STC_MIXER_ERROR = "stc:mixer:error" as const; // catastrophic capture-path raise: { errorCode, mixerId, message, level: "modal" }
export const STC_MIXER_ERROR_RESOLVED = "stc:mixer:error:resolved" as const; // resolution: { errorCode } → removeNotification(errorCode)

// ── Mixer (Sound Board): Client → Server ──────────────────────────────────────

export const CTS_MIXER_SET = "cts:mixer:set" as const; // { mixerId, channel, fader?/muted?/gainDb? }
export const CTS_MIXER_PRESET_ACTIVATE = "cts:mixer:preset:activate" as const; // { mixerId, presetId }
export const CTS_MIXER_MONITOR_START = "cts:mixer:monitor:start" as const; // { mixerId, channel }
export const CTS_MIXER_MONITOR_STOP = "cts:mixer:monitor:stop" as const; // { mixerId, channel }
export const CTS_MIXER_WIDGET_PRESENT = "cts:mixer:widget:present" as const; // { mixerId, present } — per-mixer metering lifecycle

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
