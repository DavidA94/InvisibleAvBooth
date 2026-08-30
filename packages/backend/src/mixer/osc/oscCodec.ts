// Thin OSC codec wrapper over @mxfriend/osc.
//
// WHY @mxfriend/osc: TypeScript-native, maintained, and part of an ecosystem
// built specifically for Behringer/Midas OSC. It cleanly separates the OSC codec
// (OSCEncoder/OSCDecoder) from transport (UdpOSCPort), so we own the UDP socket
// and the /xremote + /meters subscription lifecycle — exactly the control we
// need for a fire-and-forget device.
//
// VERSION RISK (documented per Req 2.1 / 14.3): at implementation time the only
// published release is 3.0.0-alpha.2, pinned exactly in package.json. It is
// functional (codec round-trips verified against the X Air message shapes), but
// being an alpha it may change. FALLBACK: `osc` (osc.js) — mature and spec-
// compliant but low-activity and not TS-native. The swap point is confined to
// this file and BehringerXAirDriver; callers use the small OscMessage shape
// below, not the library's types, so replacing the library is a local change.

import { OSCEncoder, OSCDecoder } from "@mxfriend/osc";

/** A decoded/encoded OSC message in the minimal shape the mixer code needs. */
export interface OscMessage {
  address: string;
  /** OSC type-tag string (e.g. "f", "i", "s", "ssss", "b"). Empty for no args. */
  types: string;
  /** Argument values, positionally matching `types`. Blobs decode to Buffer/Uint8Array. */
  values: Array<number | string | Uint8Array>;
}

const encoder = new OSCEncoder();
const decoder = new OSCDecoder();

/** Encode an OSC message to a Node Buffer ready for UDP send. */
export function encodeOsc(address: string, types = "", values: Array<number | string | Uint8Array> = []): Buffer {
  const encoded = encoder.encodeMessage(address, types, values);
  return Buffer.from(encoded as unknown as Uint8Array);
}

/**
 * Decode the first OSC message from a UDP packet. Returns null when the packet
 * is a bundle or cannot be decoded to a single message (the mixer only sends us
 * plain messages for the addresses we query).
 */
export function decodeOsc(packet: Buffer): OscMessage | null {
  try {
    for (const [item] of decoder.decodePacket(packet)) {
      // A bundle has an `elements` array; a message has an `address`.
      if (item && typeof item === "object" && "address" in item) {
        const message = item as { address: string; types?: string; values?: unknown[] };
        return {
          address: message.address,
          types: message.types ?? "",
          values: (message.values ?? []) as OscMessage["values"],
        };
      }
      return null;
    }
  } catch {
    return null;
  }
  return null;
}
