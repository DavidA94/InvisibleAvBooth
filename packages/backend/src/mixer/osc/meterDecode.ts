// X Air /meters blob decoder.
//
// Blob format (verified against Patrick-Gilles Maillot's X32/X-Air OSC meter
// table): a leading 32-bit BIG-endian count of int16 samples, followed by that
// many 16-bit SIGNED LITTLE-endian integers at 1/256 dB resolution
// (value / 256 = dB). Values below NOISE_FLOOR_DBFS are treated as -Infinity.
//
// This is isolated as a pure function so it can be property-tested against
// random int16 arrays without a socket or the full driver.

import { NOISE_FLOOR_DBFS, LEVEL_AXIS_MIN_DBFS, LEVEL_AXIS_MAX_DBFS } from "@invisible-av-booth/shared";

/**
 * Decode a /meters blob into an array of dB values (one per sample).
 * Returns [] if the blob is malformed or shorter than its declared count.
 */
export function decodeMeterBlob(blob: Uint8Array): number[] {
  if (blob.length < 4) return [];
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const count = view.getUint32(0, false); // big-endian count
  const available = Math.floor((blob.length - 4) / 2);
  if (count > available) return [];

  const result: number[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const raw = view.getInt16(4 + i * 2, true); // little-endian signed int16
    const db = raw / 256;
    result[i] = db <= NOISE_FLOOR_DBFS ? -Infinity : db;
  }
  return result;
}

/**
 * Clamp a decoded dB value to the display axis (LEVEL_AXIS_MIN_DBFS..MAX_DBFS).
 * -Infinity (noise floor) clamps to the axis minimum for display.
 */
export function clampLevelDb(db: number): number {
  if (db === -Infinity || db < LEVEL_AXIS_MIN_DBFS) return LEVEL_AXIS_MIN_DBFS;
  if (db > LEVEL_AXIS_MAX_DBFS) return LEVEL_AXIS_MAX_DBFS;
  return db;
}
