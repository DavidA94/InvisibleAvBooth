import { describe, it, expect } from "vitest";
import { buildInitialState, serializeMetadata, serializeFeatures, validate, isFormDirty } from "./soundBoardDeviceFormLogic";
import type { DeviceRecord } from "./deviceTypeRegistry";

describe("soundBoardDeviceFormLogic", () => {
  describe("buildInitialState", () => {
    it("provides defaults for a new device (port 10024, 8 channels)", () => {
      const state = buildInitialState(null);
      expect(state.port).toBe("10024");
      expect(state.channelCount).toBe("8");
      expect(state.model).toBe("behringer-xair");
      expect(state.features["gain-control"]).toBe(true);
    });

    it("parses an existing device's numeric metadata + features", () => {
      const device: DeviceRecord = {
        id: "m1",
        deviceType: "soundboard",
        label: "Main",
        host: "127.0.0.1",
        port: 10024,
        metadata: { model: "behringer-xair", channelCount: "16" },
        features: { "gain-control": true, "channel-metering": false },
        enabled: true,
        createdAt: "",
      };
      const state = buildInitialState(device);
      expect(state.channelCount).toBe("16");
      expect(state.features["gain-control"]).toBe(true);
      expect(state.features["channel-metering"]).toBe(false);
    });
  });

  describe("serializeMetadata (numeric round-trip to strings)", () => {
    it("serializes channelCount as a string (no usbSlotMap)", () => {
      const state = buildInitialState(null);
      state.channelCount = "4";
      const metadata = serializeMetadata(state);
      expect(metadata["channelCount"]).toBe("4");
      expect(metadata["usbSlotMap"]).toBeUndefined();
    });

    it("round-trips numeric metadata through build → serialize → build", () => {
      const state = buildInitialState(null);
      state.channelCount = "12";
      const metadata = serializeMetadata(state);
      const device: DeviceRecord = {
        id: "m1",
        deviceType: "soundboard",
        label: "L",
        host: "h",
        port: 10024,
        metadata,
        features: serializeFeatures(state),
        enabled: true,
        createdAt: "",
      };
      const reopened = buildInitialState(device);
      expect(reopened.channelCount).toBe("12");
    });
  });

  describe("validate", () => {
    it("accepts a valid form", () => {
      const state = buildInitialState(null);
      state.label = "Mixer";
      state.host = "127.0.0.1";
      expect(validate(state)).toBeNull();
    });

    it("rejects a missing label / host", () => {
      const state = buildInitialState(null);
      expect(validate(state)).toContain("Label");
      state.label = "x";
      expect(validate(state)).toContain("Host");
    });

    it("rejects a non-positive channel count", () => {
      const state = buildInitialState(null);
      state.label = "x";
      state.host = "h";
      state.channelCount = "0";
      expect(validate(state)).toContain("Channel count");
    });
  });

  describe("isFormDirty", () => {
    it("is clean for an unchanged form", () => {
      const initial = buildInitialState(null);
      expect(isFormDirty({ ...initial }, initial)).toBe(false);
    });

    it("detects a changed label", () => {
      const initial = buildInitialState(null);
      expect(isFormDirty({ ...initial, label: "New" }, initial)).toBe(true);
    });

    it("detects a feature toggle change", () => {
      const initial = buildInitialState(null);
      expect(isFormDirty({ ...initial, features: { ...initial.features, "channel-metering": !initial.features["channel-metering"] } }, initial)).toBe(true);
    });
  });
});
