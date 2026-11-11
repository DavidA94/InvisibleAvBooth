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

// ── Interaction hold model (Req 8, revised) ──────────────────────────────────
//
// REVISION HISTORY (why this looks different from older variants): we previously
// tried (a) a fixed "suppress inbound" window and (b) a settle-window that
// dropped inbound values for a while after the last local change. BOTH relocated
// the "phantom re-slide" bug instead of fixing it: while the user kept nudging a
// control the window never closed, so the mixer's genuine (rounded/clamped)
// value was hidden until release — and a stale echo arriving right at the window
// edge still yanked the thumb.
//
// THE REAL FIX LIVES ON THE BACKEND: the driver stamps every write to an address
// with a monotonically increasing sequence and only ever broadcasts a read-back
// that is STILL the latest write for that address (SEE BehringerXAirDriver
// writeSeq/broadcastSeq). A superseded set's read-back is dropped before it ever
// reaches a client. Given that guarantee, the frontend does NOT need to filter
// inbound values at all — anything the backend sends is, by construction, the
// newest settled truth. So the hook now:
//   • shows the user's live finger position while they interact,
//   • ACCEPTS every inbound backend value unconditionally (no settle/suppress),
//   • sends OUTBOUND with debounce + max-wait (below), and
//   • forces a final send on release.
//
// This is what lets the 2.5→2.0 correction appear even while the control is
// still held: the backend sends 2.0 as the latest value and the hook applies it.

// Outbound DEBOUNCE: after the last local change, wait this long of quiet before
// sending (collapses a flurry of micro-adjustments into one send). Small enough
// that a normal "drag and release" still feels instant via the release-forced
// emit, large enough to meaningfully coalesce a fast scrub.
export const CONTROL_DEBOUNCE_MS = 120;

// Outbound MAX-WAIT: even if the user NEVER pauses (continuous slow drag / holds
// the thumb and keeps nudging), force a send at least this often so the backend
// can command the board and echo back the authoritative value during the hold.
// This is the "longer SLA while holding" the design calls for — the board tracks
// live motion and the true value can flow back without waiting for release.
export const CONTROL_MAX_WAIT_MS = 300;

// Backend read-back debounce: while a fader/gain is being dragged the UI sends a
// burst of sets. Each is WRITTEN to the console immediately (fire-and-forget, so
// the physical board tracks the motion), but the READ-BACK that produces a
// downstream broadcast is deferred until the burst goes quiet for this long — so
// the drag yields confirmations of SETTLED values, not a replay of every
// intermediate. The backend sequence guard additionally drops any read-back that
// a newer write superseded, so only the latest value is ever broadcast. Must be
// comfortably larger than the client's effective send cadence.
export const COMMAND_DEBOUNCE_MS = 120;

// How long AFTER the last self-write (and after the settled read-back) we keep
// dropping the X Air's /xremote echoes of our own value. The console streams the
// values it sweeps through as it ramps to our target, and those echoes can lag
// behind the write by a round-trip or more under load; this guard absorbs that
// tail so a drag never re-broadcasts its own intermediate values as "external
// changes". Kept modest so a genuine physical-console move right after we let go
// is still reflected promptly.
export const SELF_ECHO_GUARD_MS = 400;

// ── Preset apply (write → verify → re-write unconfirmed) ─────────────────────
//
// The X Air has a small UDP receive buffer and silently drops packets when a
// burst of ~48 writes lands at once (the original refresh code staggered for the
// same reason). So preset apply PACES its writes, waits a short settle for the
// console to process them, reads back, and RE-WRITES only the channels that did
// not match — for a bounded number of rounds. Budget: a clean apply is
// ~(channels × stagger + settle + one round-trip) ≈ 150–250 ms; each retry round
// adds roughly stagger + settle + READBACK_TIMEOUT_MS, so 3 rounds stay under ~1 s.
export const PRESET_WRITE_STAGGER_MS = 3; // gap between channels' writes
export const PRESET_VERIFY_SETTLE_MS = 40; // let the console apply writes before reading back
export const PRESET_MAX_ROUNDS = 3; // initial write + up to 2 re-writes of unconfirmed channels
// Float compare tolerance for verify. Stored values came from the board, but they
// cross float32 (wire) ↔ float64 (JSON) and the console quantizes (fader ≈ 1/1024
// steps), so exact === can false-fail. Mute (int) is still compared exactly.
export const PRESET_VERIFY_TOLERANCE = 0.002;
// Read-back pacing + timeout for preset verify (MEASURED, XR18V2 fw 1.26): 32
// simultaneous queries intermittently lose replies; paced 1 ms apart they all
// answer, and an answered query replies in ~1–3 ms. So pace sends at 1 ms and use
// a short per-query timeout — a genuinely lost reply then costs ~100 ms (and a
// retry round) instead of the general 250 ms READBACK_TIMEOUT_MS.
export const PRESET_QUERY_STAGGER_MS = 1;
export const PRESET_READ_TIMEOUT_MS = 100;
// Frontend: if no preset ack arrives in this long, stop the spinner and tell the
// volunteer (a lost ack must never leave a button spinning forever).
export const PRESET_ACK_TIMEOUT_MS = 5000;

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

/**
 * Server→browser meter BROADCAST cap (Hz).
 *
 * The X Air pushes meter frames at ~25 fps (METERS_RATE_FACTOR = 2) and the
 * driver emits one BUS_MIXER_LEVELS per frame. Forwarding each straight to
 * `io.emit` means ~25 Socket.io messages/sec PER MIXER, fanned out to EVERY
 * connected client — the tablet(s) spend real main-thread time parsing frames
 * they can't visually distinguish. Meters are "latest value wins", so the
 * MixerSocketModule coalesces per mixer and flushes at most this often, keeping
 * peak-hold visually smooth while cutting socket traffic ~50%. 12 Hz (~83 ms)
 * is above the ~10 Hz flicker-fusion threshold for a moving bar yet well under
 * the source rate. Raise toward 25 for smoother meters at higher client cost;
 * lower toward 8 to further unburden weak tablets. Changing this is safe — it
 * only affects visual cadence, never command/state correctness.
 */
export const METERS_BROADCAST_MAX_HZ = 12;
/** Derived flush interval for the broadcast cap, in ms. */
export const METERS_BROADCAST_INTERVAL_MS = Math.round(1000 / METERS_BROADCAST_MAX_HZ);

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
