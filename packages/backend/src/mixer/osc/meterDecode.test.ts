import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { decodeMeterBlob, clampLevelDb } from "./meterDecode.js";
import { NOISE_FLOOR_DBFS, LEVEL_AXIS_MIN_DBFS, LEVEL_AXIS_MAX_DBFS } from "@invisible-av-booth/shared";

/** Build a /meters blob: 32-bit LE count + int16 LE samples (matches XR18 hardware). */
function buildBlob(int16Values: number[]): Uint8Array {
  const buffer = new ArrayBuffer(4 + int16Values.length * 2);
  const view = new DataView(buffer);
  view.setUint32(0, int16Values.length, true);
  int16Values.forEach((value, index) => view.setInt16(4 + index * 2, value, true));
  return new Uint8Array(buffer);
}

describe("decodeMeterBlob", () => {
  it("returns [] for a blob shorter than the 4-byte header", () => {
    expect(decodeMeterBlob(new Uint8Array([0, 0, 0]))).toEqual([]);
  });

  it("returns [] when the declared count exceeds available samples", () => {
    const buffer = new ArrayBuffer(4 + 2); // header says many, only 1 sample present
    const view = new DataView(buffer);
    view.setUint32(0, 100, true);
    expect(decodeMeterBlob(new Uint8Array(buffer))).toEqual([]);
  });

  it("decodes int16/256 = dB for a known blob", () => {
    // -12 dB → -12*256 = -3072 ; -40 dB → -10240
    const blob = buildBlob([-3072, -10240]);
    const decoded = decodeMeterBlob(blob);
    expect(decoded[0]).toBeCloseTo(-12, 5);
    expect(decoded[1]).toBeCloseTo(-40, 5);
  });

  it("treats samples at or below the noise floor as -Infinity", () => {
    const blob = buildBlob([Math.round((NOISE_FLOOR_DBFS - 5) * 256)]);
    expect(decodeMeterBlob(blob)[0]).toBe(-Infinity);
  });

  it("property: decodes count int16 samples with value/256 = dB (above noise floor)", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -20000, max: 0 }), { minLength: 0, maxLength: 40 }), (samples) => {
        const decoded = decodeMeterBlob(buildBlob(samples));
        expect(decoded).toHaveLength(samples.length);
        samples.forEach((raw, index) => {
          const expected = raw / 256 <= NOISE_FLOOR_DBFS ? -Infinity : raw / 256;
          expect(decoded[index]).toBe(expected);
        });
      }),
    );
  });
});

describe("clampLevelDb", () => {
  it("clamps -Infinity (noise) to the axis minimum", () => {
    expect(clampLevelDb(-Infinity)).toBe(LEVEL_AXIS_MIN_DBFS);
  });

  it("clamps values below the axis minimum up to the minimum", () => {
    expect(clampLevelDb(-120)).toBe(LEVEL_AXIS_MIN_DBFS);
  });

  it("clamps values above 0 dBFS down to the maximum", () => {
    expect(clampLevelDb(5)).toBe(LEVEL_AXIS_MAX_DBFS);
  });

  it("passes through in-range values", () => {
    expect(clampLevelDb(-18)).toBe(-18);
  });

  it("property: output is always within the display axis", () => {
    fc.assert(
      fc.property(fc.double({ min: -200, max: 50, noNaN: true }), (db) => {
        const clamped = clampLevelDb(db);
        return clamped >= LEVEL_AXIS_MIN_DBFS && clamped <= LEVEL_AXIS_MAX_DBFS;
      }),
    );
  });
});
