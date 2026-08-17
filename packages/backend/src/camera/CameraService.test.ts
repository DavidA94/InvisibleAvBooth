import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { applySchema } from "../database/schema.js";
import { CameraService, applyAdaptiveSpeed, computeFov, KEEPALIVE_TIMEOUT_MS } from "./CameraService.js";
import { eventBus } from "../eventBus/eventBus.js";
import { BUS_CAMERA_STATE_CHANGED } from "../eventBus/types.js";

// Mock dependencies
vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { logger } from "../logger.js";

vi.mock("../crypto.js", () => ({
  decrypt: (val: string) => `decrypted-${val}`,
}));

const mockViscaDriver = {
  connect: vi.fn().mockResolvedValue(true),
  disconnect: vi.fn(),
  isConnected: vi.fn().mockReturnValue(true),
  inquirePosition: vi.fn().mockResolvedValue({ pan: 0, tilt: 0, zoom: 0.5, focus: 0.5, autoFocus: true }),
  panTiltSpeed: vi.fn().mockResolvedValue(undefined),
  panTiltAbsolute: vi.fn().mockResolvedValue(undefined),
  zoomAbsolute: vi.fn().mockResolvedValue(undefined),
  zoomSpeed: vi.fn().mockResolvedValue(undefined),
  focusAuto: vi.fn().mockResolvedValue(undefined),
  focusManual: vi.fn().mockResolvedValue(undefined),
  focusSpeed: vi.fn().mockResolvedValue(undefined),
  presetRecall: vi.fn().mockResolvedValue(undefined),
  presetStore: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  onDisconnect: null as (() => void) | null,
};

