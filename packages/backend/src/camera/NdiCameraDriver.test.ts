import { describe, it, expect, vi, beforeEach } from "vitest";
import { NdiCameraDriver } from "./NdiCameraDriver.js";

// Mock the ndiLoader module
vi.mock("./ndiLoader.js", () => ({
  getNdiModule: vi.fn(),
}));

import { getNdiModule } from "./ndiLoader.js";
const mockGetNdi = vi.mocked(getNdiModule);

function createMockReceiver() {
  return {
    ptz_pan_tilt_speed: vi.fn().mockResolvedValue(undefined),
    ptz_pan_tilt: vi.fn().mockResolvedValue(undefined),
    ptz_zoom: vi.fn().mockResolvedValue(undefined),
    ptz_focus_auto: vi.fn().mockResolvedValue(undefined),
    ptz_focus: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockNdi(receiver: ReturnType<typeof createMockReceiver>) {
  return {
    find: vi.fn().mockResolvedValue([{ name: "Camera1" }]),
    receive: vi.fn().mockResolvedValue(receiver),
    COLOR_FORMAT_FASTEST: 0,
  };
}

describe("NdiCameraDriver", () => {
  let driver: NdiCameraDriver;
  let mockReceiver: ReturnType<typeof createMockReceiver>;

  beforeEach(() => {
    mockReceiver = createMockReceiver();
    const mockNdi = createMockNdi(mockReceiver);
    mockGetNdi.mockReturnValue(mockNdi);
    driver = new NdiCameraDriver("Camera1");
  });

  describe("connect/disconnect", () => {
    it("connects successfully when source found", async () => {
      const result = await driver.connect();
      expect(result).toBe(true);
      expect(driver.isConnected()).toBe(true);
    });

    it("returns false when NDI module not available", async () => {
      mockGetNdi.mockReturnValue(null);
      const d = new NdiCameraDriver("Camera1");
      const result = await d.connect();
      expect(result).toBe(false);
    });

    it("returns false when source not found", async () => {
      mockGetNdi.mockReturnValue({ find: vi.fn().mockResolvedValue([{ name: "Other" }]), receive: vi.fn(), COLOR_FORMAT_FASTEST: 0 });
      const d = new NdiCameraDriver("Camera1");
      const result = await d.connect();
      expect(result).toBe(false);
    });

    it("disconnect sets connected to false", async () => {
      await driver.connect();
      driver.disconnect();
      expect(driver.isConnected()).toBe(false);
    });
  });

  describe("PTZ commands", () => {
    beforeEach(async () => {
      await driver.connect();
    });

    it("panTiltSpeed calls receiver", async () => {
      await driver.panTiltSpeed(0.5, -0.3);
      expect(mockReceiver.ptz_pan_tilt_speed).toHaveBeenCalledWith(0.5, -0.3);
    });

    it("panTiltAbsolute updates lastCommanded", async () => {
      await driver.panTiltAbsolute(0.2, 0.8);
      expect(mockReceiver.ptz_pan_tilt).toHaveBeenCalledWith(0.2, 0.8);
      const pos = await driver.inquirePosition();
      expect(pos.pan).toBe(0.2);
      expect(pos.tilt).toBe(0.8);
    });

    it("zoomAbsolute updates lastCommanded", async () => {
      await driver.zoomAbsolute(0.75);
      expect(mockReceiver.ptz_zoom).toHaveBeenCalledWith(0.75);
      const pos = await driver.inquirePosition();
      expect(pos.zoom).toBe(0.75);
    });

    it("focusAuto sets autoFocus in lastCommanded", async () => {
      await driver.focusAuto();
      expect(mockReceiver.ptz_focus_auto).toHaveBeenCalled();
      const pos = await driver.inquirePosition();
      expect(pos.autoFocus).toBe(true);
    });

    it("focusManual updates lastCommanded", async () => {
      await driver.focusManual(0.3);
      expect(mockReceiver.ptz_focus).toHaveBeenCalledWith(0.3);
      const pos = await driver.inquirePosition();
      expect(pos.focus).toBe(0.3);
      expect(pos.autoFocus).toBe(false);
    });

    it("stop calls panTiltSpeed(0,0)", async () => {
      await driver.stop();
      expect(mockReceiver.ptz_pan_tilt_speed).toHaveBeenCalledWith(0, 0);
    });
  });

  describe("inquirePosition", () => {
    it("returns last-commanded values (NDI has no position query)", async () => {
      const pos = await driver.inquirePosition();
      expect(pos).toEqual({ pan: 0, tilt: 0, zoom: 0, focus: 0.5, autoFocus: true });
    });
  });
});
