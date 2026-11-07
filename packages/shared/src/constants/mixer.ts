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
// Blob format: leading 32-bit LITTLE-endian count of int16 samples (verified on
// XR18); each sample a 16-bit SIGNED LITTLE-endian integer at 1/256 dB
// (value / 256 = dB); values below NOISE_FLOOR_DBFS are treated as -inf.
export const METERS_BANK_CHANNEL_PREFADER = 1;
export const METERS_CHANNEL_INDEX_BASE = 0; // channels occupy indices 0..15
export const NOISE_FLOOR_DBFS = -90;

/**
 * Meter subscription update-rate factor (X Air /meters second argument).
 *
 * The X Air/X32 `/meters` command takes a STRING (the meter bank address, e.g.
 * "/meters/1") and an INT rate factor. The console emits one meter frame every
 * `factor` internal ticks (~1/50 s each). `1` ≈ 50 fps; we use `2` (~25 fps),
 * which is smooth to the eye and easily keeps up with peak-hold while roughly
 * halving UDP traffic vs. every frame. Once subscribed the console streams
 * continuously until the ~10 s subscription window lapses, so it must be renewed
 * (see METERS_RENEW_MS). This is why a WRONG subscription format shows updates
 * only coincidentally (e.g. tied to other traffic) rather than as a live stream.
 */
export const METERS_RATE_FACTOR = 2;

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

// ── Channel scribble-strip colors (X Air /ch/NN/config/color, 0–15) ──────────
//
// The X Air stores a per-channel color as an int 0–15 (verified against the
// X-Air OSC wiki). It encodes BOTH the hue AND the scribble-strip style:
//   0–7   = colored text/accent on a dark background (the "outline" look)
//   8–15  = the same hues "inverted": a SOLID colored background with dark text
// Index 0 (and 8) = OFF (no color). Hex values read clearly on the dark theme
// while matching the console's color names.
export const MIXER_COLOR_HEX: Record<number, string> = {
  1: "#E74C3C", // RD red
  2: "#2ECC71", // GN green
  3: "#F1C40F", // YE yellow
  4: "#3498DB", // BL blue
  5: "#E056B4", // MG magenta
  6: "#1ABC9C", // CY cyan
  7: "#ECF0F1", // WH white
};

/** The resolved scribble-strip color + style for a channel. */
export interface MixerColor {
  /** CSS hex for the hue. */
  hex: string;
  /** true = solid colored background (inverted scribble, index 8–15); false = outline/accent. */
  inverted: boolean;
}

/**
 * Resolve an X Air channel color index (0–15) into a hue + style, or null when
 * the channel has no color (OFF / absent). The hue repeats every 8; indices
 * 8–15 are the "inverted" (solid-background) variants of 0–7.
 */
export function resolveMixerColor(color: number | undefined): MixerColor | null {
  if (color === undefined) return null;
  const hue = ((color % 8) + 8) % 8; // normalize into 0..7
  const hex = MIXER_COLOR_HEX[hue];
  if (!hex) return null; // OFF (hue 0)
  return { hex, inverted: color >= 8 };
}
