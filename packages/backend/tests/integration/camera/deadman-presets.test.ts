/**
 * Camera dead-man's switch and preset activation integration tests.
 *
 * Covers: keepalive timeout auto-stop, preset activation (software positioning),
 * preset toggle state application, and activePresetId clearing on manual movement.
 *
 * Gaps addressed: B25–B28 from docs/testing-gaps.md
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { buildTestServer, destroyServer, resetServer, loginAsAdmin } from "../harness.js";
import type { TestServer } from "../harness.js";
import {
  CTS_CAMERA_PTZ_MOVE_START,
  CTS_CAMERA_PTZ_MOVE_KEEPALIVE,
  CTS_CAMERA_PTZ_MOVE_STOP,
  CTS_CAMERA_PRESET_ACTIVATE,
  CTS_CAMERA_SET,
} from "@invisible-av-booth/shared";

let server: TestServer;
const sockets: ClientSocket[] = [];

const CAMERA_METADATA = JSON.stringify({
  ndiSourceName: "TestCam NDI",
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
  // Insert a camera device
  server.ctx.database
    .prepare("INSERT INTO device_connections (id, deviceType, label, host, port, metadata, features, createdAt) VALUES (?,?,?,?,?,?,?,?)")
    .run("cam-dead", "camera-ptz", "DeadManCam", "127.0.0.1", 5500, CAMERA_METADATA, "{}", new Date().toISOString());
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

// ── B25: Dead-man's switch ───────────────────────────────────────────────────

describe("Camera dead-man's switch", () => {
  it("auto-stops movement when keepalive times out (750ms)", async () => {
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);
    const socket = await connectSocket(cookie);

    // Start movement
    socket.emit(CTS_CAMERA_PTZ_MOVE_START, { cameraId: "cam-dead", pan: 0.5, tilt: 0.3 });
    await new Promise((r) => setTimeout(r, 50));

    // Verify movement session is active
    const service = server.ctx.cameraService;
    expect((service as unknown as { moveSessions: Map<string, unknown> }).moveSessions.has("cam-dead")).toBe(true);

    // Don't send any keepalives — wait for timeout (750ms + buffer)
    await new Promise((r) => setTimeout(r, 900));

    // Dead-man's switch should have fired — session should be cleared
    expect((service as unknown as { moveSessions: Map<string, unknown> }).moveSessions.has("cam-dead")).toBe(false);
  });

  it("keepalive prevents timeout", async () => {
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);
    const socket = await connectSocket(cookie);

    // Start movement
    socket.emit(CTS_CAMERA_PTZ_MOVE_START, { cameraId: "cam-dead", pan: 0.5, tilt: 0.3 });
    await new Promise((r) => setTimeout(r, 50));

    // Send keepalive before timeout
    await new Promise((r) => setTimeout(r, 400));
    socket.emit(CTS_CAMERA_PTZ_MOVE_KEEPALIVE, { cameraId: "cam-dead", pan: 0.5, tilt: 0.3 });

    // Wait past original timeout but not past new timeout
    await new Promise((r) => setTimeout(r, 400));

    // Session should still be active (keepalive reset the timer)
    const service = server.ctx.cameraService;
    expect((service as unknown as { moveSessions: Map<string, unknown> }).moveSessions.has("cam-dead")).toBe(true);

    // Now stop explicitly
    socket.emit(CTS_CAMERA_PTZ_MOVE_STOP, { cameraId: "cam-dead" });
    await new Promise((r) => setTimeout(r, 50));
    expect((service as unknown as { moveSessions: Map<string, unknown> }).moveSessions.has("cam-dead")).toBe(false);
  });
});

// ── B26: Preset activation ───────────────────────────────────────────────────

describe("Camera preset activation", () => {
  function seedPreset(opts: { storedOnCamera?: boolean; cameraPresetSlot?: number; aiTracking?: boolean; autoFocus?: boolean }): string {
    const presetId = `preset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    server.ctx.database
      .prepare(
        "INSERT INTO camera_presets (id, cameraId, name, sortOrder, storedOnCamera, cameraPresetSlot, pan, tilt, zoom, focus, autoFocus, aiTracking, aiTilt, aiZoom, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        presetId,
        "cam-dead",
        "Test Preset",
        0,
        opts.storedOnCamera ? 1 : 0,
        opts.cameraPresetSlot ?? null,
        1000,
        2000,
        5000,
        null,
        opts.autoFocus ? 1 : 0,
        opts.aiTracking ? 1 : 0,
        0,
        0,
        new Date().toISOString(),
      );
    // Reload presets in camera service
    server.ctx.cameraService.initialize();
    return presetId;
  }

  it("activates a preset and sets activePresetId", async () => {
    const presetId = seedPreset({ storedOnCamera: false });
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);
    const socket = await connectSocket(cookie);

    const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      socket.emit(CTS_CAMERA_PRESET_ACTIVATE, { cameraId: "cam-dead", presetId }, (r: { success: boolean; error?: string }) => resolve(r));
    });

    expect(result.success).toBe(true);
    const state = server.ctx.cameraService.getCameraState("cam-dead");
    expect(state?.activePresetId).toBe(presetId);
  });

  it("returns error for nonexistent preset", async () => {
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);
    const socket = await connectSocket(cookie);

    const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      socket.emit(CTS_CAMERA_PRESET_ACTIVATE, { cameraId: "cam-dead", presetId: "nonexistent" }, (r: { success: boolean; error?: string }) => resolve(r));
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns error for nonexistent camera", async () => {
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);
    const socket = await connectSocket(cookie);

    const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      socket.emit(CTS_CAMERA_PRESET_ACTIVATE, { cameraId: "nonexistent", presetId: "any" }, (r: { success: boolean; error?: string }) => resolve(r));
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  // B27: Preset applies toggle states
  it("preset activation applies toggle states (aiTracking, autoFocus)", async () => {
    // Seed a preset with toggles ON
    const presetId = `preset-toggles-${Date.now()}`;
    server.ctx.database
      .prepare(
        "INSERT INTO camera_presets (id, cameraId, name, sortOrder, storedOnCamera, cameraPresetSlot, pan, tilt, zoom, focus, autoFocus, aiTracking, aiTilt, aiZoom, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(presetId, "cam-dead", "Toggle Preset", 0, 0, null, 1000, 2000, 5000, null, 1, 1, 1, 1, new Date().toISOString());
    await server.ctx.cameraService.initialize();

    // After initialize, camera state has aiTracking=false (default) and autoFocus=true (default)
    let state = server.ctx.cameraService.getCameraState("cam-dead");
    expect(state?.aiTracking).toBe(false);
    // autoFocus defaults to true — set it to false via service for test clarity
    await server.ctx.cameraService.applySet("cam-dead", { aiTracking: false, autoFocus: false });
    state = server.ctx.cameraService.getCameraState("cam-dead");
    expect(state?.aiTracking).toBe(false);
    expect(state?.autoFocus).toBe(false);

    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);
    const socket = await connectSocket(cookie);

    // Activate preset — should turn toggles ON
    await new Promise<void>((resolve) => {
      socket.emit(CTS_CAMERA_PRESET_ACTIVATE, { cameraId: "cam-dead", presetId }, () => resolve());
    });

    state = server.ctx.cameraService.getCameraState("cam-dead");
    expect(state?.aiTracking).toBeTruthy();
    expect(state?.autoFocus).toBeTruthy();
    expect(state?.aiTilt).toBeTruthy();
    expect(state?.aiZoom).toBeTruthy();
  });

  // B28: activePresetId clears on manual movement
  it("activePresetId clears when manual zoom is applied", async () => {
    const presetId = seedPreset({ storedOnCamera: false });
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);
    const socket = await connectSocket(cookie);

    // Activate preset
    await new Promise<void>((resolve) => {
      socket.emit(CTS_CAMERA_PRESET_ACTIVATE, { cameraId: "cam-dead", presetId }, () => resolve());
    });

    let state = server.ctx.cameraService.getCameraState("cam-dead");
    expect(state?.activePresetId).toBe(presetId);

    // Manual zoom change
    socket.emit(CTS_CAMERA_SET, { cameraId: "cam-dead", zoom: 0.5 });
    await new Promise((r) => setTimeout(r, 100));

    state = server.ctx.cameraService.getCameraState("cam-dead");
    expect(state?.activePresetId).toBeNull();
  });

  it("activePresetId clears when any applySet change occurs (zoom, focus, toggle)", async () => {
    const presetId = seedPreset({ storedOnCamera: false });
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);
    const socket = await connectSocket(cookie);

    // Activate preset
    await new Promise<void>((resolve) => {
      socket.emit(CTS_CAMERA_PRESET_ACTIVATE, { cameraId: "cam-dead", presetId }, () => resolve());
    });

    let state = server.ctx.cameraService.getCameraState("cam-dead");
    expect(state?.activePresetId).toBe(presetId);

    // Toggle autoFocus — should clear activePresetId
    socket.emit(CTS_CAMERA_SET, { cameraId: "cam-dead", autoFocus: true });
    await new Promise((r) => setTimeout(r, 100));

    state = server.ctx.cameraService.getCameraState("cam-dead");
    expect(state?.activePresetId).toBeNull();
  });

  it("preset state change broadcasts to all connected clients", async () => {
    const presetId = seedPreset({ storedOnCamera: false });
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);
    const socket1 = await connectSocket(cookie);
    const socket2 = await connectSocket(cookie);

    // STC_CAMERA_STATE_UPDATE is emitted for state changes (not STC_CAMERA_STATE which is initial only)
    const stateReceived = new Promise<{ activePresetId: string | null }>((resolve) => {
      socket2.on("stc:camera:state:update", (data: { activePresetId: string | null }) => {
        if (data.activePresetId === presetId) resolve(data);
      });
    });

    socket1.emit(CTS_CAMERA_PRESET_ACTIVATE, { cameraId: "cam-dead", presetId }, () => {});

    const payload = await stateReceived;
    expect(payload.activePresetId).toBe(presetId);
  });
});
