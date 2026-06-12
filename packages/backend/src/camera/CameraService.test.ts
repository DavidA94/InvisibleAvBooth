import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { applySchema } from "../database/schema.js";
import { CameraService, applyAdaptiveSpeed, computeFov, KEEPALIVE_TIMEOUT_MS } from "./CameraService.js";
import { eventBus } from "../eventBus/eventBus.js";
import { BUS_CAMERA_STATE_CHANGED } from "../eventBus/types.js";

// Mock dependencies
vi.mock("./ndiLoader.js", () => ({
  isNdiAvailable: () => true,
}));

vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from "../logger.js";

vi.mock("../crypto.js", () => ({
  decrypt: (val: string) => `decrypted-${val}`,
}));

const mockNdiDriver = {
  connect: vi.fn().mockResolvedValue(true),
  disconnect: vi.fn(),
  panTiltSpeed: vi.fn(),
  stop: vi.fn(),
  zoomAbsolute: vi.fn().mockResolvedValue(undefined),
  panTiltAbsolute: vi.fn().mockResolvedValue(undefined),
  focusAuto: vi.fn().mockResolvedValue(undefined),
  focusManual: vi.fn().mockResolvedValue(undefined),
};

const mockViscaDriver = {
  connect: vi.fn().mockResolvedValue(true),
  disconnect: vi.fn(),
  isConnected: vi.fn().mockReturnValue(true),
  inquirePosition: vi.fn().mockResolvedValue({ pan: 0, tilt: 0, zoom: 0.5, focus: 0.5, autoFocus: true }),
  panTiltSpeed: vi.fn().mockResolvedValue(undefined),
  panTiltAbsolute: vi.fn().mockResolvedValue(undefined),
  zoomAbsolute: vi.fn().mockResolvedValue(undefined),
  focusAuto: vi.fn().mockResolvedValue(undefined),
  focusManual: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
};

const mockAiDriver = {
  setAiState: vi.fn().mockResolvedValue(undefined),
};

vi.mock("./NdiCameraDriver.js", () => {
  return {
    NdiCameraDriver: function () {
      return mockNdiDriver;
    },
  };
});

vi.mock("./ViscaCameraDriver.js", () => {
  return {
    ViscaCameraDriver: function () {
      return mockViscaDriver;
    },
  };
});

vi.mock("./TongveoAiDriver.js", () => {
  return {
    TongveoAiDriver: function () {
      return mockAiDriver;
    },
  };
});

function makeDatabase(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  return db;
}

