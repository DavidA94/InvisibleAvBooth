import { describe, it, expect } from "vitest";
import { DEVICE_TYPE_REGISTRY, DEVICE_TYPE_KEYS, getDeviceTypeDisplayName } from "./deviceTypeRegistry";

describe("deviceTypeRegistry", () => {
  it("has obs registered", () => {
    expect(DEVICE_TYPE_REGISTRY["obs"]).toBeDefined();
    expect(DEVICE_TYPE_REGISTRY["obs"]!.displayName).toBe("OBS");
    expect(DEVICE_TYPE_REGISTRY["obs"]!.formComponent).toBeDefined();
  });

  it("DEVICE_TYPE_KEYS matches registry keys", () => {
    expect(DEVICE_TYPE_KEYS).toEqual(Object.keys(DEVICE_TYPE_REGISTRY));
  });

  it("getDeviceTypeDisplayName returns display name for known types", () => {
    expect(getDeviceTypeDisplayName("obs")).toBe("OBS");
  });

  it("getDeviceTypeDisplayName falls back to raw key for unknown types", () => {
    expect(getDeviceTypeDisplayName("unknown-device")).toBe("unknown-device");
  });
});
