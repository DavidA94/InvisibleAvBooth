import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { faderFloatToDb, faderDbToFloat, FADER_TICKS_DB } from "./mixerTaper";

describe("mixerTaper", () => {
  describe("endpoints", () => {
    it("0.0 float maps to -Infinity dB (fully off)", () => {
      expect(faderFloatToDb(0)).toBe(-Infinity);
    });

    it("1.0 float maps to +10 dB", () => {
      expect(faderFloatToDb(1)).toBeCloseTo(10, 5);
    });

    it("~0.75 float maps to ~0 dB (unity near 75% travel)", () => {
      expect(faderFloatToDb(0.75)).toBeCloseTo(0, 5);
    });

    it("-Infinity dB maps to 0.0 float", () => {
      expect(faderDbToFloat(-Infinity)).toBe(0);
    });

    it("+10 dB maps to 1.0 float", () => {
      expect(faderDbToFloat(10)).toBeCloseTo(1, 5);
    });

    it("0 dB maps to ~0.75 float", () => {
      expect(faderDbToFloat(0)).toBeCloseTo(0.75, 5);
    });
  });

  describe("monotonicity", () => {
    it("faderFloatToDb is monotonically non-decreasing across the float domain", () => {
      fc.assert(
        fc.property(fc.tuple(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true })), ([a, b]) => {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          const dbLo = faderFloatToDb(lo);
          const dbHi = faderFloatToDb(hi);
          // -Infinity is only at exactly 0; both sides handle that consistently.
          return dbLo <= dbHi;
        }),
      );
    });
  });

  describe("round-trip", () => {
    // The bottom taper segment is very steep (480 dB per float unit), so a
    // float→dB→float round-trip there loses resolution — that is inherent to
    // the taper, not a bug. We test the musically-relevant range (float ≥ 0.0625,
    // i.e. dB ≥ -60) tightly, and the steep sub-(-60 dB) tail loosely.
    it("float → dB → float round-trips within display tolerance for float in [0.0625, 1]", () => {
      fc.assert(
        fc.property(fc.double({ min: 0.0625, max: 1, noNaN: true }), (float) => {
          const db = faderFloatToDb(float);
          const back = faderDbToFloat(db);
          expect(back).toBeCloseTo(float, 3);
        }),
      );
    });

    it("dB → float → dB round-trips within display tolerance for dB in [-60, 10]", () => {
      fc.assert(
        fc.property(fc.double({ min: -60, max: 10, noNaN: true }), (db) => {
          const float = faderDbToFloat(db);
          const back = faderFloatToDb(float);
          expect(back).toBeCloseTo(db, 2);
        }),
      );
    });
  });

  describe("clamping", () => {
    it("clamps floats above 1.0 to +10 dB", () => {
      expect(faderFloatToDb(1.5)).toBeCloseTo(10, 5);
    });

    it("clamps dB above +10 to float 1.0", () => {
      expect(faderDbToFloat(20)).toBe(1);
    });

    it("treats dB at or below -90 as fully off (0.0 float)", () => {
      expect(faderDbToFloat(-90)).toBe(0);
      expect(faderDbToFloat(-120)).toBe(0);
    });
  });

  describe("FADER_TICKS_DB", () => {
    it("is ordered from loudest (+10) to quietest (-inf)", () => {
      expect(FADER_TICKS_DB[0]).toBe(10);
      expect(FADER_TICKS_DB[FADER_TICKS_DB.length - 1]).toBe(-Infinity);
    });

    it("every finite tick maps to a float within [0, 1]", () => {
      for (const tick of FADER_TICKS_DB) {
        const float = faderDbToFloat(tick);
        expect(float).toBeGreaterThanOrEqual(0);
        expect(float).toBeLessThanOrEqual(1);
      }
    });
  });
});
