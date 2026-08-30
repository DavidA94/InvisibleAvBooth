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
 */
export type MixerFeature = "gain-control" | "channel-metering" | "channel-audio-capture";

export interface MixerCapabilities {
  /**
   * Runtime wire form (driver → frontend): the enabled-feature list, derived
   * from the stored `features` column (Record<string, boolean>) minus any
   * runtime downgrades (e.g., PipeWire unavailable downgrades
   * "channel-audio-capture"). The widget renders controls purely from this list.
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

/** Per-channel level for the always-visible meter (mono, dBFS). */
export interface MixerChannelLevel {
  channel: number;
  /** dBFS, clamped to LEVEL_AXIS_MIN_DBFS..LEVEL_AXIS_MAX_DBFS. */
  levelDb: number;
}

/** One decimated envelope frame for the gain window (min/max in dBFS). */
export interface EnvelopePair {
  minDb: number;
  maxDb: number;
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
