// Mixer (Sound Board) types shared between frontend and backend.
//
// These are the canonical definitions for audio mixer control — the frontend
// and backend both import from here so the wire contract cannot drift.
//
// WHY a normalized shape: the HAL (MixerControlInterface) presents every mixer
// model through this single vocabulary (name/fader/mute/gain/level), so the
// widget, presets, and services never branch on model or transport. The
// Behringer X Air is the only model in this release, but the types are model-
// agnostic by design (steering §8 Extensibility).

/** Mixer model family. Only the Behringer X Air is supported in this release. */
export type MixerModel = "behringer-xair";

/**
 * Toggleable mixer capabilities that gate which controls the widget renders.
 * NOTE: "fader" and "mute" are CORE — always present, never toggled — so they
 * are intentionally NOT in this list (Req 6.7). A mixer without faders/mutes is
 * not a supported concept.
 *
 * NOTE: "channel-audio-capture" (the gain-window live-audio view / PipeWire
 * capture layer) was removed — see `sound-board-control` spec Appendix A. It is
 * recoverable from git history if a future feature (e.g. multitrack recording)
 * needs it.
 */
/**
 * - "usb-trim-follows-gain": OPT-IN. Every gain write made through this app (gain
 *   slider and presets) also sets the channel's USB-return trim to the same dB
 *   (clamped to the trim's ±18 dB range), so tuning against a DAW recording played
 *   back through the USB returns behaves like tuning the live preamp. See the
 *   "DAW playback tuning" section of the sound-board-control design doc.
 */
export type MixerFeature = "gain-control" | "channel-metering" | "usb-trim-follows-gain";

export interface MixerCapabilities {
  /**
   * Runtime wire form (driver → frontend): the enabled-feature list, derived
   * from the stored `features` column (Record<string, boolean>). The widget
   * renders controls purely from this list.
   */
  features: MixerFeature[];
  /** Model-declared preamp gain range in dB. X Air: { minDb: -12, maxDb: 60 }. */
  gainRange: { minDb: number; maxDb: number };
}

export interface MixerChannelState {
  /** 1-based channel index. */
  channel: number;
  /** Channel name verbatim from the mixer console. */
  name: string;
  /** Normalized fader level, 0.0–1.0 (console taper, not linear). */
  fader: number;
  /**
   * Authoritative dB equivalent of `fader`, computed BY THE BACKEND driver via
   * the shared `faderFloatToDb` util and sent with state. The frontend displays
   * this value and uses the SAME shared util only for rendering tick positions —
   * it does NOT independently derive the channel's dB from `fader`, so the two
   * sides cannot disagree at tick boundaries.
   */
  faderDb: number;
  /** true = muted (interface sense; the driver inverts to the X Air's mix/on). */
  muted: boolean;
  /** Preamp gain in dB, within capabilities.gainRange. */
  gainDb: number;
  /**
   * Channel scribble-strip color index from the X Air (`/ch/NN/config/color`,
   * 0–15). 0 = OFF (no color); 1–7 = Red/Green/Yellow/Blue/Magenta/Cyan/White;
   * 8–15 = the same hues in "inverted" scribble style. The UI mirrors the hue so
   * channel strips match the physical console. Absent until first read.
   */
  color?: number;
  /**
   * true when a set command's read-back was exhausted (Req 15.8) — the value
   * shown may not be mixer-confirmed. Cleared on the next confirmed value
   * (read-back success or /xremote push). Optional/absent = reconciled.
   */
  unreconciled?: boolean;
}

export interface MixerPresetSummary {
  id: string;
  name: string;
  sortOrder: number;
}

export interface MixerState {
  mixerId: string;
  connected: boolean;
  model: MixerModel;
  channelCount: number;
  capabilities: MixerCapabilities;
  channels: MixerChannelState[];
  presets: MixerPresetSummary[];
}

/**
 * Open OSC address→value map for a board preset. Values are the primitive OSC
 * arg (number for fader/gain, 0/1 for mute). Stored as JSON so future
 * parameters (e.g., EQ) can be added without a schema change (Req 10.2).
 */
export type MixerPresetPayload = Record<string, number | string>;

/**
 * Result of a preset activation, sent back to the requesting client
 * (STC_MIXER_PRESET_RESULT). The backend writes the preset's audible fields,
 * verifies them via scoped read-back, and reports the outcome so the UI can end
 * the button's loading state and toast success/failure — never guessing.
 *
 * `ok` is true only when every WRITTEN (audible) field was confirmed by the
 * mixer. On failure, `unconfirmedChannels` names the channels that did not
 * confirm so the volunteer sees exactly what to check.
 */
export interface MixerPresetResult {
  mixerId: string;
  presetId: string;
  ok: boolean;
  /** Channels whose written values the mixer did not confirm (failure only). */
  unconfirmedChannels?: number[];
  /** Human-readable error (e.g. "Mixer not found", "Preset not found"). */
  error?: string;
}

/** Per-channel levels for the strip meters (mono, dBFS). */
export interface MixerChannelLevel {
  channel: number;
  /** INPUT level (pre-fader, pre-mute) in dBFS, clamped to the display axis. Shows "is a signal arriving?". */
  levelDb: number;
  /**
   * OUTGOING level (post-fader, post-mute) in dBFS, clamped to the display axis —
   * "what this channel is actually sending". Read from the board's TRUE per-channel
   * post-fader meter (one registered client per unmuted channel); the axis minimum
   * when muted. ABSENT for an unmuted channel whose first post-fader frame hasn't
   * arrived yet (~80 ms after unmute) — the UI shows nothing rather than a guess.
   */
  postFaderDb?: number;
}

/**
 * A per-channel set command. Any subset of fader/muted/gainDb may be present;
 * on the X Air each maps to a SEPARATE OSC address, so each present field is
 * written and reconciled independently (Req 2.7 / Req 11.2).
 */
export interface MixerCommand {
  mixerId: string;
  channel: number;
  /** Normalized fader level, 0.0–1.0. */
  fader?: number;
  muted?: boolean;
  /** Preamp gain in dB. */
  gainDb?: number;
}
