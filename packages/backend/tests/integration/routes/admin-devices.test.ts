import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildTestServer, resetServer, destroyServer, loginAsAdmin } from "../harness.js";
import type { TestServer } from "../harness.js";
import { decrypt } from "../../../src/crypto.js";

let s: TestServer;

beforeAll(async () => { s = await buildTestServer(); });
afterAll(() => destroyServer(s));
beforeEach(() => resetServer(s));

const baseDevice = { deviceType: "obs", label: "Main OBS", host: "localhost", port: 4455 };

describe("POST /api/admin/devices", () => {
  it("creates a device and returns it without password", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.post("/api/admin/devices").set("Cookie", cookie).send({ ...baseDevice, password: "secret" });
    expect(res.status).toBe(201);
    expect(res.body.label).toBe("Main OBS");
    expect(res.body).not.toHaveProperty("encryptedPassword");
    expect(res.body).not.toHaveProperty("password");
  });

  it("returns 400 when required fields are missing", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.post("/api/admin/devices").set("Cookie", cookie).send({ label: "OBS" });
    expect(res.status).toBe(400);
  });

  it("returns 401 without auth", async () => {
    expect((await s.agent.post("/api/admin/devices").send(baseDevice)).status).toBe(401);
  });
});

describe("GET /api/admin/devices", () => {
  it("returns device list without passwords", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    await s.agent.post("/api/admin/devices").set("Cookie", cookie).send({ ...baseDevice, password: "secret" });
    const res = await s.agent.get("/api/admin/devices").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).not.toHaveProperty("encryptedPassword");
  });
});

describe("GET /api/admin/devices/:id", () => {
  it("returns a single device", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const created = await s.agent.post("/api/admin/devices").set("Cookie", cookie).send(baseDevice);
    const res = await s.agent.get(`/api/admin/devices/${created.body.id as string}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it("returns 404 for unknown id", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    expect((await s.agent.get("/api/admin/devices/nonexistent").set("Cookie", cookie)).status).toBe(404);
  });
});

describe("PUT /api/admin/devices/:id", () => {
  it("updates a device", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const created = await s.agent.post("/api/admin/devices").set("Cookie", cookie).send(baseDevice);
    const res = await s.agent.put(`/api/admin/devices/${created.body.id as string}`).set("Cookie", cookie).send({ label: "Updated OBS" });
    expect(res.status).toBe(200);
    expect(res.body.label).toBe("Updated OBS");
    expect(res.body).not.toHaveProperty("encryptedPassword");
  });

  it("returns 404 for unknown id", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    expect((await s.agent.put("/api/admin/devices/nonexistent").set("Cookie", cookie).send({ label: "x" })).status).toBe(404);
  });
});

describe("DELETE /api/admin/devices/:id", () => {
  it("deletes a device", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const created = await s.agent.post("/api/admin/devices").set("Cookie", cookie).send(baseDevice);
    expect((await s.agent.delete(`/api/admin/devices/${created.body.id as string}`).set("Cookie", cookie)).status).toBe(204);
  });

  it("returns 404 for unknown id", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    expect((await s.agent.delete("/api/admin/devices/nonexistent").set("Cookie", cookie)).status).toBe(404);
  });
});

describe("encryption round-trip", () => {
  it("password is encrypted at rest and never returned in responses", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const created = await s.agent.post("/api/admin/devices").set("Cookie", cookie).send({ ...baseDevice, password: "mysecret" });
    const id = created.body.id as string;

    const row = s.ctx.database.prepare("SELECT encryptedPassword FROM device_connections WHERE id = ?").get(id) as { encryptedPassword: string };
    expect(row.encryptedPassword).not.toBe("mysecret");
    expect(decrypt(row.encryptedPassword)).toBe("mysecret");

    const getRes = await s.agent.get(`/api/admin/devices/${id}`).set("Cookie", cookie);
    expect(getRes.body).not.toHaveProperty("encryptedPassword");
    expect(getRes.body).not.toHaveProperty("password");
  });

  it("password is preserved when updating other fields", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const created = await s.agent.post("/api/admin/devices").set("Cookie", cookie).send({ ...baseDevice, password: "original" });
    const id = created.body.id as string;

    await s.agent.put(`/api/admin/devices/${id}`).set("Cookie", cookie).send({ label: "New Label" });

    const row = s.ctx.database.prepare("SELECT encryptedPassword FROM device_connections WHERE id = ?").get(id) as { encryptedPassword: string };
    expect(decrypt(row.encryptedPassword)).toBe("original");
  });
});
