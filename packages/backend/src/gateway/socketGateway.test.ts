import { describe, it, expect, vi, afterEach } from "vitest";
import { createServer } from "http";
import { io as ioClient } from "socket.io-client";
import type { Socket as ClientSocket } from "socket.io-client";
import Database from "better-sqlite3";
import { applySchema } from "../db/schema.js";
import { AuthService } from "../services/authService.js";
import { SocketGateway } from "./socketGateway.js";
import { eventBus } from "../eventBus.js";
import type { ObsState } from "../eventBus.js";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const idleState: ObsState = {
  connected: false,
  streaming: false,
  recording: false,
  commandedState: { streaming: false, recording: false },
};

function makeMockObsService() {
  return {
    getState: vi.fn().mockReturnValue(idleState),
    startStream: vi.fn().mockResolvedValue({ success: true, value: idleState }),
    stopStream: vi.fn().mockResolvedValue({ success: true, value: idleState }),
    startRecording: vi.fn().mockResolvedValue({ success: true, value: idleState }),
    stopRecording: vi.fn().mockResolvedValue({ success: true, value: idleState }),
    reconnect: vi.fn().mockResolvedValue({ success: true, value: undefined }),
  };
}

function makeMockManifestService() {
  return {
    get: vi.fn().mockReturnValue({}),
    update: vi.fn().mockReturnValue({ success: true, value: {} }),
    interpolate: vi.fn().mockReturnValue("Test Title"),
  };
}

// ── Test helpers ──────────────────────────────────────────────────────────────

const seedActor = { sub: "seed", username: "seed", role: "ADMIN" as const, iat: 0, exp: 9999999999 };

async function buildGateway() {
  const database = new Database(":memory:");
  applySchema(database);
  const authService = new AuthService(database);
  await authService.createUser({ username: "admin", password: "pass", role: "ADMIN" }, seedActor);

  const loginResult = await authService.login("admin", "pass");
  const token = loginResult.success ? loginResult.value.token : "";

  const httpServer = createServer();
  const obsService = makeMockObsService();
  const manifestService = makeMockManifestService();

  const gateway = new SocketGateway(httpServer, authService, obsService as never, manifestService as never);

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as { port: number }).port;

  return { gateway, httpServer, obsService, manifestService, token, port };
}

function connectClient(port: number, token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = ioClient(`http://localhost:${port}`, { auth: { token } });
    client.on("connect", () => resolve(client));
    client.on("connect_error", reject);
  });
}

const cleanups: Array<() => void> = [];

afterEach(async () => {
  cleanups.forEach((fn) => fn());
  cleanups.length = 0;
  vi.restoreAllMocks();
});

// ── JWT validation ────────────────────────────────────────────────────────────

describe("SocketGateway — JWT validation", () => {
  it("rejects connection without token", async () => {
    const { httpServer, port } = await buildGateway();
    cleanups.push(() => httpServer.close());

    await new Promise<void>((resolve) => {
      const client = ioClient(`http://localhost:${port}`);
      client.on("connect_error", () => {
        client.close();
        resolve();
      });
    });
  });

  it("rejects connection with invalid token", async () => {
    const { httpServer, port } = await buildGateway();
    cleanups.push(() => httpServer.close());

    await new Promise<void>((resolve) => {
      const client = ioClient(`http://localhost:${port}`, { auth: { token: "bad.token" } });
      client.on("connect_error", () => {
        client.close();
        resolve();
      });
    });
  });

  it("accepts connection with valid token", async () => {
    const { httpServer, token, port } = await buildGateway();
    cleanups.push(() => httpServer.close());

    const client = await connectClient(port, token);
    cleanups.push(() => client.close());
    expect(client.connected).toBe(true);
  });
});

// ── EventBus → client broadcast ───────────────────────────────────────────────

describe("SocketGateway — EventBus forwarding", () => {
  it("broadcasts obs:state when obs:state:changed fires", async () => {
    const { httpServer, token, port } = await buildGateway();
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port, token);
    cleanups.push(() => client.close());

    const received = await new Promise<ObsState>((resolve) => {
      client.on("obs:state", resolve);
      eventBus.emit("obs:state:changed", { state: { ...idleState, connected: true } });
    });

    expect(received.connected).toBe(true);
  });

  it("broadcasts session:manifest:updated when EventBus fires", async () => {
    const { httpServer, token, port } = await buildGateway();
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port, token);
    cleanups.push(() => client.close());

    // Wait for the initial state emission to settle, then listen for the next one
    await new Promise<void>((r) => setTimeout(r, 50));

    const received = await new Promise<{ interpolatedStreamTitle: string }>((resolve) => {
      client.on("session:manifest:updated", (payload) => {
        if ((payload as { interpolatedStreamTitle: string }).interpolatedStreamTitle === "EventBus Title") {
          resolve(payload as { interpolatedStreamTitle: string });
        }
      });
      eventBus.emit("session:manifest:updated", { manifest: {}, interpolatedStreamTitle: "EventBus Title" });
    });

    expect(received.interpolatedStreamTitle).toBe("EventBus Title");
  });
});

// ── obs:command routing ───────────────────────────────────────────────────────

describe("SocketGateway — obs:command", () => {
  it("routes startStream to obsService.startStream", async () => {
    const { httpServer, token, port, obsService } = await buildGateway();
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port, token);
    cleanups.push(() => client.close());

    await new Promise<void>((resolve) => {
      client.emit("obs:command", { type: "startStream" }, () => resolve());
    });

    expect(obsService.startStream).toHaveBeenCalledOnce();
  });

  it("routes stopStream to obsService.stopStream", async () => {
    const { httpServer, token, port, obsService } = await buildGateway();
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port, token);
    cleanups.push(() => client.close());

    await new Promise<void>((resolve) => {
      client.emit("obs:command", { type: "stopStream" }, () => resolve());
    });

    expect(obsService.stopStream).toHaveBeenCalledOnce();
  });

  it("returns success: false on unknown command type", async () => {
    const { httpServer, token, port } = await buildGateway();
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port, token);
    cleanups.push(() => client.close());

    const result = await new Promise<{ success: boolean }>((resolve) => {
      client.emit("obs:command", { type: "unknown" }, resolve);
    });

    expect(result.success).toBe(false);
  });

  it("ack shape is { success: true } on success", async () => {
    const { httpServer, token, port } = await buildGateway();
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port, token);
    cleanups.push(() => client.close());

    const result = await new Promise<{ success: boolean }>((resolve) => {
      client.emit("obs:command", { type: "startStream" }, resolve);
    });

    expect(result).toEqual({ success: true });
  });
});

// ── obs:reconnect ─────────────────────────────────────────────────────────────

describe("SocketGateway — obs:reconnect", () => {
  it("calls obsService.reconnect and acks success", async () => {
    const { httpServer, token, port, obsService } = await buildGateway();
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port, token);
    cleanups.push(() => client.close());

    const result = await new Promise<{ success: boolean }>((resolve) => {
      client.emit("obs:reconnect", resolve);
    });

    expect(obsService.reconnect).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
  });
});
