import { describe, it, expect } from "vitest";
import { validateSoundboard, DEVICE_VALIDATORS } from "./deviceValidators.js";

describe("validateSoundboard", () => {
  const valid = {
    deviceType: "soundboard",
    label: "Mixer",
    host: "127.0.0.1",
    port: 10024,
    metadata: { model: "behringer-xair", channelCount: 8 },
    features: { "gain-control": true, "channel-metering": true, "channel-audio-capture": false },
  };

  it("accepts a valid mixer config", () => {
    expect(validateSoundboard(valid)).toBeNull();
  });

  it("accepts channelCount as a numeric string (JSON metadata round-trip)", () => {
    expect(validateSoundboard({ ...valid, metadata: { model: "behringer-xair", channelCount: "16" } })).toBeNull();
  });

  it("rejects a wrong model", () => {
    expect(validateSoundboard({ ...valid, metadata: { model: "x32", channelCount: 8 } })).toContain("behringer-xair");
  });

  it("rejects missing model", () => {
    expect(validateSoundboard({ ...valid, metadata: { channelCount: 8 } })).toContain("behringer-xair");
  });

  it.each([[0], [-1], [2.5], ["abc"]])("rejects invalid channelCount %p", (channelCount) => {
    expect(validateSoundboard({ ...valid, metadata: { model: "behringer-xair", channelCount } })).toContain("channelCount");
  });

  it("rejects an unknown feature", () => {
    expect(validateSoundboard({ ...valid, features: { "bogus-feature": true } })).toContain("bogus-feature");
  });

  it("rejects a non-boolean feature value", () => {
    expect(validateSoundboard({ ...valid, features: { "gain-control": "yes" as unknown as boolean } })).toContain("boolean");
  });

  it("requires usbSlotMap slots to be positive integers when capture enabled", () => {
    expect(
      validateSoundboard({
        ...valid,
        features: { "channel-audio-capture": true },
        metadata: { model: "behringer-xair", channelCount: 8, usbSlotMap: { "1": 0 } },
      }),
    ).toContain("usbSlotMap");
  });

  it("requires usbSlotMap keys to be channel numbers", () => {
    expect(
      validateSoundboard({
        ...valid,
        features: { "channel-audio-capture": true },
        metadata: { model: "behringer-xair", channelCount: 8, usbSlotMap: { abc: 2 } },
      }),
    ).toContain("channel numbers");
  });

  it("accepts a valid usbSlotMap and numeric-string slots", () => {
    expect(
      validateSoundboard({
        ...valid,
        features: { "channel-audio-capture": true },
        metadata: { model: "behringer-xair", channelCount: 8, usbSlotMap: { "1": 1, "2": "3" } },
      }),
    ).toBeNull();
  });

  it("ignores usbSlotMap when capture is disabled", () => {
    expect(
      validateSoundboard({
        ...valid,
        features: { "channel-audio-capture": false },
        metadata: { model: "behringer-xair", channelCount: 8, usbSlotMap: { "1": 0 } },
      }),
    ).toBeNull();
  });

  it("rejects a usbSlotMap that is not an object", () => {
    expect(
      validateSoundboard({
        ...valid,
        features: { "channel-audio-capture": true },
        metadata: { model: "behringer-xair", channelCount: 8, usbSlotMap: "nope" },
      }),
    ).toContain("usbSlotMap");
  });

  it("is registered in DEVICE_VALIDATORS under soundboard", () => {
    expect(DEVICE_VALIDATORS["soundboard"]).toBe(validateSoundboard);
  });
});
