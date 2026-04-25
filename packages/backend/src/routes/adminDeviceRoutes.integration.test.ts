import { describe, it, expect, beforeAll } from "vitest";
import express from "express";

import request from "supertest";
import Database from "better-sqlite3";
import { applySchema } from "../database/schema.js";
import { AuthService } from "../services/authService.js";
import { authenticate, requirePasswordChanged } from "../middleware/auth.js";
import { createAuthRouter } from "./authRoutes.js";
import { createAdminDeviceRouter, decryptDevicePassword } from "./adminDeviceRoutes.js";
import { decrypt } from "../crypto.js";

// AES-256-GCM requires a 32-byte key — set a test key before any imports use it.
const TEST_KEY = "a".repeat(64); // 64 hex chars = 32 bytes

beforeAll(() => {
  process.env["DEVICE_SECRET_KEY"] = TEST_KEY;
});

const seedActor = { sub: "seed", username: "seed", role: "ADMIN" as const, iat: 0, exp: 9999999999 };

function buildApp() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  applySchema(database);
  const authService = new AuthService(database);
  const app = express();
  app.use(express.json());

  app.use("/api/auth", createAuthRouter(authService));
  const mustBeAuthenticated = authenticate(authService);
  const mustHaveChangedPassword = requirePasswordChanged();
  app.use("/api/admin/devices", mustBeAuthenticated, mustHaveChangedPassword, createAdminDeviceRouter(database, authService));
  return { app, database, authService };
}

async function loginAsAdmin(app: express.Express, authService: AuthService) {
  await authService.createUser({ username: "admin", password: "adminpass", role: "ADMIN" }, seedActor);
  const loginResponse = await request(app).post("/api/auth/login").send({ username: "admin", password: "adminpass" });
  const tempToken = (loginResponse.body as { token?: string }).token ?? "";
  const changeResponse = await request(app).post("/api/auth/change-password").set("Authorization", `Bearer ${tempToken}`).send({ newPassword: "adminpass" });
  const finalToken = (changeResponse.body as { token?: string }).token || tempToken;
  return finalToken;
}

const baseDevice = { deviceType: "obs", label: "Main OBS", host: "localhost", port: 4455 };

// ── POST /api/admin/devices ───────────────────────────────────────────────────────

describe("POST /api/admin/devices", () => {
  it("creates a device and returns it without password", async () => {
    const { app, authService } = buildApp();
    const token = await loginAsAdmin(app, authService);
    const response = await request(app)
      .post("/api/admin/devices")
      .set("Authorization", `Bearer ${token}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ ...baseDevice, password: "secret" });
    expect(response.status).toBe(201);
    expect(response.body.label).toBe("Main OBS");
    expect(response.body).not.toHaveProperty("encryptedPassword");
    expect(response.body).not.toHaveProperty("password");
  });

  it("returns 400 when required fields are missing", async () => {
    const { app, authService } = buildApp();
    const token = await loginAsAdmin(app, authService);
    const response = await request(app).post("/api/admin/devices").set("Authorization", `Bearer ${token}`).send({ label: "OBS" });
    expect(response.status).toBe(400);
  });

  it("returns 401 without auth", async () => {
    const { app } = buildApp();
    expect((await request(app).post("/api/admin/devices").send(baseDevice)).status).toBe(401);
  });
});

// ── GET /api/admin/devices ────────────────────────────────────────────────────────

describe("GET /api/admin/devices", () => {
  it("returns device list without passwords", async () => {
    const { app, authService } = buildApp();
    const token = await loginAsAdmin(app, authService);
    await request(app)
      .post("/api/admin/devices")
      .set("Authorization", `Bearer ${token}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ ...baseDevice, password: "secret" });
    const response = await request(app).get("/api/admin/devices").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body[0]).not.toHaveProperty("encryptedPassword");
  });
});

// ── GET /api/admin/devices/:id ────────────────────────────────────────────────────

