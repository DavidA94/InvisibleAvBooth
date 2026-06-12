import { describe, it, expect, vi, beforeEach } from "vitest";
import { NdiCameraDriver } from "./NdiCameraDriver.js";

// Mock the ndiLoader module
vi.mock("./ndiLoader.js", () => ({
  getNdiModule: vi.fn(),
}));

vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getNdiModule } from "./ndiLoader.js";
const mockGetNdi = vi.mocked(getNdiModule);

function createMockReceiver() {
  return { destroy: vi.fn() };
}

function createMockNdi(sources: Array<{ name: string }>, receiver = createMockReceiver()) {
  const finder = { sources: vi.fn().mockReturnValue(sources), destroy: vi.fn() };
  return {
    default: {
      find: vi.fn().mockResolvedValue(finder),
      receive: vi.fn().mockResolvedValue(receiver),
      COLOR_FORMAT_FASTEST: 100,
    },
  };
}

describe("NdiCameraDriver", () => {
  let driver: NdiCameraDriver;

  beforeEach(() => {
    driver = new NdiCameraDriver("Camera1");
  });

  describe("connect/disconnect", () => {
    it("connects successfully when source found", async () => {
      mockGetNdi.mockReturnValue(createMockNdi([{ name: "Camera1" }]));
      const result = await driver.connect();
      expect(result).toBe(true);
      expect(driver.isConnected()).toBe(true);
    });

    it("returns false when NDI module not available", async () => {
      mockGetNdi.mockReturnValue(null);
      const result = await driver.connect();
      expect(result).toBe(false);
    });

    it("returns false when source not found", async () => {
      mockGetNdi.mockReturnValue(createMockNdi([{ name: "Other" }]));
      const result = await driver.connect();
      expect(result).toBe(false);
    });

    it("disconnect sets connected to false", async () => {
      mockGetNdi.mockReturnValue(createMockNdi([{ name: "Camera1" }]));
      await driver.connect();
      driver.disconnect();
      expect(driver.isConnected()).toBe(false);
    });
  });

  describe("PTZ commands (no-ops, update lastCommanded)", () => {
    it("panTiltAbsolute updates lastCommanded", async () => {
      await driver.panTiltAbsolute(0.2, 0.8);
      const pos = await driver.inquirePosition();
      expect(pos.pan).toBe(0.2);
      expect(pos.tilt).toBe(0.8);
    });

    it("zoomAbsolute updates lastCommanded", async () => {
      await driver.zoomAbsolute(0.75);
      const pos = await driver.inquirePosition();
      expect(pos.zoom).toBe(0.75);
    });

    it("focusAuto sets autoFocus in lastCommanded", async () => {
      await driver.focusAuto();
      const pos = await driver.inquirePosition();
      expect(pos.autoFocus).toBe(true);
    });

    it("focusManual updates lastCommanded", async () => {
      await driver.focusManual(0.3);
      const pos = await driver.inquirePosition();
      expect(pos.focus).toBe(0.3);
      expect(pos.autoFocus).toBe(false);
    });

    it("panTiltSpeed is a no-op", async () => {
      await driver.panTiltSpeed(0.5, -0.3);
      // No error thrown, no state change
    });

    it("stop is a no-op", async () => {
      await driver.stop();
      // No error thrown
    });
  });

  describe("inquirePosition", () => {
    it("returns last-commanded values", async () => {
      const pos = await driver.inquirePosition();
      expect(pos).toEqual({ pan: 0, tilt: 0, zoom: 0, focus: 0.5, autoFocus: true });
    });
  });
});
