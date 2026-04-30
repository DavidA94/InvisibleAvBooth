/**
 * Edge-case integration tests: expired JWTs, role-based 403 sweep,
 * password-change enforcement, socket cookie auth, OBS failure paths,
 * device password update.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import jwt from "jsonwebtoken";
import { io as ioClient } from "socket.io-client";
import type { Socket as ClientSocket } from "socket.io-client";
import { buildTestServer, resetServer, destroyServer, loginAsAdmin, loginAs, loginRaw } from "../harness.js";
import type { TestServer } from "../harness.js";
import { CTS_OBS_COMMAND, CTS_OBS_RECONNECT } from "@invisible-av-booth/shared";
import { decrypt } from "../../../src/crypto.js";

const JWT_SECRET = "dev-secret-change-in-production";

let s: TestServer;
const clients: ClientSocket[] = [];

beforeAll(async () => { s = await buildTestServer(); });
afterAll(() => destroyServer(s));
beforeEach(() => resetServer(s));
afterEach(() => { while (clients.length) clients.pop()!.close(); });

function expiredToken(): string {
  return jwt.sign({ sub: "x", username: "x", role: "ADMIN" }, JWT_SECRET, { expiresIn: "-1s" });
}

// ── Expired JWT on HTTP routes ────────────────────────────────────────────────

describe("Expired JWT on HTTP routes", () => {
  it("returns 401 for expired token on protected route", async () => {
    const tok = expiredToken();
    const res = await s.agent.get("/api/admin/users").set("Cookie", `token=${tok}`);
    expect(res.status).toBe(401);
  });
});

// ── Expired JWT on socket ─────────────────────────────────────────────────────

describe("Expired JWT on socket", () => {
  it("rejects socket connection with expired token", async () => {
    const tok = expiredToken();
    const client = ioClient(`http://localhost:${s.port}`, { auth: { token: tok } });
    clients.push(client);
    const error = await new Promise<Error>((resolve) => {
      client.on("connect_error", resolve);
    });
    expect(error.message).toContain("Unauthorized");
  });
});

// ── Socket cookie-based auth ──────────────────────────────────────────────────

describe("Socket cookie-based auth", () => {
  it("accepts connection via cookie header instead of auth.token", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const match = cookie.match(/token=([^;]+)/);
    const tok = match?.[1] ?? "";

    const client = ioClient(`http://localhost:${s.port}`, {
      auth: {},
      extraHeaders: { cookie: `token=${tok}` },
    });
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      client.on("connect", () => resolve());
      client.on("connect_error", reject);
    });
    expect(client.connected).toBe(true);
  });

  it("rejects connection with expired cookie", async () => {
    const tok = expiredToken();
    const client = ioClient(`http://localhost:${s.port}`, {
      auth: {},
      extraHeaders: { cookie: `token=${tok}` },
    });
    clients.push(client);
    const error = await new Promise<Error>((resolve) => {
      client.on("connect_error", resolve);
    });
    expect(error.message).toContain("Unauthorized");
  });
});

// ── Role-based 403 sweep ──────────────────────────────────────────────────────

describe("Role-based 403 sweep — AvVolunteer on admin endpoints", () => {
  const adminEndpoints: Array<{ method: "get" | "post" | "put" | "delete"; path: string; body?: object }> = [
    { method: "get", path: "/api/admin/users" },
    { method: "post", path: "/api/admin/users", body: { username: "x", password: "x", role: "AvVolunteer" } },
    { method: "put", path: "/api/admin/users/any-id", body: { username: "x" } },
    { method: "delete", path: "/api/admin/users/any-id" },
    { method: "get", path: "/api/admin/devices" },
    { method: "post", path: "/api/admin/devices", body: { deviceType: "obs", label: "x", host: "x", port: 1 } },
    { method: "put", path: "/api/admin/devices/any-id", body: { label: "x" } },
    { method: "delete", path: "/api/admin/devices/any-id" },
    { method: "get", path: "/api/admin/dashboards" },
    { method: "post", path: "/api/admin/dashboards", body: { name: "x" } },
    { method: "put", path: "/api/admin/dashboards/any-id", body: { name: "x" } },
    { method: "delete", path: "/api/admin/dashboards/any-id" },
    { method: "get", path: "/api/admin/templates" },
    { method: "post", path: "/api/admin/templates", body: { name: "x", category: "title", formatString: "{Date}", roleMinimum: "AvVolunteer" } },
    { method: "put", path: "/api/admin/templates/any-id", body: { name: "x" } },
    { method: "delete", path: "/api/admin/templates/any-id" },
    { method: "get", path: "/api/admin/platforms" },
    { method: "put", path: "/api/admin/platforms/youtube", body: { enabled: true, label: "x", accessToken: "x" } },
    { method: "delete", path: "/api/admin/platforms/youtube" },
  ];

  // Use a single login for all tests in this describe block
  let volCookie: string;
  beforeAll(async () => {
    resetServer(s);
    volCookie = await loginAs(s.agent, s.ctx.authService, "vol", "pass", "AvVolunteer");
  });

  for (const { method, path, body } of adminEndpoints) {
    it(`${method.toUpperCase()} ${path} → 403`, async () => {
      const req = s.agent[method](path).set("Cookie", volCookie);
      const res = body ? await req.send(body) : await req;
      expect(res.status).toBe(403);
    });
  }
});

// ── Password-change enforcement on multiple routes ────────────────────────────

describe("Password-change enforcement on multiple routes", () => {
  const protectedRoutes: Array<{ method: "get" | "post"; path: string; body?: unknown }> = [
    { method: "get", path: "/api/admin/users" },
    { method: "get", path: "/api/admin/devices" },
    { method: "get", path: "/api/admin/dashboards" },
    { method: "get", path: "/api/dashboards" },
    { method: "get", path: "/api/admin/templates" },
    { method: "get", path: "/api/templates" },
    { method: "get", path: "/api/admin/platforms" },
    { method: "get", path: "/api/platforms/health" },
    { method: "post", path: "/api/logs", body: [{ level: "info", message: "x" }] },
  ];

  for (const { method, path, body } of protectedRoutes) {
    it(`${method.toUpperCase()} ${path} → 403 when password not changed`, async () => {
      const cookie = await loginRaw(s.agent, s.ctx.authService, `user-${path.replace(/\//g, "-")}`, "pass", "ADMIN");
      const req = s.agent[method](path).set("Cookie", cookie);
      const res = body ? await req.send(body) : await req;
      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Password change required");
      resetServer(s); // clean up for next iteration
    });
  }
});

// ── OBS failure paths ─────────────────────────────────────────────────────────

describe("OBS failure paths via socket", () => {
  it("recording command returns error when OBS is disconnected", async () => {
    // Build a server without connecting OBS (no device row)
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const match = cookie.match(/token=([^;]+)/);
    const tok = match?.[1] ?? "";

    const client = ioClient(`http://localhost:${s.port}`, { auth: { token: tok } });
    clients.push(client);
    await new Promise<void>((r) => client.on("connect", r));

    // OBS is connected from beforeAll in other tests, but obsService state
    // depends on the fake. Force disconnect state:
    s.fakeObs.call.mockImplementation((method: string) => {
      if (method === "StartRecord") return Promise.reject(new Error("not connected"));
      if (method === "GetRecordStatus") return Promise.resolve({ outputActive: false });
      return Promise.resolve({});
    });

    // Disconnect OBS by simulating ConnectionClosed
    s.fakeObs.emit("ConnectionClosed");

    // Wait for state to propagate
    await new Promise((r) => setTimeout(r, 50));

    const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      client.emit(CTS_OBS_COMMAND, { type: "startRecording" }, resolve);
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("reconnect command works after OBS disconnects", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const match = cookie.match(/token=([^;]+)/);
    const tok = match?.[1] ?? "";

    // Insert OBS device so reconnect can find config
    s.ctx.database.prepare(
      "INSERT INTO device_connections (id, deviceType, label, host, port, encryptedPassword, metadata, features, enabled, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run("obs-r", "obs", "OBS", "localhost", 4455, null, "{}", "{}", 1, new Date().toISOString());

    // Reset fake OBS to succeed on connect
    s.fakeObs.connect.mockResolvedValue(undefined);
    s.fakeObs.call.mockImplementation((method: string) => {
      if (method === "GetStreamStatus") return Promise.resolve({ outputActive: false });
      if (method === "GetRecordStatus") return Promise.resolve({ outputActive: false });
      return Promise.resolve({});
    });

    const client = ioClient(`http://localhost:${s.port}`, { auth: { token: tok } });
    clients.push(client);
    await new Promise<void>((r) => client.on("connect", r));

    const result = await new Promise<{ success: boolean }>((resolve) => {
      client.emit(CTS_OBS_RECONNECT, resolve);
    });
    expect(result.success).toBe(true);
    expect(s.fakeObs.connect).toHaveBeenCalled();
  });
});

// ── Device password update ────────────────────────────────────────────────────

describe("Device password update", () => {
  it("updates password when PUT includes a new password", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const created = await s.agent.post("/api/admin/devices").set("Cookie", cookie).send({
      deviceType: "obs", label: "OBS", host: "localhost", port: 4455, password: "old-secret",
    });
    const id = created.body.id as string;

    await s.agent.put(`/api/admin/devices/${id}`).set("Cookie", cookie).send({ password: "new-secret" });

    const row = s.ctx.database.prepare("SELECT encryptedPassword FROM device_connections WHERE id = ?").get(id) as { encryptedPassword: string };
    expect(decrypt(row.encryptedPassword)).toBe("new-secret");
  });
});
