/**
 * Camera advanced features integration tests.
 *
 * Covers: adaptive speed (end-to-end via socket), tap-to-center
 * (FOV calculation via socket), AI tracking driver, and hot-reload
 * bus events for camera device/preset changes.
 *
 * Gaps addressed: B29–B32 from docs/testing-gaps.md
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { buildTestServer, destroyServer, resetServer, loginAsAdmin } from "../harness.js";
import type { TestServer } from "../harness.js";
import { CTS_CAMERA_PTZ_MOVE_START, CTS_CAMERA_PTZ_MOVE_STOP } from "@invisible-av-booth/shared";
import { eventBus } from "../../../src/eventBus/eventBus.js";
import { BUS_CAMERA_DEVICE_CHANGED, BUS_CAMERA_PRESETS_CHANGED } from "../../../src/eventBus/types.js";
import { applyAdaptiveSpeed, computeFov } from "../../../src/camera/CameraService.js";

let server: TestServer;
const sockets: ClientSocket[] = [];

const CAMERA_METADATA = JSON.stringify({
  ndiSourceName: "TestCam",
  viscaEnabled: false,
  cameraModel: "generic",
  cameraFeatures: ["pan", "tilt", "zoom"],
  fovWideAngle: 60,
  opticalZoomRatio: 20,
});

beforeAll(async () => {
  server = await buildTestServer();
});
afterAll(() => destroyServer(server));

beforeEach(async () => {
  resetServer(server);
  server.ctx.database
    .prepare("INSERT INTO device_connections (id, deviceType, label, host, port, metadata, features, createdAt) VALUES (?,?,?,?,?,?,?,?)")
    .run("cam-adv", "camera-ptz", "AdvCam", "127.0.0.1", 5500, CAMERA_METADATA, "{}", new Date().toISOString());
  await server.ctx.cameraService.initialize();
});

afterEach(() => {
  while (sockets.length) sockets.pop()!.disconnect();
});

async function connectSocket(cookie: string): Promise<ClientSocket> {
  const token = cookie.split("token=")[1]?.split(";")[0] ?? "";
  const socket = ioClient(`http://localhost:${server.port}`, { transports: ["websocket"], auth: { token } });
  sockets.push(socket);
  await new Promise<void>((resolve) => socket.on("connect", resolve));
  return socket;
}

// ── B29: Adaptive speed calculation (integration-level) ──────────────────────

describe("Adaptive speed calculation", () => {
  it("at full wide (zoom 0.0), speed is capped at MAX_EFFECTIVE_SPEED (0.6)", () => {
    const result = applyAdaptiveSpeed(1.0, 0.0);
    expect(result).toBeCloseTo(0.6);
  });

  it("at full telephoto (zoom 1.0), speed is 30% of requested", () => {
    const result = applyAdaptiveSpeed(1.0, 1.0);
    // 1.0 * (1.0 - 1.0 * 0.7) = 0.3, capped at min(0.3, 0.6) = 0.3
    expect(result).toBeCloseTo(0.3);
  });

  it("negative speeds are preserved (direction maintained)", () => {
    const result = applyAdaptiveSpeed(-0.5, 0.5);
    // -0.5 * (1.0 - 0.5 * 0.7) = -0.5 * 0.65 = -0.325
    expect(result).toBeCloseTo(-0.325);
  });

  it("startMove via socket applies adaptive speed (zoom affects effective speed)", async () => {
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);
    const socket = await connectSocket(cookie);

    // For a non-VISCA camera, position.zoom is stored as raw value from applySet.
    // The adaptive speed uses zoomFraction = (zoomRaw - zoomMin) / (zoomMax - zoomMin).
    // With defaults zoomMin=0, zoomMax=16384, a raw zoom of 8192 gives zoomFraction=0.5.
    await server.ctx.cameraService.applySet("cam-adv", { zoom: 8192 });

    socket.emit(CTS_CAMERA_PTZ_MOVE_START, { cameraId: "cam-adv", pan: 1.0, tilt: 0.0 });
    await new Promise((r) => setTimeout(r, 50));

    const sessions = (server.ctx.cameraService as unknown as { moveSessions: Map<string, { currentPan: number }> }).moveSessions;
    const session = sessions.get("cam-adv");
    expect(session).toBeDefined();
    // At zoomFraction 0.5: applyAdaptiveSpeed(1.0, 0.5) = 1.0 * (1.0 - 0.5*0.7) = 0.65, capped at 0.6
    // So the result should be exactly 0.6 (cap applied)
    expect(session!.currentPan).toBeCloseTo(0.6);

    socket.emit(CTS_CAMERA_PTZ_MOVE_STOP, { cameraId: "cam-adv" });
  });

  it("startMove at high zoom produces lower effective speed", async () => {
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);
    const socket = await connectSocket(cookie);

    // Ensure position object exists (non-VISCA cameras start with position=null)
    const instance = (server.ctx.cameraService as unknown as { cameras: Map<string, { state: { position: unknown } }> }).cameras.get("cam-adv")!;
    instance.state.position = { pan: 0, tilt: 0, zoom: 14000, focus: 0 };

    socket.emit(CTS_CAMERA_PTZ_MOVE_START, { cameraId: "cam-adv", pan: 1.0, tilt: 0.0 });
    await new Promise((r) => setTimeout(r, 50));

    const sessions = (server.ctx.cameraService as unknown as { moveSessions: Map<string, { currentPan: number }> }).moveSessions;
    const session = sessions.get("cam-adv");
    expect(session).toBeDefined();
    // zoomFraction = 14000/16384 ≈ 0.854
    // applyAdaptiveSpeed(1.0, 0.854) = 1.0 * (1 - 0.854*0.7) = 0.402 → below 0.6 cap
    expect(session!.currentPan).toBeLessThan(0.6);
    expect(session!.currentPan).toBeGreaterThan(0.3);

    socket.emit(CTS_CAMERA_PTZ_MOVE_STOP, { cameraId: "cam-adv" });
  });
});

// ── B30: Tap-to-center FOV calculation ───────────────────────────────────────

describe("Tap-to-center FOV calculation", () => {
  it("computeFov at wide (zoom 0.0) returns fovWideAngle", () => {
    expect(computeFov(60, 0.0, 20)).toBeCloseTo(60);
  });

  it("computeFov at telephoto (zoom 1.0) returns fovWideAngle / opticalZoomRatio", () => {
    // 60 / (1 + 1.0 * (20-1)) = 60 / 20 = 3
    expect(computeFov(60, 1.0, 20)).toBeCloseTo(3);
  });

  it("computeFov at mid zoom returns intermediate value", () => {
    // 60 / (1 + 0.5 * 19) = 60 / 10.5 ≈ 5.71
    expect(computeFov(60, 0.5, 20)).toBeCloseTo(5.714, 2);
  });

  it("computeFov with fovTeleAngle uses logarithmic interpolation", () => {
    // fovWide * (fovTele / fovWide)^zoom = 60 * (3/60)^0.5 = 60 * 0.2236 ≈ 13.4
    const result = computeFov(60, 0.5, 20, 3);
    expect(result).toBeCloseTo(13.416, 1);
  });

  it("tap-to-center rejects when VISCA is not configured", async () => {
    // cam-adv has viscaEnabled: false — tap-to-center should fail
    const meta = server.ctx.cameraService.getCameraMetadata("cam-adv")!;
    const result = await server.ctx.cameraService.tapToCenter("cam-adv", 0.5, -0.3, meta);

    expect(result.success).toBe(false);
    expect(result.error).toContain("VISCA not configured");
  });
});

// ── B31: AI tracking HTTP API calls ──────────────────────────────────────────

describe("AI tracking driver (TongveoAiDriver)", () => {
  it("camera without AI driver ignores aiTracking toggle gracefully", async () => {
    // cam-adv is "generic" model — no AI driver
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);
    const socket = await connectSocket(cookie);

    // Set aiTracking — should update state but not throw (no driver to call)
    socket.emit("cts:camera:set", { cameraId: "cam-adv", aiTracking: true });
    await new Promise((r) => setTimeout(r, 100));

    const state = server.ctx.cameraService.getCameraState("cam-adv");
    expect(state?.aiTracking).toBe(true);
    // No error thrown — graceful degradation
  });

  it("AI driver is not created for generic camera model", async () => {
    // Verify the camera instance has no aiDriver
    const instance = (server.ctx.cameraService as unknown as { cameras: Map<string, { aiDriver: unknown }> }).cameras.get("cam-adv");
    expect(instance?.aiDriver).toBeNull();
  });
});

// ── B32: Hot-reload bus events ───────────────────────────────────────────────

describe("Hot-reload bus events", () => {
  it("BUS_CAMERA_PRESETS_CHANGED updates presets in camera state", async () => {
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);
    const socket = await connectSocket(cookie);

    // Wait for initial state
    await new Promise((r) => setTimeout(r, 50));

    const newPresets = [
      {
        id: "p1",
        name: "Wide",
        sortOrder: 0,
        storedOnCamera: false,
        cameraPresetSlot: null,
        pan: 100,
        tilt: 200,
        zoom: 0,
        focus: null,
        autoFocus: true,
        aiTracking: false,
        aiTilt: false,
        aiZoom: false,
      },
      {
        id: "p2",
        name: "Close",
        sortOrder: 1,
        storedOnCamera: false,
        cameraPresetSlot: null,
        pan: 500,
        tilt: 600,
        zoom: 10000,
        focus: null,
        autoFocus: true,
        aiTracking: false,
        aiTilt: false,
        aiZoom: false,
      },
    ];

    // Emit presets changed event
    const stateReceived = new Promise<{ presets: Array<{ id: string; name: string }> }>((resolve) => {
      socket.on("stc:camera:state:update", (data: { presets: Array<{ id: string; name: string }> }) => {
        if (data.presets?.length === 2) resolve(data);
      });
    });

    eventBus.emit(BUS_CAMERA_PRESETS_CHANGED, { cameraId: "cam-adv", presets: newPresets });

    const payload = await stateReceived;
    expect(payload.presets).toHaveLength(2);
    expect(payload.presets[0]!.name).toBe("Wide");
    expect(payload.presets[1]!.name).toBe("Close");
  });

  it("BUS_CAMERA_DEVICE_CHANGED with action 'deleted' removes camera", async () => {
    // Verify camera exists
    expect(server.ctx.cameraService.getCameraState("cam-adv")).not.toBeNull();

    // Emit delete event
    eventBus.emit(BUS_CAMERA_DEVICE_CHANGED, { action: "deleted", deviceId: "cam-adv" });
    await new Promise((r) => setTimeout(r, 100));

    // Camera should be removed
    expect(server.ctx.cameraService.getCameraState("cam-adv")).toBeNull();
  });

  it("BUS_CAMERA_DEVICE_CHANGED with action 'created' adds new camera", async () => {
    // Insert a new camera in DB
    server.ctx.database
      .prepare("INSERT INTO device_connections (id, deviceType, label, host, port, metadata, features, createdAt) VALUES (?,?,?,?,?,?,?,?)")
      .run("cam-new", "camera-ptz", "NewCam", "127.0.0.1", 5501, CAMERA_METADATA, "{}", new Date().toISOString());

    // Camera doesn't exist yet in the service
    expect(server.ctx.cameraService.getCameraState("cam-new")).toBeNull();

    // Emit created event
    eventBus.emit(BUS_CAMERA_DEVICE_CHANGED, { action: "created", deviceId: "cam-new" });
    await new Promise((r) => setTimeout(r, 100));

    // Camera should now exist
    expect(server.ctx.cameraService.getCameraState("cam-new")).not.toBeNull();
  });

  it("BUS_CAMERA_DEVICE_CHANGED with action 'updated' reloads camera", async () => {
    // Change the camera label in DB
    server.ctx.database.prepare("UPDATE device_connections SET label = ? WHERE id = ?").run("UpdatedCam", "cam-adv");

    // Emit updated event
    eventBus.emit(BUS_CAMERA_DEVICE_CHANGED, { action: "updated", deviceId: "cam-adv" });
    await new Promise((r) => setTimeout(r, 100));

    // Camera should still exist (reloaded, not deleted)
    expect(server.ctx.cameraService.getCameraState("cam-adv")).not.toBeNull();
  });

  it("BUS_CAMERA_DEVICE_CHANGED broadcasts updated state to clients", async () => {
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);
    const socket = await connectSocket(cookie);

    // Insert a new camera
    server.ctx.database
      .prepare("INSERT INTO device_connections (id, deviceType, label, host, port, metadata, features, createdAt) VALUES (?,?,?,?,?,?,?,?)")
      .run("cam-hot", "camera-ptz", "HotCam", "127.0.0.1", 5502, CAMERA_METADATA, "{}", new Date().toISOString());

    // Listen for state broadcast
    const stateReceived = new Promise<{ cameraId: string }>((resolve) => {
      socket.on("stc:camera:state:update", (data: { cameraId: string }) => {
        if (data.cameraId === "cam-hot") resolve(data);
      });
    });

    eventBus.emit(BUS_CAMERA_DEVICE_CHANGED, { action: "created", deviceId: "cam-hot" });

    const payload = await stateReceived;
    expect(payload.cameraId).toBe("cam-hot");
  });
});
