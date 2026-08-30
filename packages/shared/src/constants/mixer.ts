// Mixer (Sound Board) constants shared between frontend and backend.
//
// These are level-axis, gain-window, interaction-hold, OSC-cadence, meter-bank,
// probe, read-back, and freshness constants. Hardware-specific values (OSC port,
// meter banks, gain range) are documented against their provenance in
// .kiro/specs/sound-board-control/requirements.md ("Provenance of Model-Specific
// Values"). If any prove inaccurate against real hardware, correct here and in
// the driver source.

// ── Level axis (dBFS) ────────────────────────────────────────────────────────
//
// Fixed industry-standard dBFS display range — reused from the AudioLevelMeter
// convention. 0 dBFS is the clipping ceiling; the axis runs down to -60.
export const LEVEL_AXIS_MAX_DBFS = 0;
export const LEVEL_AXIS_MIN_DBFS = -60;

/** Gain window LEVEL axis max height (easy to change per Req 7.4.1). ~400px at 16px root. */
export const GAIN_WINDOW_MAX_HEIGHT_REM = 25;

// ── Gain-staging target band and danger fades (dBFS) ─────────────────────────
//
// Sensible broadcast defaults from standard gain-staging guidance — tune freely.
// Sources: the widely-cited "-18 dBFS is the new 0 dBu" reference level; a safe
// zone of roughly -10..-20 dBFS; peaks kept below ~-6 dBFS; 0 dBFS = hard clip;
// interfaces like Audient's Smartgain target ~-12 dBFS peaks. We center the
// "good" band on the -18 dBFS average target, extend its top to -8 so typical
// peaks land at the band's upper edge; -6..0 is "approaching clip" (red);
// -40..-60 is "approaching the noise floor" (blue).
export const GOOD_RANGE_BAND_DBFS = { topDb: -8, bottomDb: -18 };
export const RED_FADE_DBFS = { topDb: 0, bottomDb: -6 }; // darkest at 0 (clip)
export const BLUE_FADE_DBFS = { topDb: -40, bottomDb: -60 }; // darkest at -60 (noise)

// ── Interaction hold model (Req 8) ───────────────────────────────────────────
//
// Inbound-suppression window: for this long after the last local change to a
// fader/gain control, incoming backend updates for that control are ignored
// (dropped, not queued) so the control never jumps back mid-adjustment.
export const CONTROL_SUPPRESS_MS = 300;
// Outbound throttle: emit at most this often while dragging, plus a guaranteed
// final emit on release.
export const CONTROL_THROTTLE_MS = 50;

// Mute-confirm window (Req 6, revised): mute is a discrete toggle, so the UI
// OPTIMISTICALLY shows the commanded On/Off immediately (we trust the command
// went through) and only falls back to the "Audio: Unknown" state if the mixer
// has not confirmed the value within this window. This avoids a visible flash of
// "Unknown" on every normal toggle while still surfacing a genuinely lost/failed
// command. Read-back exhaustion (Req 6.6) still forces Unknown regardless.
export const MUTE_CONFIRM_TIMEOUT_MS = 500;

/** Envelope decimation for the gain window: min/max pairs per second (Req 4.4). */
export const ENVELOPE_PAIRS_PER_SEC = 60;

// ── OSC / subscription cadences (X Air) ──────────────────────────────────────

/** Default OSC/UDP port for the X Air family (X32 uses 10023). */
export const OSC_PORT_DEFAULT = 10024;
/** Re-send /xremote this often; the console drops the subscriber after ~10 s. */
export const XREMOTE_RENEW_MS = 8000;
/** Re-send the /meters subscription this often while metering is enabled. */
export const METERS_RENEW_MS = 1000;

// ── /meters bank selection (X Air) ───────────────────────────────────────────
//
// Verified against Patrick-Gilles Maillot's X32/X-Air OSC meter-bank table.
//   Bank 1, indices 0–15 = per-channel PRE-FADER input (always-visible meter, Req 5.4).
//   Bank 2, indices 0–15 = post-preamp / pre-processing (gain-window envelope tap, Req 4.5);
//                indices 18–35 = 18× USB-in (setup verification of USB routing).
// Blob format: leading 32-bit BIG-endian count of int16 samples; each sample a
// 16-bit SIGNED LITTLE-endian integer at 1/256 dB (value / 256 = dB); values
// below NOISE_FLOOR_DBFS are treated as -inf.
export const METERS_BANK_CHANNEL_PREFADER = 1;
export const METERS_BANK_PREAMP_IN = 2;
export const METERS_CHANNEL_INDEX_BASE = 0; // channels occupy indices 0..15 in both banks
export const NOISE_FLOOR_DBFS = -90;

/** Connection probe (Req 9.4): send /xinfo, await a reply within this window. */
export const MIXER_PROBE_TIMEOUT_MS = 800;

// ── Read-back reconciliation retry (Req 2.7) — UDP has no delivery guarantee ─
export const READBACK_TIMEOUT_MS = 250;
export const READBACK_MAX_RETRIES = 3;

/**
 * Status-indicator freshness — no confirmed mixer round-trip within this window
 * → unhealthy. MUST be > XREMOTE_RENEW_MS (8000) with enough margin to tolerate
 * a DROPPED renewal reply over UDP: one lost reply pushes the next confirmed
 * round-trip to ~2× the renewal interval, so the window must clear 2× + margin
 * or a healthy board flaps red mid-sermon (Req 12.2). 18000 = ~2×8000 + 2000.
 */
export const CONTROLS_FRESHNESS_MS = 18000;