function seedCamera(db: Database.Database, opts?: { viscaEnabled?: boolean; model?: string; aiCookie?: string; aiCredentialId?: string }): void {
  const meta = JSON.stringify({
    ndiSourceName: "CAM1",
    fovWideAngle: 60,
    opticalZoomRatio: 20,
    cameraModel: opts?.model ?? "generic",
    cameraFeatures: ["pan", "tilt", "zoom", "focus"],
    viscaEnabled: opts?.viscaEnabled ?? false,
    ...(opts?.aiCookie ? { aiHttpCookie: opts.aiCookie, aiCredentialId: opts.aiCredentialId } : {}),
  });
  db.prepare(
    "INSERT INTO device_connections (id, deviceType, label, host, port, metadata, features, enabled, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run("cam1", "camera-ptz", "Test Camera", "192.168.1.100", 5500, meta, "{}", 1, new Date().toISOString());
}

function seedPreset(db: Database.Database): void {
  db.prepare(
    "INSERT INTO camera_presets (id, cameraId, name, sortOrder, storedOnCamera, cameraPresetSlot, pan, tilt, zoom, focus, autoFocus, aiTracking, aiTilt, aiZoom, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run("p1", "cam1", "Wide", 0, 0, null, 0.1, 0.2, 0.3, 0.5, 1, 0, 0, 0, new Date().toISOString());
}

describe("applyAdaptiveSpeed", () => {
  it("returns full speed at zoom=0", () => {
    expect(applyAdaptiveSpeed(1.0, 0)).toBeCloseTo(0.6); // capped at MAX_EFFECTIVE_SPEED
  });

  it("reduces speed at higher zoom", () => {
    const atZero = applyAdaptiveSpeed(0.5, 0);
    const atHalf = applyAdaptiveSpeed(0.5, 0.5);
    expect(atHalf).toBeLessThan(atZero);
  });

  it("preserves sign", () => {
    expect(applyAdaptiveSpeed(-0.5, 0)).toBeLessThan(0);
  });

  it("caps at MAX_EFFECTIVE_SPEED", () => {
    expect(Math.abs(applyAdaptiveSpeed(1.0, 0))).toBeLessThanOrEqual(0.6);
  });
});

describe("computeFov", () => {
  it("returns wide angle at zoom=0", () => {
    expect(computeFov(60, 0, 20)).toBe(60);
  });

  it("narrows at full zoom", () => {
    expect(computeFov(60, 1, 20)).toBe(3); // 60 / 20
  });
});

describe("CameraService", () => {
  let db: Database.Database;
  let service: CameraService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    eventBus.removeAllListeners();
    db = makeDatabase();
  });

  afterEach(() => {
    service?.destroy();
    vi.useRealTimers();
  });

  async function initService(opts?: Parameters<typeof seedCamera>[1]): Promise<void> {
    seedCamera(db, opts);
    service = new CameraService(db);
    await service.initialize();
    // Let async connect callbacks fire (they use setTimeout(fn, 0))
    await vi.advanceTimersByTimeAsync(10);
  }

  it("initializes with cameras from database", async () => {
    await initService();
    const states = service.getAllCameraStates();
    expect(states).toHaveLength(1);
    expect(states[0]!.cameraId).toBe("cam1");
  });

  it("sets connected=true after NdiDriver connects", async () => {
    await initService();
    expect(service.getCameraState("cam1")?.connected).toBe(true);
  });

  it("loads presets from database", async () => {
    seedCamera(db);
    seedPreset(db);
    service = new CameraService(db);
    await service.initialize();
    await vi.runAllTimersAsync();
    expect(service.getCameraState("cam1")?.presets).toHaveLength(1);
    expect(service.getCameraState("cam1")?.presets[0]?.name).toBe("Wide");
  });

  it("emits WARNING log with camera label for NDI-only cameras (no VISCA)", async () => {
    await initService({ viscaEnabled: false });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Camera 'Test Camera' uses NDI-only"));
  });

  it("does not emit NDI-only warning when VISCA is configured", async () => {
    await initService({ viscaEnabled: true });
    expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining("uses NDI-only"));
  });

  it("returns null for unknown camera", async () => {
    await initService();
    expect(service.getCameraState("nonexistent")).toBeNull();
  });

  describe("startMove / keepAliveMove / stopMove", () => {
    it("startMove calls viscaDriver.panTiltSpeed with adaptive speed", async () => {
      await initService({ viscaEnabled: true });
      service.startMove("cam1", 0.5, 0.3);
      expect(mockViscaDriver.panTiltSpeed).toHaveBeenCalled();
    });

    it("stopMove calls viscaDriver.stop", async () => {
      await initService({ viscaEnabled: true });
      service.startMove("cam1", 0.5, 0.3);
      service.stopMove("cam1");
      expect(mockViscaDriver.stop).toHaveBeenCalled();
    });

    it("deadManStop fires after keepalive timeout", async () => {
      await initService({ viscaEnabled: true });
      service.startMove("cam1", 0.5, 0.3);
      mockViscaDriver.stop.mockClear();
      vi.advanceTimersByTime(KEEPALIVE_TIMEOUT_MS + 1);
      expect(mockViscaDriver.stop).toHaveBeenCalled();
    });

    it("keepAliveMove resets the timeout", async () => {
      await initService({ viscaEnabled: true });
      service.startMove("cam1", 0.5, 0.3);
      vi.advanceTimersByTime(KEEPALIVE_TIMEOUT_MS - 100);
      service.keepAliveMove("cam1", 0.5, 0.3);
      vi.advanceTimersByTime(KEEPALIVE_TIMEOUT_MS - 100);
      mockViscaDriver.stop.mockClear();
      // Should not have fired yet
      expect(mockViscaDriver.stop).not.toHaveBeenCalled();
    });

    it("keepAliveMove updates speed when changed", async () => {
      await initService({ viscaEnabled: true });
      service.startMove("cam1", 0.5, 0.3);
      mockViscaDriver.panTiltSpeed.mockClear();
      service.keepAliveMove("cam1", 0.8, 0.1);
      expect(mockViscaDriver.panTiltSpeed).toHaveBeenCalled();
    });

    it("keepAliveMove does nothing for unknown session", async () => {
      await initService({ viscaEnabled: true });
      service.keepAliveMove("cam1", 0.5, 0.3);
      expect(mockViscaDriver.panTiltSpeed).not.toHaveBeenCalled();
    });

    it("startMove on unknown camera does nothing", async () => {
      await initService({ viscaEnabled: true });
      service.startMove("unknown", 0.5, 0.3);
      expect(mockViscaDriver.panTiltSpeed).not.toHaveBeenCalled();
    });
  });

  describe("applySet", () => {
    it("sets zoom", async () => {
      await initService({ viscaEnabled: true });
      await service.applySet("cam1", { zoom: 0.7 });
      expect(mockViscaDriver.zoomAbsolute).toHaveBeenCalledWith(0.7);
    });

    it("sets autoFocus=true calls focusAuto", async () => {
      await initService({ viscaEnabled: true });
      await service.applySet("cam1", { autoFocus: true });
      expect(mockViscaDriver.focusAuto).toHaveBeenCalled();
    });

    it("sets focus when autoFocus is off", async () => {
      await initService({ viscaEnabled: true });
      // First disable autoFocus
      await service.applySet("cam1", { autoFocus: false });
      await service.applySet("cam1", { focus: 0.3 });
      expect(mockViscaDriver.focusManual).toHaveBeenCalledWith(0.3);
    });

    it("ignores focus when autoFocus is on", async () => {
      await initService({ viscaEnabled: true });
      await service.applySet("cam1", { focus: 0.3 });
      expect(mockViscaDriver.focusManual).not.toHaveBeenCalled();
    });

    it("sets AI state and calls aiDriver", async () => {
      await initService({ model: "tongveo-nvs20a-4kn", aiCookie: "cookie", aiCredentialId: "cred" });
      await service.applySet("cam1", { aiTracking: true });
      expect(mockAiDriver.setAiState).toHaveBeenCalledWith(true, false, false);
    });

    it("clears activePresetId on manual change", async () => {
      seedCamera(db);
      seedPreset(db);
      service = new CameraService(db);
      await service.initialize();
      await vi.runAllTimersAsync();

      // Activate preset first
      await service.activatePreset("cam1", "p1");
      expect(service.getCameraState("cam1")?.activePresetId).toBe("p1");

      // Any manual set should clear it
      await service.applySet("cam1", { zoom: 0.9 });
      expect(service.getCameraState("cam1")?.activePresetId).toBeNull();
    });

    it("does nothing for unknown camera", async () => {
      await initService({ viscaEnabled: true });
      await service.applySet("unknown", { zoom: 0.5 });
      expect(mockViscaDriver.zoomAbsolute).not.toHaveBeenCalled();
    });

    it("broadcasts state after apply", async () => {
      await initService();
      const spy = vi.fn();
      eventBus.subscribe(BUS_CAMERA_STATE_CHANGED, spy);
      await service.applySet("cam1", { zoom: 0.5 });
      expect(spy).toHaveBeenCalled();
    });
  });

  describe("activatePreset", () => {
    it("applies preset position and toggles", async () => {
      seedCamera(db, { viscaEnabled: true });
      seedPreset(db);
      service = new CameraService(db);
      await service.initialize();
      await vi.advanceTimersByTimeAsync(10);

      const result = await service.activatePreset("cam1", "p1");
      expect(result.success).toBe(true);
      expect(mockViscaDriver.zoomAbsolute).toHaveBeenCalledWith(0.3);
      expect(mockViscaDriver.panTiltAbsolute).toHaveBeenCalledWith(0.1, 0.2);
    });

    it("returns error for unknown camera", async () => {
      await initService();
      const result = await service.activatePreset("unknown", "p1");
      expect(result).toEqual({ success: false, error: "Camera not found" });
    });

    it("returns error for unknown preset", async () => {
      await initService();
      const result = await service.activatePreset("cam1", "nonexistent");
      expect(result).toEqual({ success: false, error: "Preset not found" });
    });

    it("calls focusManual for preset with autoFocus=false", async () => {
      seedCamera(db, { viscaEnabled: true });
      db.prepare(
        "INSERT INTO camera_presets (id, cameraId, name, sortOrder, storedOnCamera, cameraPresetSlot, pan, tilt, zoom, focus, autoFocus, aiTracking, aiTilt, aiZoom, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ).run("p2", "cam1", "Manual", 1, 0, null, 0, 0, 0.5, 0.7, 0, 0, 0, 0, new Date().toISOString());
      service = new CameraService(db);
      await service.initialize();
      await vi.advanceTimersByTimeAsync(10);

      await service.activatePreset("cam1", "p2");
      expect(mockViscaDriver.focusManual).toHaveBeenCalledWith(0.7);
    });

    it("calls aiDriver.setAiState during preset activation", async () => {
      seedCamera(db, { model: "tongveo-nvs20a-4kn", aiCookie: "cookie", aiCredentialId: "cred" });
      db.prepare(
        "INSERT INTO camera_presets (id, cameraId, name, sortOrder, storedOnCamera, cameraPresetSlot, pan, tilt, zoom, focus, autoFocus, aiTracking, aiTilt, aiZoom, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ).run("p3", "cam1", "AI", 2, 0, null, 0, 0, 0, 0.5, 1, 1, 1, 1, new Date().toISOString());
      service = new CameraService(db);
      await service.initialize();
      await vi.advanceTimersByTimeAsync(10);

      mockAiDriver.setAiState.mockClear();
      await service.activatePreset("cam1", "p3");
      expect(mockAiDriver.setAiState).toHaveBeenCalled();
    });
  });

  describe("tapToCenter", () => {
    it("returns error for unknown camera", async () => {
      await initService();
      const result = await service.tapToCenter("unknown", 0.1, 0.1, {} as Parameters<typeof service.tapToCenter>[3]);
      expect(result).toEqual({ success: false, error: "Camera not found" });
    });

    it("returns error when VISCA not configured", async () => {
      await initService({ viscaEnabled: false });
      const result = await service.tapToCenter("cam1", 0.1, 0.1, {
        ndiSourceName: "CAM1",
        fovWideAngle: 60,
        opticalZoomRatio: 20,
        cameraModel: "generic",
        cameraFeatures: [],
        viscaEnabled: false,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("VISCA");
    });

    it("succeeds with VISCA configured", async () => {
      await initService({ viscaEnabled: true });
      const result = await service.tapToCenter("cam1", 0.1, -0.1, {
        ndiSourceName: "CAM1",
        fovWideAngle: 60,
        opticalZoomRatio: 20,
        cameraModel: "generic",
        cameraFeatures: [],
        viscaEnabled: true,
      });
      expect(result.success).toBe(true);
      expect(mockViscaDriver.panTiltAbsolute).toHaveBeenCalled();
    });
  });

  describe("capturePosition", () => {
    it("returns position for existing camera", async () => {
      await initService();
      const pos = service.capturePosition("cam1");
      // Position is null initially (no VISCA poll yet) or from NdiDriver connect
      expect(pos).toBeDefined();
    });

    it("returns null for unknown camera", async () => {
      await initService();
      expect(service.capturePosition("unknown")).toBeNull();
    });
  });

  describe("VISCA polling", () => {
    it("starts polling when VISCA connects", async () => {
      await initService({ viscaEnabled: true });
      // pollPosition should be called periodically
      mockViscaDriver.inquirePosition.mockClear();
      vi.advanceTimersByTime(2000);
      expect(mockViscaDriver.inquirePosition).toHaveBeenCalled();
    });
  });

  describe("destroy", () => {
    it("disconnects all drivers and clears state", async () => {
      await initService({ viscaEnabled: true });
      service.destroy();
      expect(mockNdiDriver.disconnect).toHaveBeenCalled();
      expect(mockViscaDriver.disconnect).toHaveBeenCalled();
      expect(service.getAllCameraStates()).toHaveLength(0);
    });
  });
});
