/**
 * Full end-to-end integration tests.
 *
 * These tests exercise the complete backend stack — HTTP routes, Socket.io,
 * OBS service, session manifest, and database — using the test harness
 * (in-memory DB + mock OBS). No real devices or file I/O required.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { io as ioClient } from "socket.io-client";
import type { Socket as ClientSocket } from "socket.io-client";
import { createTestHarness, type TestHarness } from "./testHarness.js";
import type { ObsState } from "../src/gateway/modules/obs/types.js";
import {
  CTS_OBS_COMMAND,
  CTS_OBS_RECONNECT,
  CTS_SESSION_MANIFEST_UPDATE,
  CTS_REQUEST_INITIAL_STATE,
  STC_OBS_STATE,
  STC_OBS_ERROR,
  STC_SESSION_MANIFEST_UPDATED,
} from "@invisible-av-booth/shared";

let h: TestHarness;
let token: string;

beforeAll(async () => {
  h = await createTestHarness();
  token = await h.getAdminToken();
});

afterAll(() => {
  h.teardown();
});

afterEach(() => {
  // Reset mock OBS to default behavior between tests.
  h.mockObs.call.mockImplementation((method: string) => {
    if (method === "GetStreamStatus") return Promise.resolve({ outputActive: false });
    if (method === "GetRecordStatus") return Promise.resolve({ outputActive: false });
    return Promise.resolve({});
  });
});

function connectSocket(): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = ioClient(`http://localhost:${h.port}`, { auth: { token } });
    client.on("connect", () => resolve(client));
    client.on("connect_error", reject);
  });
}

// ── Auth flow ─────────────────────────────────────────────────────────────────

describe("Auth → protected routes", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(h.app).get("/api/admin/users");
    expect(res.status).toBe(401);
  });

  it("rejects requests before password change", async () => {
    const seedActor = { sub: "seed", username: "seed", role: "ADMIN" as const, iat: 0, exp: 9999999999 };
    await h.authService.createUser({ username: "newuser", password: "pass", role: "AvVolunteer" }, seedActor);
    const loginRes = await request(h.app).post("/api/auth/login").send({ username: "newuser", password: "pass" });
    const tempToken = (loginRes.body as { token: string }).token;

    const res = await request(h.app).get("/api/admin/users").set("Authorization", `Bearer ${tempToken}`);
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty("error", "Password change required before accessing this resource");
  });

  it("allows access after password change", async () => {
    const res = await request(h.app).get("/api/admin/users").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── Device config → OBS connect → socket commands ─────────────────────────────

describe("Device config → OBS → Socket.io commands", () => {
  it("full lifecycle: add device, connect OBS, stream via socket, verify state", async () => {
    // 1. Add an OBS device connection via REST
    const deviceRes = await request(h.app)
      .post("/api/admin/devices")
      .set("Authorization", `Bearer ${token}`)
      .send({ deviceType: "obs", label: "Test OBS", host: "localhost", port: 4455 });
    expect(deviceRes.status).toBe(201);
    expect(deviceRes.body).toHaveProperty("id");

    // 2. Connect OBS service (uses mock)
    const connectResult = await h.obsService.connect();
    expect(connectResult.success).toBe(true);

    // 3. Connect a socket client
    const client = await connectSocket();

    // 4. Request initial state
    const initialState = new Promise<ObsState>((resolve) => {
      client.on(STC_OBS_STATE, (state: ObsState) => resolve(state));
    });
    client.emit(CTS_REQUEST_INITIAL_STATE);
    const state = await initialState;
    expect(state.connected).toBe(true);
    expect(state.streaming).toBe(false);

    // 5. Start stream — mock OBS reports outputActive: true after StartStream
    h.mockObs.call.mockImplementation((method: string) => {
      if (method === "GetStreamStatus") return Promise.resolve({ outputActive: true });
      if (method === "GetRecordStatus") return Promise.resolve({ outputActive: false });
      return Promise.resolve({});
    });

    const streamState = new Promise<ObsState>((resolve) => {
      client.on(STC_OBS_STATE, (s: ObsState) => {
        if (s.commandedState?.streaming) resolve(s);
      });
    });

    const ack = await new Promise<{ success: boolean }>((resolve) => {
      client.emit(CTS_OBS_COMMAND, { type: "startStream" }, resolve);
    });
    expect(ack.success).toBe(true);

    const afterStart = await streamState;
    expect(afterStart.streaming).toBe(true);
    expect(afterStart.commandedState.streaming).toBe(true);

    // 6. Stop stream
    h.mockObs.call.mockImplementation((method: string) => {
      if (method === "GetStreamStatus") return Promise.resolve({ outputActive: false });
      if (method === "GetRecordStatus") return Promise.resolve({ outputActive: false });
      return Promise.resolve({});
    });

    const stopAck = await new Promise<{ success: boolean }>((resolve) => {
      client.emit(CTS_OBS_COMMAND, { type: "stopStream" }, resolve);
    });
    expect(stopAck.success).toBe(true);

    client.close();
  });

  it("OBS command fails when not connected", async () => {
    // Disconnect OBS first
    await h.obsService.disconnect();

    const client = await connectSocket();

    const ack = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      client.emit(CTS_OBS_COMMAND, { type: "startStream" }, resolve);
    });
    expect(ack.success).toBe(false);
    expect(ack.error).toContain("not connected");

    client.close();
  });

  it("OBS reconnect command works", async () => {
    // Add device if not present
    const devices = await request(h.app).get("/api/admin/devices").set("Authorization", `Bearer ${token}`);
    if ((devices.body as unknown[]).length === 0) {
      await request(h.app)
        .post("/api/admin/devices")
        .set("Authorization", `Bearer ${token}`)
        .send({ deviceType: "obs", label: "Test OBS", host: "localhost", port: 4455 });
    }

    const client = await connectSocket();

    const ack = await new Promise<{ success: boolean }>((resolve) => {
      client.emit(CTS_OBS_RECONNECT, resolve);
    });
    expect(ack.success).toBe(true);

    client.close();
  });
});

// ── OBS error scenarios ───────────────────────────────────────────────────────

describe("OBS error scenarios", () => {
  it("stream start failure is reported to socket clients", async () => {
    // Ensure connected
    await h.obsService.reconnect();

    // Mock: StartStream succeeds but GetStreamStatus says not active
    h.mockObs.call.mockImplementation((method: string) => {
      if (method === "GetStreamStatus") return Promise.resolve({ outputActive: false });
      if (method === "GetRecordStatus") return Promise.resolve({ outputActive: false });
      return Promise.resolve({});
    });

    const client = await connectSocket();

    const errorReceived = new Promise<{ error: { code: string } }>((resolve) => {
      client.on(STC_OBS_ERROR, resolve);
    });

    const ack = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      client.emit(CTS_OBS_COMMAND, { type: "startStream" }, resolve);
    });
    expect(ack.success).toBe(false);

    const err = await errorReceived;
    expect(err.error.code).toBe("STREAM_START_FAILED");

    client.close();
  });

  it("recording start failure is reported to socket clients", async () => {
    await h.obsService.reconnect();

    h.mockObs.call.mockImplementation((method: string) => {
      if (method === "GetStreamStatus") return Promise.resolve({ outputActive: false });
      if (method === "GetRecordStatus") return Promise.resolve({ outputActive: false });
      return Promise.resolve({});
    });

    const client = await connectSocket();

    const errorReceived = new Promise<{ error: { code: string } }>((resolve) => {
      client.on(STC_OBS_ERROR, resolve);
    });

    const ack = await new Promise<{ success: boolean }>((resolve) => {
      client.emit(CTS_OBS_COMMAND, { type: "startRecording" }, resolve);
    });
    expect(ack.success).toBe(false);

    const err = await errorReceived;
    expect(err.error.code).toBe("RECORDING_START_FAILED");

    client.close();
  });

  it("OBS disconnect event broadcasts error to clients", async () => {
    await h.obsService.reconnect();

    const client = await connectSocket();

    const errorReceived = new Promise<{ error: { code: string } }>((resolve) => {
      client.on(STC_OBS_ERROR, resolve);
    });

    // Simulate OBS dropping the connection
    h.mockObs.__emit("ConnectionClosed");

    const err = await errorReceived;
    expect(err.error.code).toBe("OBS_UNREACHABLE");

    client.close();
  });
});

// ── Session manifest via socket ───────────────────────────────────────────────

describe("Session manifest via socket", () => {
  it("update manifest and receive broadcast", async () => {
    const client = await connectSocket();

    const broadcast = new Promise<{ manifest: Record<string, unknown>; interpolatedStreamTitle: string }>((resolve) => {
      client.on(STC_SESSION_MANIFEST_UPDATED, resolve);
    });

    const ack = await new Promise<{ success: boolean }>((resolve) => {
      client.emit(CTS_SESSION_MANIFEST_UPDATE, { speaker: "Pastor Dave", title: "Sunday Service" }, resolve);
    });
    expect(ack.success).toBe(true);

    const data = await broadcast;
    expect(data.manifest).toHaveProperty("speaker", "Pastor Dave");
    expect(data.manifest).toHaveProperty("title", "Sunday Service");
    expect(data.interpolatedStreamTitle).toContain("Pastor Dave");

    client.close();
  });

  it("manifest is available via REST after socket update", async () => {
    const res = await request(h.app).get("/api/session/manifest").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("speaker", "Pastor Dave");
  });

  it("initial state request returns current manifest", async () => {
    const client = await connectSocket();

    const manifestReceived = new Promise<{ manifest: Record<string, unknown> }>((resolve) => {
      client.on(STC_SESSION_MANIFEST_UPDATED, resolve);
    });

    client.emit(CTS_REQUEST_INITIAL_STATE);

    const data = await manifestReceived;
    expect(data.manifest).toHaveProperty("speaker", "Pastor Dave");

    client.close();
  });
});

// ── Dashboard CRUD → layout retrieval ─────────────────────────────────────────

describe("Dashboard CRUD → layout", () => {
  let dashboardId: string;

  it("create dashboard and add widget", async () => {
    const dashRes = await request(h.app)
      .post("/api/admin/dashboards")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Test Dashboard", allowedRoles: ["AvVolunteer", "AvPowerUser", "ADMIN"] });
    expect(dashRes.status).toBe(201);
    dashboardId = (dashRes.body as { id: string }).id;

    const widgetRes = await request(h.app)
      .post(`/api/admin/dashboards/${dashboardId}/widgets`)
      .set("Authorization", `Bearer ${token}`)
      .send({ widgetId: "obs", title: "OBS Control", col: 0, row: 0, colSpan: 4, rowSpan: 4 });
    expect(widgetRes.status).toBe(201);
  });

  it("user-facing layout endpoint returns the grid manifest", async () => {
    const res = await request(h.app).get(`/api/dashboards/${dashboardId}/layout`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("version", 1);
    expect((res.body as { cells: unknown[] }).cells).toHaveLength(1);
    expect((res.body as { cells: { widgetId: string }[] }).cells[0]!.widgetId).toBe("obs");
  });
});

// ── Multi-client broadcast ────────────────────────────────────────────────────

describe("Multi-client broadcast", () => {
  it("OBS state change broadcasts to all connected clients", async () => {
    // Ensure OBS is connected
    await h.obsService.reconnect();

    const client1 = await connectSocket();
    const client2 = await connectSocket();

    h.mockObs.call.mockImplementation((method: string) => {
      if (method === "GetStreamStatus") return Promise.resolve({ outputActive: true });
      if (method === "GetRecordStatus") return Promise.resolve({ outputActive: false });
      return Promise.resolve({});
    });

    const state1 = new Promise<ObsState>((resolve) => {
      client1.on(STC_OBS_STATE, (s: ObsState) => {
        if (s.commandedState?.streaming) resolve(s);
      });
    });
    const state2 = new Promise<ObsState>((resolve) => {
      client2.on(STC_OBS_STATE, (s: ObsState) => {
        if (s.commandedState?.streaming) resolve(s);
      });
    });

    // Client 1 sends the command
    await new Promise<void>((resolve) => {
      client1.emit(CTS_OBS_COMMAND, { type: "startStream" }, () => resolve());
    });

    // Both clients receive the broadcast
    const [s1, s2] = await Promise.all([state1, state2]);
    expect(s1.streaming).toBe(true);
    expect(s2.streaming).toBe(true);

    client1.close();
    client2.close();
  });
});

// ── Socket auth rejection ─────────────────────────────────────────────────────

describe("Socket auth", () => {
  it("rejects socket connection without token", async () => {
    const client = ioClient(`http://localhost:${h.port}`, { auth: {} });
    const error = await new Promise<Error>((resolve) => {
      client.on("connect_error", resolve);
    });
    expect(error.message).toContain("Unauthorized");
    client.close();
  });

  it("rejects socket connection with invalid token", async () => {
    const client = ioClient(`http://localhost:${h.port}`, { auth: { token: "garbage" } });
    const error = await new Promise<Error>((resolve) => {
      client.on("connect_error", resolve);
    });
    expect(error.message).toContain("Unauthorized");
    client.close();
  });
});