const mockAiDriver = {
  setAiState: vi.fn().mockResolvedValue(undefined),
};

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

  it("sets connected=false when no previewManager (preview loop not started)", async () => {
    await initService();
    expect(service.getCameraState("cam1")?.connected).toBe(false);
  });

  it("sets connected=true when previewManager is provided", async () => {
    seedCamera(db);
    const mockPreviewManager = { setSourceAvailable: vi.fn() };
    service = new CameraService(db, mockPreviewManager as unknown as ConstructorParameters<typeof CameraService>[1]);
    await service.initialize();
    await vi.advanceTimersByTimeAsync(10);
    expect(service.getCameraState("cam1")?.connected).toBe(true);
    expect(mockPreviewManager.setSourceAvailable).toHaveBeenCalledWith("camera-cam1", true, "CAM1");
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

    it("uses metadata defaults for pan/tilt/zoom ranges", async () => {
      await initService({ viscaEnabled: true });
      // Provide explicit ranges to test the meta.panMin/panMax/etc paths
      const result = await service.tapToCenter("cam1", 0.2, -0.2, {
        ndiSourceName: "CAM1",
        fovWideAngle: 60,
        opticalZoomRatio: 20,
        cameraModel: "generic",
        cameraFeatures: [],
        viscaEnabled: true,
        panMin: 1000,
        panMax: 60000,
        tiltMin: 500,
        tiltMax: 40000,
        panTotalDegrees: 340,
        tiltTotalDegrees: 170,
        zoomMin: 0,
        zoomMax: 16384,
      });
      expect(result.success).toBe(true);
    });

    it("uses verticalFovWideAngle when provided", async () => {
      await initService({ viscaEnabled: true });
      const result = await service.tapToCenter("cam1", 0, -0.5, {
        ndiSourceName: "CAM1",
        fovWideAngle: 60,
        opticalZoomRatio: 20,
        cameraModel: "generic",
        cameraFeatures: [],
        viscaEnabled: true,
        verticalFovWideAngle: 35,
      });
      expect(result.success).toBe(true);
    });

    it("suppresses tilt when aiTilt is active", async () => {
      await initService({ viscaEnabled: true });
      // Enable AI tilt on the camera state
      await service.applySet("cam1", { aiTilt: true });
      mockViscaDriver.panTiltAbsolute.mockClear();

      const result = await service.tapToCenter("cam1", 0.3, -0.4, {
        ndiSourceName: "CAM1",
        fovWideAngle: 60,
        opticalZoomRatio: 20,
        cameraModel: "generic",
        cameraFeatures: [],
        viscaEnabled: true,
      });
      expect(result.success).toBe(true);
      // Tilt delta should be 0 when aiTilt is active
      const [, tiltArg] = mockViscaDriver.panTiltAbsolute.mock.calls[0]!;
      // currentTilt is 0 and tiltDelta is 0, so tilt should be 0
      expect(tiltArg).toBe(0);
    });

    it("handles inquirePosition failure gracefully (uses last known position)", async () => {
      await initService({ viscaEnabled: true });
      mockViscaDriver.inquirePosition.mockRejectedValueOnce(new Error("timeout"));

      const result = await service.tapToCenter("cam1", 0.1, 0.1, {
        ndiSourceName: "CAM1",
        fovWideAngle: 60,
        opticalZoomRatio: 20,
        cameraModel: "generic",
        cameraFeatures: [],
        viscaEnabled: true,
      });
      expect(result.success).toBe(true);
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
      expect(await service.capturePosition("unknown")).toBeNull();
    });
  });

  describe("VISCA polling", () => {
    it("starts polling when VISCA connects", async () => {
      await initService({ viscaEnabled: true });
      // pollPosition should be called periodically (VISCA_POLL_INTERVAL_MS = 700)
      mockViscaDriver.inquirePosition.mockClear();
      vi.advanceTimersByTime(750);
      expect(mockViscaDriver.inquirePosition).toHaveBeenCalled();
    });

    it("updates state from poll results", async () => {
      await initService({ viscaEnabled: true });
      mockViscaDriver.inquirePosition.mockResolvedValue({ pan: 100, tilt: 200, zoom: 300, focus: 400, autoFocus: false });
      vi.advanceTimersByTime(750);
      await vi.advanceTimersByTimeAsync(10);
      const state = service.getCameraState("cam1");
      expect(state?.position?.pan).toBe(100);
    });

    it("handles poll errors gracefully", async () => {
      await initService({ viscaEnabled: true });
      mockViscaDriver.inquirePosition.mockRejectedValue(new Error("timeout"));
      vi.advanceTimersByTime(750);
      // Should not throw, camera stays connected
      expect(service.getCameraState("cam1")).toBeDefined();
    });
  });

  describe("storePresetOnCamera", () => {
    it("stores preset via VISCA driver", async () => {
      await initService({ viscaEnabled: true });
      mockViscaDriver.presetStore = vi.fn().mockResolvedValue(undefined);
      const result = await service.storePresetOnCamera("cam1", 5);
      expect(result.success).toBe(true);
      expect(mockViscaDriver.presetStore).toHaveBeenCalledWith(5);
    });

    it("returns error for unknown camera", async () => {
      await initService();
      const result = await service.storePresetOnCamera("unknown", 1);
      expect(result).toEqual({ success: false, error: "Camera not found" });
    });

    it("returns error when VISCA not connected", async () => {
      await initService({ viscaEnabled: false });
      const result = await service.storePresetOnCamera("cam1", 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain("VISCA");
    });
  });

  describe("reloadCamera (via bus events)", () => {
    it("adds a new camera on 'created' event", async () => {
      await initService({ viscaEnabled: true });
      // Insert a second camera
      const meta = JSON.stringify({
        ndiSourceName: "CAM2",
        fovWideAngle: 60,
        opticalZoomRatio: 20,
        cameraModel: "generic",
        cameraFeatures: [],
        viscaEnabled: true,
      });
      db.prepare("INSERT INTO device_connections (id, deviceType, label, host, port, metadata, features, enabled, createdAt) VALUES (?,?,?,?,?,?,?,?,?)").run(
        "cam2",
        "camera-ptz",
        "Second Camera",
        "192.168.1.101",
        5500,
        meta,
        "{}",
        1,
        new Date().toISOString(),
      );
      eventBus.emit("bus:camera:device:changed", { deviceId: "cam2", action: "created" });
      await vi.advanceTimersByTimeAsync(100);
      expect(service.getCameraState("cam2")).not.toBeNull();
    });

    it("removes camera on 'deleted' event", async () => {
      await initService({ viscaEnabled: true });
      eventBus.emit("bus:camera:device:changed", { deviceId: "cam1", action: "deleted" });
      await vi.advanceTimersByTimeAsync(10);
      expect(service.getCameraState("cam1")).toBeNull();
    });

    it("updates camera on 'updated' event", async () => {
      await initService({ viscaEnabled: true });
      // Update the camera metadata in DB
      const meta = JSON.stringify({
        ndiSourceName: "CAM1-UPDATED",
        fovWideAngle: 90,
        opticalZoomRatio: 10,
        cameraModel: "generic",
        cameraFeatures: ["pan", "tilt"],
        viscaEnabled: true,
      });
      db.prepare("UPDATE device_connections SET metadata = ? WHERE id = ?").run(meta, "cam1");
      eventBus.emit("bus:camera:device:changed", { deviceId: "cam1", action: "updated" });
      await vi.advanceTimersByTimeAsync(100);
      const state = service.getCameraState("cam1");
      expect(state).not.toBeNull();
      expect(state?.features).toContain("pan");
    });

    it("removes camera when device is disabled on update", async () => {
      await initService({ viscaEnabled: true });
      // Disable the device in DB
      db.prepare("UPDATE device_connections SET enabled = 0 WHERE id = ?").run("cam1");
      eventBus.emit("bus:camera:device:changed", { deviceId: "cam1", action: "updated" });
      await vi.advanceTimersByTimeAsync(100);
      expect(service.getCameraState("cam1")).toBeNull();
    });

    it("creates camera with AI driver for supported model", async () => {
      db = makeDatabase();
      const meta = JSON.stringify({
        ndiSourceName: "CAM-AI",
        fovWideAngle: 60,
        opticalZoomRatio: 20,
        cameraModel: "tongveo-nvs20a-4kn",
        cameraFeatures: ["pan", "tilt", "zoom"],
        viscaEnabled: true,
        aiHttpCookie: "test-cookie",
        aiCredentialId: "test-cred",
      });
      db.prepare("INSERT INTO device_connections (id, deviceType, label, host, port, metadata, features, enabled, createdAt) VALUES (?,?,?,?,?,?,?,?,?)").run(
        "cam-ai",
        "camera-ptz",
        "AI Camera",
        "192.168.1.200",
        5500,
        meta,
        "{}",
        1,
        new Date().toISOString(),
      );

      service = new CameraService(db);
      await service.initialize();
      await vi.advanceTimersByTimeAsync(10);

      // Reload via bus event to exercise the reloadCamera path
      eventBus.emit("bus:camera:device:changed", { deviceId: "cam-ai", action: "updated" });
      await vi.advanceTimersByTimeAsync(100);
      const state = service.getCameraState("cam-ai");
      expect(state).not.toBeNull();
      expect(state?.capabilities.tapToCenter).toBe(true);
    });
  });

  describe("activatePreset with on-camera preset", () => {
    it("uses presetRecall for stored-on-camera presets", async () => {
      seedCamera(db, { viscaEnabled: true });
      db.prepare(
        "INSERT INTO camera_presets (id, cameraId, name, sortOrder, storedOnCamera, cameraPresetSlot, pan, tilt, zoom, focus, autoFocus, aiTracking, aiTilt, aiZoom, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ).run("p-hw", "cam1", "HW Preset", 0, 1, 3, null, null, null, null, 1, 0, 0, 0, new Date().toISOString());
      service = new CameraService(db);
      await service.initialize();
      await vi.advanceTimersByTimeAsync(10);

      mockViscaDriver.presetRecall = vi.fn().mockResolvedValue(undefined);
      await service.activatePreset("cam1", "p-hw");
      expect(mockViscaDriver.presetRecall).toHaveBeenCalledWith(3);
    });
  });

  describe("discoverRange", () => {
    // discoverRange creates its own ViscaCameraDriver, but the test mock is shared.
    // The background poll timer also calls inquirePosition. To make these tests
    // independent of the poll interval, we clear the poll timer before running
    // discoverRange and track only the calls that matter.
    async function initAndStopPoll(): Promise<void> {
      await initService({ viscaEnabled: true });
      // Stop the background poll so it doesn't consume mock responses
      vi.clearAllTimers();
    }

    it("discovers pan range by moving to limits", async () => {
      await initAndStopPoll();
      let callCount = 0;
      mockViscaDriver.inquirePosition.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) return Promise.resolve({ pan: 500 - callCount * 200, tilt: 0, zoom: 0, focus: 0, autoFocus: true });
        if (callCount <= 4) return Promise.resolve({ pan: 100, tilt: 0, zoom: 0, focus: 0, autoFocus: true });
        if (callCount <= 6) return Promise.resolve({ pan: 30000 + (callCount - 4) * 15000, tilt: 0, zoom: 0, focus: 0, autoFocus: true });
        return Promise.resolve({ pan: 60000, tilt: 0, zoom: 0, focus: 0, autoFocus: true });
      });

      const resultPromise = service.discoverRange("192.168.1.100", 5500, "pan");
      await vi.advanceTimersByTimeAsync(60 * 1200 * 2 + 500);
      const result = await resultPromise;

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.min).toBe(100);
        expect(result.value.max).toBe(60000);
      }
      expect(mockViscaDriver.panTiltAbsolute).toHaveBeenCalled();
      expect(mockViscaDriver.disconnect).toHaveBeenCalled();
    });

    it("discovers zoom range", async () => {
      await initAndStopPoll();
      let callCount = 0;
      mockViscaDriver.inquirePosition.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) return Promise.resolve({ pan: 0, tilt: 0, zoom: 1000 - callCount * 400, focus: 0, autoFocus: true });
        if (callCount <= 4) return Promise.resolve({ pan: 0, tilt: 0, zoom: 0, focus: 0, autoFocus: true });
        if (callCount <= 6) return Promise.resolve({ pan: 0, tilt: 0, zoom: 8000 + (callCount - 4) * 4000, focus: 0, autoFocus: true });
        return Promise.resolve({ pan: 0, tilt: 0, zoom: 16384, focus: 0, autoFocus: true });
      });

      const resultPromise = service.discoverRange("192.168.1.100", 5500, "zoom");
      await vi.advanceTimersByTimeAsync(60 * 1200 * 2 + 500);
      const result = await resultPromise;

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.min).toBe(0);
        expect(result.value.max).toBe(16384);
      }
      expect(mockViscaDriver.zoomSpeed).toHaveBeenCalled();
      expect(mockViscaDriver.zoomAbsolute).toHaveBeenCalledWith(0); // return to wide
    });

    it("discovers tilt range", async () => {
      await initAndStopPoll();
      let callCount = 0;
      mockViscaDriver.inquirePosition.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) return Promise.resolve({ pan: 0, tilt: 30000 - callCount * 10000, zoom: 0, focus: 0, autoFocus: true });
        if (callCount <= 4) return Promise.resolve({ pan: 0, tilt: 500, zoom: 0, focus: 0, autoFocus: true });
        if (callCount <= 6) return Promise.resolve({ pan: 0, tilt: 20000 + (callCount - 4) * 10000, zoom: 0, focus: 0, autoFocus: true });
        return Promise.resolve({ pan: 0, tilt: 40000, zoom: 0, focus: 0, autoFocus: true });
      });

      const resultPromise = service.discoverRange("192.168.1.100", 5500, "tilt");
      await vi.advanceTimersByTimeAsync(60 * 1200 * 2 + 500);
      const result = await resultPromise;

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.min).toBe(500);
        expect(result.value.max).toBe(40000);
      }
      expect(mockViscaDriver.panTiltAbsolute).toHaveBeenCalled();
    });

    it("discovers focus range", async () => {
      await initAndStopPoll();
      let callCount = 0;
      mockViscaDriver.inquirePosition.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) return Promise.resolve({ pan: 0, tilt: 0, zoom: 0, focus: 500 - callCount * 200, autoFocus: true });
        if (callCount <= 4) return Promise.resolve({ pan: 0, tilt: 0, zoom: 0, focus: 100, autoFocus: true });
        if (callCount <= 6) return Promise.resolve({ pan: 0, tilt: 0, zoom: 0, focus: 5000 + (callCount - 4) * 3000, autoFocus: true });
        return Promise.resolve({ pan: 0, tilt: 0, zoom: 0, focus: 11000, autoFocus: true });
      });

      const resultPromise = service.discoverRange("192.168.1.100", 5500, "focus");
      await vi.advanceTimersByTimeAsync(60 * 1200 * 2 + 500);
      const result = await resultPromise;

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.min).toBe(100);
        expect(result.value.max).toBe(11000);
      }
      expect(mockViscaDriver.focusSpeed).toHaveBeenCalled();
      expect(mockViscaDriver.focusManual).toHaveBeenCalled(); // return to midpoint
    });

    it("returns error when VISCA cannot connect", async () => {
      await initService({ viscaEnabled: true });
      mockViscaDriver.connect.mockResolvedValueOnce(false);

      const resultPromise = service.discoverRange("192.168.1.100", 5500, "pan");
      await vi.advanceTimersByTimeAsync(100);
      const result = await resultPromise;

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Cannot connect");
        expect(result.status).toBe(503);
      }
    });

    it("returns error when position read returns null", async () => {
      await initService({ viscaEnabled: true });
      mockViscaDriver.inquirePosition.mockResolvedValue({ pan: null, tilt: null, zoom: null, focus: null, autoFocus: null });

      const resultPromise = service.discoverRange("192.168.1.100", 5500, "pan");
      await vi.advanceTimersByTimeAsync(60 * 1200 + 500);
      const result = await resultPromise;

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Failed to read position");
      }
    });

    it("returns error when position never stabilizes (60 iterations)", async () => {
      await initService({ viscaEnabled: true });
      let callCount = 0;
      mockViscaDriver.inquirePosition.mockImplementation(() => {
        callCount++;
        // Always return different values — never stabilizes
        return Promise.resolve({ pan: callCount * 100, tilt: 0, zoom: 0, focus: 0, autoFocus: true });
      });

      const resultPromise = service.discoverRange("192.168.1.100", 5500, "pan");
      await vi.advanceTimersByTimeAsync(60 * 1200 * 2 + 500);
      const result = await resultPromise;

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Failed to read position");
      }
    });

    it("handles exception during discovery gracefully", async () => {
      await initService({ viscaEnabled: true });
      mockViscaDriver.inquirePosition.mockRejectedValue(new Error("VISCA timeout"));

      const resultPromise = service.discoverRange("192.168.1.100", 5500, "zoom");
      await vi.advanceTimersByTimeAsync(60 * 1200 + 500);
      const result = await resultPromise;

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("VISCA timeout");
      }
      expect(mockViscaDriver.disconnect).toHaveBeenCalled();
    });
  });

  describe("getCameraMetadata", () => {
    it("returns metadata for existing camera", async () => {
      await initService({ viscaEnabled: true });
      const meta = service.getCameraMetadata("cam1");
      expect(meta).toBeDefined();
      expect(meta?.ndiSourceName).toBe("CAM1");
    });

    it("returns null for unknown camera", async () => {
      await initService();
      expect(service.getCameraMetadata("unknown")).toBeNull();
    });
  });

  describe("destroy", () => {
    it("disconnects all drivers and clears state", async () => {
      await initService({ viscaEnabled: true });
      service.destroy();
      expect(mockViscaDriver.disconnect).toHaveBeenCalled();
      expect(service.getAllCameraStates()).toHaveLength(0);
    });
  });

  describe("VISCA disconnect detection and debounce", () => {
    let emitted: Array<{ cameraId: string; state: { viscaConnected: boolean } }>;

    beforeEach(() => {
      emitted = [];
      eventBus.subscribe(BUS_CAMERA_STATE_CHANGED, (payload) => {
        emitted.push({ cameraId: payload.cameraId, state: { viscaConnected: payload.state.viscaConnected } });
      });
    });

    it("sets viscaConnected=true after successful VISCA connect", async () => {
      await initService({ viscaEnabled: true });
      expect(service.getCameraState("cam1")?.viscaConnected).toBe(true);
    });

    it("registers onDisconnect callback on VISCA driver", async () => {
      await initService({ viscaEnabled: true });
      expect(mockViscaDriver.onDisconnect).toBeDefined();
      expect(typeof mockViscaDriver.onDisconnect).toBe("function");
    });

    it("debounce requires 2 consecutive failures before broadcasting viscaConnected=false", async () => {
      await initService({ viscaEnabled: true });
      emitted = [];

      // First failure — increments counter but does NOT broadcast
      service._handleViscaFailure(service["cameras"].get("cam1")!);
      const afterFirst = emitted.filter((e) => e.state.viscaConnected === false);
      expect(afterFirst).toHaveLength(0);
      expect(service.getCameraState("cam1")?.viscaConnected).toBe(true);

      // Second failure — broadcasts viscaConnected=false
      service._handleViscaFailure(service["cameras"].get("cam1")!);
      const afterSecond = emitted.filter((e) => e.state.viscaConnected === false);
      expect(afterSecond).toHaveLength(1);
      expect(service.getCameraState("cam1")?.viscaConnected).toBe(false);
    });

    it("single failure does not broadcast viscaConnected=false", async () => {
      await initService({ viscaEnabled: true });
      emitted = [];

      service._handleViscaFailure(service["cameras"].get("cam1")!);
      expect(service.getCameraState("cam1")?.viscaConnected).toBe(true);
      expect(emitted).toHaveLength(0);
    });

    it("successful command resets counter and immediately sets viscaConnected=true", async () => {
      await initService({ viscaEnabled: true });
      const instance = service["cameras"].get("cam1")!;

      // Drive to disconnected state
      service._handleViscaFailure(instance);
      service._handleViscaFailure(instance);
      expect(service.getCameraState("cam1")?.viscaConnected).toBe(false);
      emitted = [];

      // Successful command — immediate recovery
      service._handleViscaSuccess(instance);
      expect(service.getCameraState("cam1")?.viscaConnected).toBe(true);
      expect(emitted.some((e) => e.state.viscaConnected === true)).toBe(true);
    });

    it("onDisconnect callback triggers handleViscaFailure", async () => {
      await initService({ viscaEnabled: true });
      emitted = [];

      // Simulate calling onDisconnect twice (as two socket events)
      mockViscaDriver.onDisconnect!();
      expect(service.getCameraState("cam1")?.viscaConnected).toBe(true); // 1 failure — not enough

      mockViscaDriver.onDisconnect!();
      expect(service.getCameraState("cam1")?.viscaConnected).toBe(false); // 2nd failure — broadcasts
    });

    it("poll cycle backup detection works when isConnected returns false", async () => {
      await initService({ viscaEnabled: true });
      const instance = service["cameras"].get("cam1")!;
      emitted = [];

      // Mock isConnected to return false (half-open TCP scenario)
      // and connect to fail (camera unreachable)
      mockViscaDriver.isConnected.mockReturnValue(false);
      mockViscaDriver.connect.mockResolvedValue(false);

      // Simulate poll tick — reconnect attempt fails
      await (service as unknown as { pollPosition: (i: typeof instance) => Promise<void> }).pollPosition(instance);
      // One failure from poll...
      expect(service.getCameraState("cam1")?.viscaConnected).toBe(true); // 1 failure

      // Second poll tick
      await (service as unknown as { pollPosition: (i: typeof instance) => Promise<void> }).pollPosition(instance);
      expect(service.getCameraState("cam1")?.viscaConnected).toBe(false); // 2nd failure
    });

    it("successful poll resets failure counter", async () => {
      await initService({ viscaEnabled: true });
      const instance = service["cameras"].get("cam1")!;

      // One failure
      service._handleViscaFailure(instance);

      // Successful poll should reset
      mockViscaDriver.isConnected.mockReturnValue(true);
      mockViscaDriver.inquirePosition.mockResolvedValue({ pan: 100, tilt: 200, zoom: 300, focus: 400, autoFocus: true });
      await (service as unknown as { pollPosition: (i: typeof instance) => Promise<void> }).pollPosition(instance);

      // Now a single failure should NOT trigger disconnect (counter was reset)
      service._handleViscaFailure(instance);
      expect(service.getCameraState("cam1")?.viscaConnected).toBe(true);
    });
  });
});
