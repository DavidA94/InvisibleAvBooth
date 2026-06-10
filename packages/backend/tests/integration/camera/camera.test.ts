import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { buildTestServer, destroyServer, resetServer, loginAs, loginAsAdmin } from "../harness.js";
import type { TestServer } from "../harness.js";
import { STC_CAMERA_STATE, CTS_CAMERA_SET, CTS_CAMERA_PTZ_MOVE_START, CTS_CAMERA_PTZ_MOVE_STOP } from "@invisible-av-booth/shared";

describe("Camera Socket Events", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await buildTestServer();
  });

  beforeEach(() => {
    resetServer(server);
  });

  afterAll(() => {
    destroyServer(server);
  });

  async function connectSocket(cookie: string): Promise<ClientSocket> {
    const token = cookie.split("token=")[1]?.split(";")[0] ?? "";
    const socket = ioClient(`http://localhost:${server.port}`, {
      transports: ["websocket"],
      auth: { token },
    });
    await new Promise<void>((resolve) => socket.on("connect", resolve));
    return socket;
  }

  it("emitInitialState returns camera states and ndiAvailable", async () => {
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);
    const socket = await connectSocket(cookie);

    const state = await new Promise<{ cameras: unknown[]; ndiAvailable: boolean }>((resolve) => {
      socket.emit("cts:request:initial:state");
      socket.on(STC_CAMERA_STATE, (data) => resolve(data));
    });

    expect(state).toHaveProperty("cameras");
    expect(state).toHaveProperty("ndiAvailable");
    expect(Array.isArray(state.cameras)).toBe(true);
    expect(typeof state.ndiAvailable).toBe("boolean");

    socket.disconnect();
  });

  it("cts:camera:set updates state (admin can set AI fields)", async () => {
    // Insert a camera device
    server.ctx.database
      .prepare("INSERT INTO device_connections (id, deviceType, label, host, port, metadata, features, createdAt) VALUES (?,?,?,?,?,?,?,?)")
      .run(
        "cam-int",
        "camera-ptz",
        "IntCam",
        "127.0.0.1",
        5500,
        JSON.stringify({
          ndiSourceName: "X",
          viscaEnabled: false,
          cameraModel: "generic",
          cameraFeatures: ["pan", "tilt", "zoom"],
          fovWideAngle: 60,
          opticalZoomRatio: 20,
        }),
        "{}",
        new Date().toISOString(),
      );

    // Re-initialize camera service to pick up the new camera
    await server.ctx.cameraService.initialize();

    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);
    const socket = await connectSocket(cookie);

    socket.emit(CTS_CAMERA_SET, { cameraId: "cam-int", aiTracking: true });

    // Wait for state update broadcast
    await new Promise((r) => setTimeout(r, 100));

    const state = server.ctx.cameraService.getCameraState("cam-int");
    expect(state?.aiTracking).toBe(true);

    socket.disconnect();
  });

  it("role enforcement: volunteer cannot toggle AI", async () => {
    server.ctx.database
      .prepare("INSERT INTO device_connections (id, deviceType, label, host, port, metadata, features, createdAt) VALUES (?,?,?,?,?,?,?,?)")
      .run(
        "cam-role",
        "camera-ptz",
        "RoleCam",
        "127.0.0.1",
        5500,
        JSON.stringify({
          ndiSourceName: "Y",
          viscaEnabled: false,
          cameraModel: "generic",
          cameraFeatures: ["pan", "tilt", "zoom"],
          fovWideAngle: 60,
          opticalZoomRatio: 20,
        }),
        "{}",
        new Date().toISOString(),
      );

    await server.ctx.cameraService.initialize();

    const cookie = await loginAs(server.agent, server.ctx.authService, "volunteer1", "pass123", "AvVolunteer");
    const socket = await connectSocket(cookie);

    socket.emit(CTS_CAMERA_SET, { cameraId: "cam-role", aiTracking: true, zoom: 0.5 });
    await new Promise((r) => setTimeout(r, 100));

    const state = server.ctx.cameraService.getCameraState("cam-role");
    // AI should NOT have been set (stripped by role enforcement)
    expect(state?.aiTracking).toBe(false);

    socket.disconnect();
  });

  it("move:start and move:stop lifecycle", async () => {
    server.ctx.database
      .prepare("INSERT INTO device_connections (id, deviceType, label, host, port, metadata, features, createdAt) VALUES (?,?,?,?,?,?,?,?)")
      .run(
        "cam-move",
        "camera-ptz",
        "MoveCam",
        "127.0.0.1",
        5500,
        JSON.stringify({
          ndiSourceName: "Z",
          viscaEnabled: false,
          cameraModel: "generic",
          cameraFeatures: ["pan", "tilt", "zoom"],
          fovWideAngle: 60,
          opticalZoomRatio: 20,
        }),
        "{}",
        new Date().toISOString(),
      );

    await server.ctx.cameraService.initialize();

    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);
    const socket = await connectSocket(cookie);

    socket.emit(CTS_CAMERA_PTZ_MOVE_START, { cameraId: "cam-move", pan: 0.5, tilt: 0.3 });
    await new Promise((r) => setTimeout(r, 50));

    socket.emit(CTS_CAMERA_PTZ_MOVE_STOP, { cameraId: "cam-move" });
    await new Promise((r) => setTimeout(r, 50));

    // No errors thrown = lifecycle handled correctly
    socket.disconnect();
  });
});
