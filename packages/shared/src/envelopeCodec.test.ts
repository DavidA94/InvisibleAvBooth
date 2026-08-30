import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { encodeEnvelopeFrame, decodeEnvelopeFrame } from "./envelopeCodec";
import type { EnvelopePair } from "./types/mixer";

describe("envelopeCodec", () => {
  it("round-trips a batch of pairs", () => {
    const pairs: EnvelopePair[] = [
      { minDb: -40, maxDb: -12 },
      { minDb: -60, maxDb: -8 },
    ];
    const decoded = decodeEnvelopeFrame(encodeEnvelopeFrame(pairs));
    expect(decoded).toHaveLength(2);
    expect(decoded[0]!.minDb).toBeCloseTo(-40, 3);
    expect(decoded[0]!.maxDb).toBeCloseTo(-12, 3);
    expect(decoded[1]!.minDb).toBeCloseTo(-60, 3);
  });

  it("encodes an empty batch", () => {
    expect(decodeEnvelopeFrame(encodeEnvelopeFrame([]))).toEqual([]);
  });

  it("decodes from a Uint8Array view", () => {
    const buffer = encodeEnvelopeFrame([{ minDb: -18, maxDb: -6 }]);
    const decoded = decodeEnvelopeFrame(new Uint8Array(buffer));
    expect(decoded[0]!.maxDb).toBeCloseTo(-6, 3);
  });

  it("returns [] for a truncated frame (count exceeds bytes)", () => {
    const buffer = new ArrayBuffer(2);
    new DataView(buffer).setUint16(0, 5, true); // claims 5 pairs, has none
    expect(decodeEnvelopeFrame(buffer)).toEqual([]);
  });

  it("returns [] for a frame too short for the header", () => {
    expect(decodeEnvelopeFrame(new ArrayBuffer(1))).toEqual([]);
  });

  it("property: round-trips arbitrary pair batches within float32 tolerance", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ minDb: fc.double({ min: -60, max: 0, noNaN: true }), maxDb: fc.double({ min: -60, max: 0, noNaN: true }) }), { maxLength: 64 }),
        (pairs) => {
          const decoded = decodeEnvelopeFrame(encodeEnvelopeFrame(pairs));
          expect(decoded).toHaveLength(pairs.length);
          pairs.forEach((pair, index) => {
            expect(decoded[index]!.minDb).toBeCloseTo(pair.minDb, 2);
            expect(decoded[index]!.maxDb).toBeCloseTo(pair.maxDb, 2);
          });
        },
      ),
    );
  });
});