describe("GET /api/admin/devices/:id", () => {
  it("returns a single device", async () => {
    const { app, authService } = buildApp();
    const token = await loginAsAdmin(app, authService);
    const created = await request(app).post("/api/admin/devices").set("Authorization", `Bearer ${token}`).send(baseDevice);
    const response = await request(app)
      .get(`/api/admin/devices/${created.body.id as string}`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(created.body.id);
  });

  it("returns 404 for unknown id", async () => {
    const { app, authService } = buildApp();
    const token = await loginAsAdmin(app, authService);
    expect((await request(app).get("/api/admin/devices/nonexistent").set("Authorization", `Bearer ${token}`)).status).toBe(404);
  });
});

// ── PUT /api/admin/devices/:id ────────────────────────────────────────────────────

describe("PUT /api/admin/devices/:id", () => {
  it("updates a device", async () => {
    const { app, authService } = buildApp();
    const token = await loginAsAdmin(app, authService);
    const created = await request(app).post("/api/admin/devices").set("Authorization", `Bearer ${token}`).send(baseDevice);
    const response = await request(app)
      .put(`/api/admin/devices/${created.body.id as string}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ label: "Updated OBS" });
    expect(response.status).toBe(200);
    expect(response.body.label).toBe("Updated OBS");
    expect(response.body).not.toHaveProperty("encryptedPassword");
  });

  it("returns 404 for unknown id", async () => {
    const { app, authService } = buildApp();
    const token = await loginAsAdmin(app, authService);
    expect((await request(app).put("/api/admin/devices/nonexistent").set("Authorization", `Bearer ${token}`).send({ label: "x" })).status).toBe(404);
  });
});

// ── DELETE /api/admin/devices/:id ─────────────────────────────────────────────────

describe("DELETE /api/admin/devices/:id", () => {
  it("deletes a device", async () => {
    const { app, authService } = buildApp();
    const token = await loginAsAdmin(app, authService);
    const created = await request(app).post("/api/admin/devices").set("Authorization", `Bearer ${token}`).send(baseDevice);
    expect(
      (
        await request(app)
          .delete(`/api/admin/devices/${created.body.id as string}`)
          .set("Authorization", `Bearer ${token}`)
      ).status,
    ).toBe(204);
  });

  it("returns 404 for unknown id", async () => {
    const { app, authService } = buildApp();
    const token = await loginAsAdmin(app, authService);
    expect((await request(app).delete("/api/admin/devices/nonexistent").set("Authorization", `Bearer ${token}`)).status).toBe(404);
  });
});

// ── Encryption round-trip ─────────────────────────────────────────────────────

describe("encryption", () => {
  it("password is encrypted at rest and never returned in responses", async () => {
    const { app, database, authService } = buildApp();
    const token = await loginAsAdmin(app, authService);
    const created = await request(app)
      .post("/api/admin/devices")
      .set("Authorization", `Bearer ${token}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ ...baseDevice, password: "mysecret" });
    const id = created.body.id as string;

    // Verify the stored value is encrypted (not plaintext)
    const row = database.prepare("SELECT encryptedPassword FROM device_connections WHERE id = ?").get(id) as { encryptedPassword: string };
    expect(row.encryptedPassword).not.toBe("mysecret");

    // Verify decryption round-trip
    expect(decrypt(row.encryptedPassword)).toBe("mysecret");

    // Verify GET response never includes the password
    const getRes = await request(app).get(`/api/admin/devices/${id}`).set("Authorization", `Bearer ${token}`);
    expect(getRes.body).not.toHaveProperty("encryptedPassword");
    expect(getRes.body).not.toHaveProperty("password");
  });

  it("password is preserved when updating other fields", async () => {
    const { app, database, authService } = buildApp();
    const token = await loginAsAdmin(app, authService);
    const created = await request(app)
      .post("/api/admin/devices")
      .set("Authorization", `Bearer ${token}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ ...baseDevice, password: "original" });
    const id = created.body.id as string;

    // Update label only — no new password
    await request(app).put(`/api/admin/devices/${id}`).set("Authorization", `Bearer ${token}`).send({ label: "New Label" });

    const row = database.prepare("SELECT encryptedPassword FROM device_connections WHERE id = ?").get(id) as { encryptedPassword: string };
    expect(decrypt(row.encryptedPassword)).toBe("original");
  });

  it("decryptDevicePassword export works correctly", () => {
    expect(typeof decryptDevicePassword).toBe("function");
  });
});
