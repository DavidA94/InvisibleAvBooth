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
    await server.agent.put("/api/admin/cameras/cam1/presets/order").set("Cookie", adminCookie).send({ presetIds: reversed });

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

  it("POST returns 400 when name is missing", async () => {
    const res = await server.agent.post("/api/admin/cameras/cam1/presets").set("Cookie", adminCookie).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("name is required");
  });

  it("PUT returns 404 for nonexistent preset", async () => {
    const res = await server.agent.put("/api/admin/cameras/cam1/presets/nonexistent").set("Cookie", adminCookie).send({ name: "Updated" });
    expect(res.status).toBe(404);
  });

  it("PUT updates preset fields", async () => {
    const created = await server.agent.post("/api/admin/cameras/cam1/presets").set("Cookie", adminCookie).send({ name: "Original" });
    const presetId = created.body.id;

    const res = await server.agent.put(`/api/admin/cameras/cam1/presets/${presetId}`).set("Cookie", adminCookie).send({
      name: "Renamed",
      storedOnCamera: true,
      cameraPresetSlot: 2,
      pan: 100,
      tilt: 200,
      zoom: 300,
      focus: 400,
      autoFocus: false,
      aiTracking: true,
      aiTilt: true,
      aiZoom: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Renamed");
    expect(res.body.storedOnCamera).toBe(true);
    expect(res.body.cameraPresetSlot).toBe(2);
  });

  it("DELETE returns 404 for nonexistent preset", async () => {
    const res = await server.agent.delete("/api/admin/cameras/cam1/presets/nonexistent").set("Cookie", adminCookie);
    expect(res.status).toBe(404);
  });

  it("PUT /order returns 400 when presetIds is not an array", async () => {
    const res = await server.agent.put("/api/admin/cameras/cam1/presets/order").set("Cookie", adminCookie).send({ presetIds: "not-an-array" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("presetIds array is required");
  });
});
