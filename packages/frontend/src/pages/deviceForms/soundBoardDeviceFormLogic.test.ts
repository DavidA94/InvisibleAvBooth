import { describe, it, expect } from "vitest";
import { buildInitialState, serializeMetadata, serializeFeatures, validate, isFormDirty, identityUsbSlotMap } from "./soundBoardDeviceFormLogic";
import type { DeviceRecord } from "./deviceTypeRegistry";

describe("soundBoardDeviceFormLogic", () => {
  describe("buildInitialState", () => {
    it("provides defaults for a new device (port 10024, 8 channels, identity slot map)", () => {
      const state = buildInitialState(null);
      expect(state.port).toBe("10024");
      expect(state.channelCount).toBe("8");
      expect(state.usbSlotMap["1"]).toBe("1");
      expect(state.model).toBe("behringer-xair");
    });

    it("parses an existing device's numeric metadata + features", () => {
      const device: DeviceRecord = {
        id: "m1",
        deviceType: "soundboard",
        label: "Main",
        host: "127.0.0.1",
        port: 10024,
        metadata: { model: "behringer-xair", channelCount: "16", usbSlotMap: JSON.stringify({ "1": 3, "2": 4 }) },
        features: { "gain-control": true, "channel-metering": false, "channel-audio-capture": true },
        enabled: true,
        createdAt: "",
      };
      const state = buildInitialState(device);
      expect(state.channelCount).toBe("16");
      expect(state.features["gain-control"]).toBe(true);
      expect(state.features["channel-metering"]).toBe(false);
      expect(state.usbSlotMap["1"]).toBe("3"); // numeric slot parsed to string
    });
  });

  describe("serializeMetadata (numeric round-trip to strings)", () => {
    it("serializes channelCount as a string and includes usbSlotMap when capture enabled", () => {
      const state = buildInitialState(null);
      state.features["channel-audio-capture"] = true;
      state.channelCount = "4";
      state.usbSlotMap = { "1": "2", "2": "5" };
      const metadata = serializeMetadata(state);
      expect(metadata["channelCount"]).toBe("4");
      expect(JSON.parse(metadata["usbSlotMap"]!)).toEqual({ "1": 2, "2": 5 }); // numeric slots
    });

    it("omits usbSlotMap when capture is disabled", () => {
      const state = buildInitialState(null);
      state.features["channel-audio-capture"] = false;
      expect(serializeMetadata(state)["usbSlotMap"]).toBeUndefined();
    });

    it("round-trips numeric metadata through build → serialize → build", () => {
      const state = buildInitialState(null);
      state.channelCount = "12";
      state.features["channel-audio-capture"] = true;
      state.usbSlotMap = identityUsbSlotMap(12);
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
      expect(reopened.usbSlotMap["12"]).toBe("12");
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

    it("rejects a non-positive USB slot when capture enabled", () => {
      const state = buildInitialState(null);
      state.label = "x";
      state.host = "h";
      state.features["channel-audio-capture"] = true;
      state.usbSlotMap = { "1": "0" };
      expect(validate(state)).toContain("USB slot");
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
      expect(isFormDirty({ ...initial, features: { ...initial.features, "channel-audio-capture": true } }, initial)).toBe(true);
    });

    it("detects a usbSlotMap edit", () => {
      const initial = buildInitialState(null);
      expect(isFormDirty({ ...initial, usbSlotMap: { ...initial.usbSlotMap, "1": "9" } }, initial)).toBe(true);
    });
  });
});
