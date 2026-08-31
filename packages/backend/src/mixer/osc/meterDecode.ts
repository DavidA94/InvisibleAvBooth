// X Air /meters blob decoder.
//
// Blob format (VERIFIED against a real Behringer XR18 — see below): a leading
// 32-bit LITTLE-endian count of int16 samples, followed by that many 16-bit
// SIGNED LITTLE-endian integers at 1/256 dB resolution (value / 256 = dB).
// Values below NOISE_FLOOR_DBFS are treated as -Infinity.
//
// ENDIANNESS NOTE: community docs conflict on the count header — Patrick
// Maillot's X32 notes say the length is big-endian, but live capture from an
// XR18 shows the header bytes as `28 00 00 00` for 40 samples, i.e. the count is
// LITTLE-endian on X Air (matching the little-endian samples). Reading it as
// big-endian yields 0x28000000 (≫ the real count) and the guard below rejects
// the whole blob, so meters silently never decode. We read it little-endian to
// match the hardware; the OSC transport already strips the OSC blob's own 4-byte
// length prefix, so offset 0 here is the meter count.
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
  const count = view.getUint32(0, true); // little-endian count (verified on XR18)
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
