// Binary codec for the gain-window envelope stream, shared between the backend
// encoder (AudioPreviewManager) and the frontend decoder (EnvelopeCanvas) so the
// wire format cannot drift (Req 24b).
//
// WHY binary (not JSON): the envelope streams at ENVELOPE_PAIRS_PER_SEC (~60/s);
// binary matches the /preview/* transport's framing and avoids per-frame parse
// cost. This is a SEPARATE frame namespace from the video PREVIEW_MSG_* prefixes
// — it rides its own /preview/mixer/* socket and never shares the video type
// bytes.
//
// Frame layout (little-endian):
//   [uint16 count][ for each pair: float32 minDb, float32 maxDb ]
// A frame carries a small batch of EnvelopePairs. minDb/maxDb are dBFS.

import type { EnvelopePair } from "./types/mixer.js";

/** 2-byte count header + 8 bytes per pair (two float32). */
const HEADER_BYTES = 2;
const BYTES_PER_PAIR = 8;

/** Encode a batch of envelope pairs to a binary ArrayBuffer for the WS transport. */
export function encodeEnvelopeFrame(pairs: EnvelopePair[]): ArrayBuffer {
  const buffer = new ArrayBuffer(HEADER_BYTES + pairs.length * BYTES_PER_PAIR);
  const view = new DataView(buffer);
  view.setUint16(0, pairs.length, true);
  pairs.forEach((pair, index) => {
    const offset = HEADER_BYTES + index * BYTES_PER_PAIR;
    view.setFloat32(offset, pair.minDb, true);
    view.setFloat32(offset + 4, pair.maxDb, true);
  });
  return buffer;
}

/**
 * Decode an envelope frame. Accepts an ArrayBuffer or a view over one.
 * Returns [] for a frame too short to contain its declared count.
 */
export function decodeEnvelopeFrame(data: ArrayBuffer | Uint8Array): EnvelopePair[] {
  const view = data instanceof Uint8Array ? new DataView(data.buffer, data.byteOffset, data.byteLength) : new DataView(data);
  if (view.byteLength < HEADER_BYTES) return [];
  const count = view.getUint16(0, true);
  const available = Math.floor((view.byteLength - HEADER_BYTES) / BYTES_PER_PAIR);
  if (count > available) return [];

  const pairs: EnvelopePair[] = new Array(count);
  for (let index = 0; index < count; index++) {
    const offset = HEADER_BYTES + index * BYTES_PER_PAIR;
    pairs[index] = { minDb: view.getFloat32(offset, true), maxDb: view.getFloat32(offset + 4, true) };
  }
  return pairs;
}
