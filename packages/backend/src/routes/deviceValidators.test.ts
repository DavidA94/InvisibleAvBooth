import { describe, it, expect } from "vitest";
import { validateSoundboard, DEVICE_VALIDATORS } from "./deviceValidators.js";

describe("validateSoundboard", () => {
  const valid = {
    deviceType: "soundboard",
    label: "Mixer",
    host: "127.0.0.1",
    port: 10024,
    metadata: { model: "behringer-xair", channelCount: 8 },
    features: { "gain-control": true, "channel-metering": true },
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

  it("rejects the removed channel-audio-capture feature as unknown", () => {
    // The capture layer was removed (spec Appendix A); the feature is no longer valid.
    expect(validateSoundboard({ ...valid, features: { "channel-audio-capture": true } })).toContain("channel-audio-capture");
  });

  it("rejects a non-boolean feature value", () => {
    expect(validateSoundboard({ ...valid, features: { "gain-control": "yes" as unknown as boolean } })).toContain("boolean");
  });

  it("is registered in DEVICE_VALIDATORS under soundboard", () => {
    expect(DEVICE_VALIDATORS["soundboard"]).toBe(validateSoundboard);
  });
});
