import { describe, it, expect } from "vitest";
import { buildInitialState, isFormDirty } from "./cameraDeviceFormLogic";
import type { CameraFormState } from "./cameraDeviceFormLogic";

describe("buildInitialState", () => {
  it("returns defaults for null device (create mode)", () => {
    const state = buildInitialState(null);
    expect(state.label).toBe("");
    expect(state.viscaEnabled).toBe(true);
    expect(state.cameraModel).toBe("generic");
    expect(state.port).toBe("5500");
    expect(state.features).toEqual(["pan", "tilt", "zoom", "focus"]);
    expect(state.panTotalDegrees).toBe("350");
    expect(state.tiltTotalDegrees).toBe("180");
  });

  it("populates from device metadata (edit mode)", () => {
    const device = {
      id: "cam1",
      deviceType: "camera-ptz",
      label: "My Camera",
      host: "10.0.0.5",
      port: 5678,
      enabled: true,
      metadata: {
        cameraModel: "tongveo-nvs20a-4kn",
        ndiSourceName: "CAM1",
        ndiExtraIPs: "10.0.0.6",
        viscaEnabled: true,
        fovWideAngle: 75,
        verticalFovWideAngle: 45,
        fovTeleAngle: 5,
        verticalFovTeleAngle: 3,
        opticalZoomRatio: 30,
        cameraFeatures: ["pan", "tilt"],
        panMin: 100,
        panMax: 60000,
        tiltMin: 200,
        tiltMax: 40000,
        zoomMin: 0,
        zoomMax: 16384,
        focusMin: 50,
        focusMax: 12000,
        panTotalDegrees: 340,
        tiltTotalDegrees: 170,
      } as unknown as Record<string, string>,
      features: {},
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    const state = buildInitialState(device);
    expect(state.label).toBe("My Camera");
    expect(state.host).toBe("10.0.0.5");
    expect(state.port).toBe("5678");
    expect(state.cameraModel).toBe("tongveo-nvs20a-4kn");
    expect(state.ndiSourceName).toBe("CAM1");
    expect(state.ndiExtraIPs).toBe("10.0.0.6");
    expect(state.viscaEnabled).toBe(true);
    expect(state.fovWideAngle).toBe("75");
    expect(state.verticalFovWideAngle).toBe("45");
    expect(state.fovTeleAngle).toBe("5");
    expect(state.verticalFovTeleAngle).toBe("3");
    expect(state.opticalZoomRatio).toBe("30");
    expect(state.features).toEqual(["pan", "tilt"]);
    expect(state.panMin).toBe("100");
    expect(state.panMax).toBe("60000");
    expect(state.tiltMin).toBe("200");
    expect(state.tiltMax).toBe("40000");
    expect(state.zoomMin).toBe("0");
    expect(state.zoomMax).toBe("16384");
    expect(state.focusMin).toBe("50");
    expect(state.focusMax).toBe("12000");
    expect(state.panTotalDegrees).toBe("340");
    expect(state.tiltTotalDegrees).toBe("170");
    expect(state.enabled).toBe(true);
  });

  it("uses defaults for missing metadata fields", () => {
    const device = {
      id: "cam1",
      deviceType: "camera-ptz",
      label: "Minimal",
      host: "10.0.0.1",
      port: 5500,
      enabled: false,
      metadata: {} as Record<string, string>,
      features: {},
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    const state = buildInitialState(device);
    expect(state.cameraModel).toBe("generic");
    expect(state.ndiSourceName).toBe("");
    expect(state.viscaEnabled).toBe(false);
    expect(state.fovWideAngle).toBe("60");
    expect(state.opticalZoomRatio).toBe("20");
    expect(state.features).toEqual(["pan", "tilt", "zoom", "focus"]);
    expect(state.panMin).toBe("");
    expect(state.panMax).toBe("");
    expect(state.panTotalDegrees).toBe("350");
    expect(state.enabled).toBe(false);
  });
});

describe("isFormDirty", () => {
  const base: CameraFormState = buildInitialState(null);

  it("returns false when nothing changed", () => {
    expect(isFormDirty(base, base, false)).toBe(false);
    expect(isFormDirty(base, base, true)).toBe(false);
  });

  it("detects label change", () => {
    expect(isFormDirty({ ...base, label: "New" }, base, false)).toBe(true);
  });

  it("detects cameraModel change", () => {
    expect(isFormDirty({ ...base, cameraModel: "tongveo-nvs20a-4kn" }, base, false)).toBe(true);
  });

  it("detects ndiSourceName change", () => {
    expect(isFormDirty({ ...base, ndiSourceName: "CAM" }, base, false)).toBe(true);
  });

  it("detects ndiExtraIPs change", () => {
    expect(isFormDirty({ ...base, ndiExtraIPs: "10.0.0.1" }, base, false)).toBe(true);
  });

  it("detects viscaEnabled change", () => {
    expect(isFormDirty({ ...base, viscaEnabled: false }, base, false)).toBe(true);
  });

  it("detects host change", () => {
    expect(isFormDirty({ ...base, host: "10.0.0.5" }, base, false)).toBe(true);
  });

  it("detects port change", () => {
    expect(isFormDirty({ ...base, port: "9999" }, base, false)).toBe(true);
  });

  it("detects fovWideAngle change", () => {
    expect(isFormDirty({ ...base, fovWideAngle: "90" }, base, false)).toBe(true);
  });

  it("detects verticalFovWideAngle change", () => {
    expect(isFormDirty({ ...base, verticalFovWideAngle: "45" }, base, false)).toBe(true);
  });

  it("detects fovTeleAngle change", () => {
    expect(isFormDirty({ ...base, fovTeleAngle: "5" }, base, false)).toBe(true);
  });

  it("detects verticalFovTeleAngle change", () => {
    expect(isFormDirty({ ...base, verticalFovTeleAngle: "3" }, base, false)).toBe(true);
  });

  it("detects opticalZoomRatio change", () => {
    expect(isFormDirty({ ...base, opticalZoomRatio: "30" }, base, false)).toBe(true);
  });

  it("detects panTotalDegrees change", () => {
    expect(isFormDirty({ ...base, panTotalDegrees: "300" }, base, false)).toBe(true);
  });

  it("detects tiltTotalDegrees change", () => {
    expect(isFormDirty({ ...base, tiltTotalDegrees: "160" }, base, false)).toBe(true);
  });

  it("detects enabled change", () => {
    expect(isFormDirty({ ...base, enabled: false }, base, false)).toBe(true);
  });

  it("detects features change", () => {
    expect(isFormDirty({ ...base, features: ["pan"] }, base, false)).toBe(true);
  });

  it("detects aiHttpCookie in edit mode", () => {
    expect(isFormDirty({ ...base, aiHttpCookie: "new-cookie" }, base, true)).toBe(true);
  });

  it("detects aiCredentialId in edit mode", () => {
    expect(isFormDirty({ ...base, aiCredentialId: "new-cred" }, base, true)).toBe(true);
  });

  it("ignores empty AI fields in edit mode", () => {
    expect(isFormDirty({ ...base, aiHttpCookie: "", aiCredentialId: "" }, base, true)).toBe(false);
  });

  it("detects aiHttpCookie change in create mode", () => {
    const initial = { ...base, aiHttpCookie: "old" };
    expect(isFormDirty({ ...initial, aiHttpCookie: "new" }, initial, false)).toBe(true);
  });

  it("ignores unchanged AI fields in create mode", () => {
    const initial = { ...base, aiHttpCookie: "same" };
    expect(isFormDirty(initial, initial, false)).toBe(false);
  });
});
