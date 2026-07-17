import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./index";
import type { CameraState } from "@invisible-av-booth/shared";

const CAMERA_STATE: CameraState = {
  cameraId: "cam1",
  label: "Camera 1",
  connected: true,
  viscaConnected: true,
  position: null,
  autoFocus: true,
  aiTracking: false,
  aiTilt: false,
  aiZoom: false,
  activePresetId: "p1",
  features: ["pan", "tilt", "zoom"],
  capabilities: { tapToCenter: false },
  presets: [],
};

describe("cameraSlice", () => {
  beforeEach(() => {
    useStore.setState({ cameraStates: {} });
  });

  it("setCameraState adds a camera", () => {
    useStore.getState().setCameraState(CAMERA_STATE);
    expect(useStore.getState().cameraStates["cam1"]).toEqual(CAMERA_STATE);
  });

  it("setCameraState updates existing camera", () => {
    useStore.getState().setCameraState(CAMERA_STATE);
    useStore.getState().setCameraState({ ...CAMERA_STATE, connected: false });
    expect(useStore.getState().cameraStates["cam1"]?.connected).toBe(false);
  });

  it("setAllCameraStates replaces all cameras", () => {
    useStore.getState().setCameraState(CAMERA_STATE);
    const cam2: CameraState = { ...CAMERA_STATE, cameraId: "cam2" };
    useStore.getState().setAllCameraStates([cam2]);
    expect(useStore.getState().cameraStates["cam1"]).toBeUndefined();
    expect(useStore.getState().cameraStates["cam2"]).toEqual(cam2);
  });

  it("clearActivePreset nulls the activePresetId", () => {
    useStore.getState().setCameraState(CAMERA_STATE);
    expect(useStore.getState().cameraStates["cam1"]?.activePresetId).toBe("p1");
    useStore.getState().clearActivePreset("cam1");
    expect(useStore.getState().cameraStates["cam1"]?.activePresetId).toBeNull();
  });

  it("clearActivePreset does nothing for unknown camera", () => {
    useStore.getState().setCameraState(CAMERA_STATE);
    useStore.getState().clearActivePreset("unknown");
    expect(useStore.getState().cameraStates["cam1"]?.activePresetId).toBe("p1");
  });
});
