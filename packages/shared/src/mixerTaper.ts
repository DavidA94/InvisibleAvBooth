// X Air / X32 fader taper conversions, shared so the backend driver (dB↔float)
// and the widget (dB tick positions) agree exactly and cannot disagree at
// boundaries.
//
// WHY a real taper (not linear 0–100%): a linear control would misrepresent
// where "0 dB" (unity) sits and make fine control near unity impossible. The
// console's fader is a normalized 0.0–1.0 float mapped to −∞…+10 dB via a
// piecewise curve. Real dB ticks require the true taper.
//
// The X32/X Air fader taper is piecewise-linear IN dB across the float domain
// (documented by Patrick-Gilles Maillot's X32 OSC protocol notes, corroborated
// by the Behringer World wiki and the xair-api-python project):
//
//   float ∈ [0.5, 1.0]  →  dB = 40·float − 30      (0.75 → 0 dB, 1.0 → +10 dB)
//   float ∈ [0.25, 0.5) →  dB = 80·float − 50      (0.5  → −10 dB)
//   float ∈ [0.0625,0.25)→ dB = 160·float − 70     (0.25 → −30 dB)
//   float ∈ [0.0, 0.0625)→ dB = 480·float − 90     (0.0625 → −60 dB)
//   float === 0.0        →  −∞ dB (fully off)
//
// These segments are continuous at their shared endpoints, so the mapping is
// monotonic and round-trips within display tolerance.

const NEG_INF = -Infinity;

/** Convert a normalized fader float (0.0–1.0) to dB. 0.0 → -Infinity. */
export function faderFloatToDb(float: number): number {
  if (float <= 0) return NEG_INF;
  const clamped = float > 1 ? 1 : float;
  if (clamped >= 0.5) return clamped * 40 - 30;
  if (clamped >= 0.25) return clamped * 80 - 50;
  if (clamped >= 0.0625) return clamped * 160 - 70;
  return clamped * 480 - 90;
}

/** Convert dB to a normalized fader float (0.0–1.0). -Infinity → 0.0. */
export function faderDbToFloat(db: number): number {
  if (db === NEG_INF || db <= -90) return 0;
  const clamped = db > 10 ? 10 : db;
  // Inverse of faderFloatToDb — the dB breakpoints (-10, -30, -60) come directly
  // from evaluating the forward segments at their float boundaries, so the two
  // functions are exact inverses and agree at every boundary.
  let float: number;
  if (clamped >= -10)
    float = (clamped + 30) / 40; // float [0.5, 1.0]
  else if (clamped >= -30)
    float = (clamped + 50) / 80; // float [0.25, 0.5)
  else if (clamped >= -60)
    float = (clamped + 70) / 160; // float [0.0625, 0.25)
  else float = (clamped + 90) / 480; // float [0.0, 0.0625)
  // Guard against tiny floating-point excursions outside [0, 1].
  if (float < 0) return 0;
  if (float > 1) return 1;
  return float;
}

/**
 * dB tick positions for the vertical fader scale, top (loudest) to bottom.
 * -Infinity renders as "-inf". Reflects the console taper (0 dB near 75% travel).
 */
export const FADER_TICKS_DB: number[] = [10, 5, 0, -5, -10, -20, -30, -50, -Infinity];

// ── Headamp (preamp) gain conversion ─────────────────────────────────────────
//
// GOTCHA (verified against the X Air OSC protocol + behringer.world forum
// threads): /headamp/NNN/gain is a NORMALIZED 0.0–1.0 float on the wire, NOT the
// raw dB value — exactly like the fader. The XR18 MIDAS preamps span -12…+60 dB
// (72 dB), mapped LINEARLY: 0.0 → -12 dB, 1.0 → +60 dB. Sending the raw dB (e.g.
// 24.0) makes the console clamp to 1.0 (+60 dB) and the official app show a
// different value — which is exactly the bug this fixes. The dB range is passed
// in from the model-declared gainRange so a future model with a different span
// still maps correctly.

/** Convert a gain in dB to the normalized 0.0–1.0 OSC wire value (linear). */
export function gainDbToFloat(gainDb: number, minDb: number, maxDb: number): number {
  if (maxDb <= minDb) return 0;
  const float = (gainDb - minDb) / (maxDb - minDb);
  if (float < 0) return 0;
  if (float > 1) return 1;
  return float;
}

/** Convert a normalized 0.0–1.0 OSC wire value back to gain in dB (linear). */
export function gainFloatToDb(float: number, minDb: number, maxDb: number): number {
  const clamped = float < 0 ? 0 : float > 1 ? 1 : float;
  return minDb + clamped * (maxDb - minDb);
}
