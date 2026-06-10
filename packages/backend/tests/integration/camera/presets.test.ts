import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { buildTestServer, destroyServer, resetServer, loginAsAdmin, loginAs } from "../harness.js";
import type { TestServer } from "../harness.js";

describe("Preset REST Endpoints", () => {
  let server: TestServer;
  let adminCookie: string;

  beforeAll(async () => {
    server = await buildTestServer();
  });

  beforeEach(async () => {
    resetServer(server);
    adminCookie = await loginAsAdmin(server.agent, server.ctx.authService);
    // Insert a camera device
    server.ctx.database
      .prepare("INSERT INTO device_connections (id, deviceType, label, host, port, metadata, features, createdAt) VALUES (?,?,?,?,?,?,?,?)")
      .run("cam1", "camera-ptz", "TestCam", "127.0.0.1", 5500, "{}", "{}", new Date().toISOString());
  });

  afterAll(() => {
    destroyServer(server);
  });

  it("CRUD lifecycle: create, read, update, delete", async () => {
    // Create
    const createRes = await server.agent
      .post("/api/admin/cameras/cam1/presets")
      .set("Cookie", adminCookie)
      .send({ name: "Wide Shot", zoom: 0.0, pan: 0, tilt: 0 });
    expect(createRes.status).toBe(201);
    expect(createRes.body.name).toBe("Wide Shot");
    const presetId = createRes.body.id;

    // Read
    const listRes = await server.agent.get("/api/admin/cameras/cam1/presets").set("Cookie", adminCookie);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].id).toBe(presetId);

    // Update
    const updateRes = await server.agent.put(`/api/admin/cameras/cam1/presets/${presetId}`).set("Cookie", adminCookie).send({ name: "Wide Updated" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.name).toBe("Wide Updated");

    // Delete
    const deleteRes = await server.agent.delete(`/api/admin/cameras/cam1/presets/${presetId}`).set("Cookie", adminCookie);
    expect(deleteRes.status).toBe(204);

    // Verify deleted
    const listRes2 = await server.agent.get("/api/admin/cameras/cam1/presets").set("Cookie", adminCookie);
    expect(listRes2.body).toHaveLength(0);
  });

  it("reorder persists sortOrder correctly", async () => {
    await server.agent.post("/api/admin/cameras/cam1/presets").set("Cookie", adminCookie).send({ name: "A" });
    await server.agent.post("/api/admin/cameras/cam1/presets").set("Cookie", adminCookie).send({ name: "B" });
    await server.agent.post("/api/admin/cameras/cam1/presets").set("Cookie", adminCookie).send({ name: "C" });

    const list = await server.agent.get("/api/admin/cameras/cam1/presets").set("Cookie", adminCookie);
    const ids = list.body.map((p: { id: string }) => p.id);

    // Reverse order
    const reversed = [...ids].reverse();
    await server.agent.put("/api/admin/cameras/cam1/presets/order").set("Cookie", adminCookie).send({ order: reversed });

    const reordered = await server.agent.get("/api/admin/cameras/cam1/presets").set("Cookie", adminCookie);
    expect(reordered.body[0].id).toBe(reversed[0]);
    expect(reordered.body[2].id).toBe(reversed[2]);
  });

  it("cascade delete: deleting device removes presets", async () => {
    await server.agent.post("/api/admin/cameras/cam1/presets").set("Cookie", adminCookie).send({ name: "ToDelete" });

    // Delete the device
    await server.agent.delete("/api/admin/devices/cam1").set("Cookie", adminCookie);

    // Presets should be gone
    const count = server.ctx.database.prepare("SELECT COUNT(*) as c FROM camera_presets WHERE cameraId = 'cam1'").get() as { c: number };
    expect(count.c).toBe(0);
  });

  it("ADMIN role enforcement: volunteer rejected", async () => {
    const volCookie = await loginAs(server.agent, server.ctx.authService, "vol1", "pass", "AvVolunteer");
    const res = await server.agent.get("/api/admin/cameras/cam1/presets").set("Cookie", volCookie);
    expect(res.status).toBe(403);
  });

  it("capture-position returns position data", async () => {
    const res = await server.agent.post("/api/admin/cameras/cam1/presets/capture-position").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("pan");
    expect(res.body).toHaveProperty("zoom");
  });
});
