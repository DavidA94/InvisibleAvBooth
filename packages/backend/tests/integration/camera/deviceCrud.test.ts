import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { buildTestServer, destroyServer, resetServer, loginAsAdmin } from "../harness.js";
import type { TestServer } from "../harness.js";

describe("Camera Device CRUD", () => {
  let server: TestServer;
  let adminCookie: string;

  beforeAll(async () => {
    server = await buildTestServer();
  });

  beforeEach(async () => {
    resetServer(server);
    adminCookie = await loginAsAdmin(server.agent, server.ctx.authService);
  });

  afterAll(() => {
    destroyServer(server);
  });

  it("create camera-ptz device with metadata", async () => {
    const res = await server.agent
      .post("/api/admin/devices")
      .set("Cookie", adminCookie)
      .send({
        deviceType: "camera-ptz",
        label: "Main Camera",
        host: "192.168.1.50",
        port: 5500,
        metadata: {
          ndiSourceName: "Camera1 (NDI)",
          cameraModel: "generic",
          viscaEnabled: true,
          cameraFeatures: ["pan", "tilt", "zoom"],
          fovWideAngle: 60,
          opticalZoomRatio: 20,
        },
      });
    expect(res.status).toBe(201);
    expect(res.body.deviceType).toBe("camera-ptz");
    expect(res.body.metadata.ndiSourceName).toBe("Camera1 (NDI)");
  });

  it("encrypted fields not exposed in GET response", async () => {
    await server.agent
      .post("/api/admin/devices")
      .set("Cookie", adminCookie)
      .send({
        deviceType: "camera-ptz",
        label: "AI Camera",
        host: "192.168.1.51",
        port: 5500,
        password: "secret123",
        metadata: { ndiSourceName: "AICam", cameraModel: "tongveo-nvs20a-4kn", viscaEnabled: false, cameraFeatures: ["pan", "tilt", "zoom"] },
      });

    const listRes = await server.agent.get("/api/admin/devices").set("Cookie", adminCookie);
    const device = listRes.body.find((d: { label: string }) => d.label === "AI Camera");
    expect(device).toBeDefined();
    // Password should not be in response
    expect(device.password).toBeUndefined();
    expect(device.encryptedPassword).toBeUndefined();
  });

  it("VISCA probe failure logs warning but device saves", async () => {
    const res = await server.agent
      .post("/api/admin/devices")
      .set("Cookie", adminCookie)
      .send({
        deviceType: "camera-ptz",
        label: "VISCA Camera",
        host: "10.0.0.99", // unreachable
        port: 5500,
        metadata: {
          ndiSourceName: "ViscaCam",
          cameraModel: "generic",
          viscaEnabled: true,
          cameraFeatures: ["pan", "tilt", "zoom"],
          fovWideAngle: 60,
          opticalZoomRatio: 20,
        },
      });
    // Device should save successfully even if VISCA is unreachable
    expect(res.status).toBe(201);
    expect(res.body.label).toBe("VISCA Camera");
  });

  it("NDI unavailable degrades gracefully", async () => {
    const res = await server.agent
      .post("/api/admin/devices")
      .set("Cookie", adminCookie)
      .send({
        deviceType: "camera-ptz",
        label: "NDI Camera",
        host: "127.0.0.1",
        port: 5500,
        metadata: { ndiSourceName: "NdiCam", cameraModel: "generic", viscaEnabled: false, cameraFeatures: ["pan", "tilt", "zoom"] },
      });
    expect(res.status).toBe(201);
    // Device is created regardless of NDI availability
    expect(res.body.deviceType).toBe("camera-ptz");
  });
});
