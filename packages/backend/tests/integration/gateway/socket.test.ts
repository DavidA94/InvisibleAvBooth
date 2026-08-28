import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { io as ioClient } from "socket.io-client";
import type { Socket as ClientSocket } from "socket.io-client";
import { buildTestServer, resetServer, destroyServer, loginAsAdmin } from "../harness.js";
import type { TestServer } from "../harness.js";
import { eventBus } from "../../../src/eventBus/eventBus.js";
import { BUS_OBS_ERROR } from "../../../src/eventBus/types.js";
import {
  CTS_OBS_COMMAND,
  CTS_OBS_RECONNECT,
  CTS_SESSION_MANIFEST_UPDATE,
  CTS_REQUEST_INITIAL_STATE,
  STC_OBS_STATE,
  STC_OBS_ERROR,
  STC_SESSION_MANIFEST_UPDATED,
} from "@invisible-av-booth/shared";

let s: TestServer;
let token: string;
const clients: ClientSocket[] = [];

beforeAll(async () => {
  s = await buildTestServer();
  // Connect OBS so commands work — inserts an OBS device row first
  s.ctx.database
    .prepare(
      "INSERT INTO device_connections (id, deviceType, label, host, port, encryptedPassword, metadata, features, enabled, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run("obs-1", "obs", "Main OBS", "localhost", 4455, null, "{}", "{}", 1, new Date().toISOString());
  await s.ctx.obsService.connect();
});
afterAll(() => destroyServer(s));

beforeEach(async () => {
  // Reset DB but re-insert OBS device so obsService stays connected
  resetServer(s);
  s.ctx.database
    .prepare(
      "INSERT INTO device_connections (id, deviceType, label, host, port, encryptedPassword, metadata, features, enabled, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run("obs-1", "obs", "Main OBS", "localhost", 4455, null, "{}", "{}", 1, new Date().toISOString());
  token = "";
  const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
  const match = cookie.match(/token=([^;]+)/);
  token = match?.[1] ?? "";
});

afterEach(() => {
  while (clients.length) clients.pop()!.close();
});

function connectClient(): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = ioClient(`http://localhost:${s.port}`, { auth: { token } });
    clients.push(client);
    client.on("connect", () => resolve(client));
    client.on("connect_error", reject);
  });
}

// ── OBS commands ──────────────────────────────────────────────────────────────

describe("OBS control integration", () => {
  it("startStream command is rejected — managed by platform service", async () => {
    const client = await connectClient();
    const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      client.emit(CTS_OBS_COMMAND, { type: "startStream" }, resolve);
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("platform service");
  });

  it("stopStream command is rejected — managed by platform service", async () => {
    const client = await connectClient();
    const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      client.emit(CTS_OBS_COMMAND, { type: "stopStream" }, resolve);
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("platform service");
  });

  it("startRecording command calls OBS", async () => {
    const client = await connectClient();
    await new Promise<void>((resolve) => {
      client.emit(CTS_OBS_COMMAND, { type: "startRecording" }, () => resolve());
    });
    expect(s.fakeObs.call).toHaveBeenCalledWith("StartRecord");
  });

  it("stopRecording command calls OBS", async () => {
    const client = await connectClient();
    await new Promise<void>((resolve) => {
      client.emit(CTS_OBS_COMMAND, { type: "stopRecording" }, () => resolve());
    });
    expect(s.fakeObs.call).toHaveBeenCalledWith("StopRecord");
  });

  it("OBS error is broadcast to all clients", async () => {
    const client = await connectClient();
    const errorReceived = new Promise<{ error: { code: string } }>((resolve) => {
      client.on(STC_OBS_ERROR, resolve);
    });
    eventBus.emit(BUS_OBS_ERROR, {
      error: Object.assign(new Error("test"), { code: "STREAM_START_FAILED" as const, name: "ObsError" }) as never,
    });
    const obsError = await errorReceived;
    expect(obsError.error.code).toBe("STREAM_START_FAILED");
  });

  it("reconnect command triggers OBS reconnect", async () => {
    const client = await connectClient();
    const result = await new Promise<{ success: boolean }>((resolve) => {
      client.emit(CTS_OBS_RECONNECT, resolve);
    });
    expect(result.success).toBe(true);
  });
});

// ── Session manifest ──────────────────────────────────────────────────────────

describe("Session manifest integration", () => {
  it("session:manifest:update ack returns success", async () => {
    const client = await connectClient();
    const result = await new Promise<{ success: boolean }>((resolve) => {
      client.emit(CTS_SESSION_MANIFEST_UPDATE, { speaker: "John" }, resolve);
    });
    expect(result.success).toBe(true);
    expect(s.ctx.manifestService.get().speaker).toBe("John");
  });
});

// ── Initial state request ─────────────────────────────────────────────────────

describe("Initial state request", () => {
  it("emits OBS state on cts:request:initial:state", async () => {
    const client = await connectClient();
    const stateReceived = new Promise<unknown>((resolve) => {
      client.on(STC_OBS_STATE, resolve);
    });
    client.emit(CTS_REQUEST_INITIAL_STATE);
    const state = await stateReceived;
    expect(state).toHaveProperty("connected");
  });

  it("emits session manifest on cts:request:initial:state", async () => {
    const client = await connectClient();
    const manifestReceived = new Promise<unknown>((resolve) => {
      client.on(STC_SESSION_MANIFEST_UPDATED, resolve);
    });
    client.emit(CTS_REQUEST_INITIAL_STATE);
    const manifest = await manifestReceived;
    expect(manifest).toHaveProperty("manifest");
  });
});

// ── Auth enforcement ──────────────────────────────────────────────────────────

describe("Socket auth", () => {
  it("rejects connection without token", async () => {
    const client = ioClient(`http://localhost:${s.port}`, { auth: {} });
    clients.push(client);
    const error = await new Promise<Error>((resolve) => {
      client.on("connect_error", resolve);
    });
    expect(error.message).toContain("Unauthorized");
  });

  it("rejects connection with invalid token", async () => {
    const client = ioClient(`http://localhost:${s.port}`, { auth: { token: "invalid.jwt.token" } });
    clients.push(client);
    const error = await new Promise<Error>((resolve) => {
      client.on("connect_error", resolve);
    });
    expect(error.message).toContain("Unauthorized");
  });
});
