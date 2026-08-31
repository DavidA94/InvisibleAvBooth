import { describe, it, expect } from "vitest";
import { resolveCaptureTarget, isChannelInRange } from "./captureMetadata.js";

describe("resolveCaptureTarget", () => {
  it("returns identity fallback for a null row", () => {
    expect(resolveCaptureTarget(null, 3)).toEqual({ slot: 3, nodeName: "", deviceChannels: 0 });
  });

  it("returns identity fallback for unparseable JSON", () => {
    expect(resolveCaptureTarget("not json", 5)).toEqual({ slot: 5, nodeName: "", deviceChannels: 0 });
  });

  it("resolves slot from usbSlotMap and node/channels when present", () => {
    const json = JSON.stringify({ usbSlotMap: { "1": 9 }, captureNodeName: "alsa_input.xr18.multichannel-input", deviceChannels: 18 });
    expect(resolveCaptureTarget(json, 1)).toEqual({ slot: 9, nodeName: "alsa_input.xr18.multichannel-input", deviceChannels: 18 });
  });

  it("falls back to identity slot when the channel is absent from the map", () => {
    const json = JSON.stringify({ usbSlotMap: { "1": 9 } });
    expect(resolveCaptureTarget(json, 2)).toEqual({ slot: 2, nodeName: "", deviceChannels: 0 });
  });

  it("ignores a non-string captureNodeName and non-number deviceChannels", () => {
    const json = JSON.stringify({ captureNodeName: 123, deviceChannels: "18" });
    expect(resolveCaptureTarget(json, 4)).toEqual({ slot: 4, nodeName: "", deviceChannels: 0 });
  });
});

describe("isChannelInRange", () => {
  it("returns false for a null row", () => {
    expect(isChannelInRange(null, 1)).toBe(false);
  });

  it("returns false for unparseable JSON", () => {
    expect(isChannelInRange("not json", 1)).toBe(false);
  });

  it("accepts a channel within a numeric channelCount", () => {
    expect(isChannelInRange(JSON.stringify({ channelCount: 18 }), 18)).toBe(true);
    expect(isChannelInRange(JSON.stringify({ channelCount: 18 }), 19)).toBe(false);
  });

  it("coerces a string channelCount (device-form storage)", () => {
    expect(isChannelInRange(JSON.stringify({ channelCount: "18" }), 1)).toBe(true);
    expect(isChannelInRange(JSON.stringify({ channelCount: "18" }), 0)).toBe(false);
  });

  it("returns false when channelCount is missing or non-numeric", () => {
    expect(isChannelInRange(JSON.stringify({}), 1)).toBe(false);
    expect(isChannelInRange(JSON.stringify({ channelCount: "abc" }), 1)).toBe(false);
  });
});
