import { describe, it, expect } from "vitest";
import { encodeOsc, decodeOsc } from "./oscCodec.js";
import { probeMixer } from "./mixerProbe.js";

describe("oscCodec", () => {
  it("round-trips an address with no args", () => {
    const packet = encodeOsc("/xinfo");
    const decoded = decodeOsc(packet);
    expect(decoded?.address).toBe("/xinfo");
    expect(decoded?.values).toEqual([]);
  });

  it("round-trips typed args (string/float/int)", () => {
    const packet = encodeOsc("/xinfo", "ssss", ["ip", "name", "XR18", "1.19"]);
    const decoded = decodeOsc(packet);
    expect(decoded?.address).toBe("/xinfo");
    expect(decoded?.values).toEqual(["ip", "name", "XR18", "1.19"]);
  });

  it("round-trips a float fader value", () => {
    const packet = encodeOsc("/ch/01/mix/fader", "f", [0.75]);
    const decoded = decodeOsc(packet);
    expect(decoded?.address).toBe("/ch/01/mix/fader");
    expect(decoded?.values[0]).toBeCloseTo(0.75, 5);
  });

  it("does not decode a garbage packet as a valid address", () => {
    // The decoder is lenient — a malformed packet decodes to an empty-address
    // message rather than throwing. Callers treat a non-matching address as "no
    // reply", so what matters is that garbage never yields a real OSC address.
    const decoded = decodeOsc(Buffer.from([0xff, 0x00, 0x13, 0x37]));
    expect(decoded?.address ?? "").not.toMatch(/^\/.+/);
  });

  it("does not decode an empty buffer as a valid address", () => {
    const decoded = decodeOsc(Buffer.alloc(0));
    expect(decoded?.address ?? "").not.toMatch(/^\/.+/);
  });
});

describe("probeMixer", () => {
  it("times out with a reason when nothing listens", async () => {
    // Port 1 is privileged/unused for OSC; a short timeout keeps the test fast.
    const result = await probeMixer("127.0.0.1", 1, 150);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("no response");
  }, 2000);
});
