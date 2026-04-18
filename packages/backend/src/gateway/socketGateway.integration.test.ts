import { BUS_OBS_ERROR } from "./../eventBus/types.js";
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { createServer } from "http";
import { io as ioClient } from "socket.io-client";
import type { Socket as ClientSocket } from "socket.io-client";
import Database from "better-sqlite3";
import { applySchema } from "../database/schema.js";
import { AuthService } from "../services/authService.js";
import { ObsService } from "../services/obsService.js";
import { SessionManifestService } from "../services/sessionManifestService.js";
import { SocketGateway } from "./socketGateway.js";
import { SessionManifestModule } from "./modules/sessionManifest/sessionManifestModule.js";
import { eventBus } from "../eventBus/eventBus.js";
import type { ObsState } from "./modules/obs/types.js";
import { CTS_OBS_COMMAND, CTS_SESSION_MANIFEST_UPDATE, STC_OBS_ERROR, STC_OBS_STATE } from "@invisible-av-booth/shared";
import { ObsModule } from "./modules/obs/obsModule.js";

// ── Mock OBSWebSocket ─────────────────────────────────────────────────────────

type EventHandler = (...args: unknown[]) => void;

function makeMockObs() {
  const handlers: Record<string, EventHandler[]> = {};
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    call: vi.fn().mockImplementation((method: string) => {
      if (method === "GetStreamStatus") return Promise.resolve({ outputActive: false });
      if (method === "GetRecordStatus") return Promise.resolve({ outputActive: false });
      return Promise.resolve({});
    }),
    on: vi.fn().mockImplementation((event: string, handler: EventHandler) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event]!.push(handler);
    }),
    off: vi.fn(),
    emit(event: string, ...args: unknown[]) {
      handlers[event]?.forEach((h) => h(...args));
    },
  };
}

// ── Test setup ────────────────────────────────────────────────────────────────

const seedActor = { sub: "seed", username: "seed", role: "ADMIN" as const, iat: 0, exp: 9999999999 };
let token = "";
let port = 0;
let mockObs: ReturnType<typeof makeMockObs>;
let obsService: ObsService;
let manifestService: SessionManifestService;
let httpServer: ReturnType<typeof createServer>;

beforeAll(async () => {
  process.env["DEVICE_SECRET_KEY"] = "a".repeat(64);

  const database = new Database(":memory:");
  applySchema(database);
  database
    .prepare(
      "INSERT INTO device_connections (id, deviceType, label, host, port, encryptedPassword, metadata, features, enabled, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run("obs-1", "obs", "Main OBS", "localhost", 4455, null, "{}", "{}", 1, new Date().toISOString());

  const authService = new AuthService(database);
  await authService.createUser({ username: "admin", password: "pass", role: "ADMIN" }, seedActor);
  const loginResult = await authService.login("admin", "pass");
  token = loginResult.success ? loginResult.value.token : "";

  mockObs = makeMockObs();
  obsService = new ObsService(database, { initialDelayMs: 10, maxDelayMs: 100, maxAttempts: 2, backoffFactor: 1, jitterMs: 0 }, mockObs as never);
  manifestService = new SessionManifestService();

  httpServer = createServer();
  new SocketGateway(httpServer, authService, [new ObsModule(obsService), new SessionManifestModule(manifestService)]);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  port = (httpServer.address() as { port: number }).port;

  // Connect OBS
  await obsService.connect();
});

afterAll(() => {
  obsService.destroy();
  manifestService.destroy();
  httpServer.close();
});

afterEach(() => {
  vi.clearAllMocks();
  // Reset mock call implementations
  mockObs.call.mockImplementation((method: string) => {
    if (method === "GetStreamStatus") return Promise.resolve({ outputActive: false });
    if (method === "GetRecordStatus") return Promise.resolve({ outputActive: false });
    return Promise.resolve({});
  });
});

function connectClient(): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = ioClient(`http://localhost:${port}`, { auth: { token } });
    client.on("connect", () => resolve(client));
    client.on("connect_error", reject);
  });
}

// ── obs:command → OBS → obs:state broadcast ───────────────────────────────────

describe("OBS control integration", () => {
  it("startStream command triggers safe-start and broadcasts obs:state", async () => {
    const client = await connectClient();

    const stateUpdate = new Promise<ObsState>((resolve) => {
      client.on(STC_OBS_STATE, (state) => {
        if ((state as ObsState).commandedState?.streaming) resolve(state as ObsState);
      });
    });

    await new Promise<void>((resolve) => {
      client.emit(CTS_OBS_COMMAND, { type: "startStream" }, () => resolve());
    });

    const state = await stateUpdate;
    expect(state.commandedState.streaming).toBe(true);
    // Verify safe-start order: metadata update before StartStream
    const calls = mockObs.call.mock.calls.map((c) => c[0]);
    expect(calls.indexOf("SetStreamServiceSettings")).toBeLessThan(calls.indexOf("StartStream"));

    client.close();
  });

  it("stopStream command broadcasts updated state", async () => {
    const client = await connectClient();

    await new Promise<void>((resolve) => {
      client.emit(CTS_OBS_COMMAND, { type: "stopStream" }, () => resolve());
    });

    expect(mockObs.call).toHaveBeenCalledWith("StopStream");
    client.close();
  });

  it("startRecording command broadcasts updated state", async () => {
    const client = await connectClient();

    await new Promise<void>((resolve) => {
      client.emit(CTS_OBS_COMMAND, { type: "startRecording" }, () => resolve());
    });

    expect(mockObs.call).toHaveBeenCalledWith("StartRecord");
    client.close();
  });

  it("stopRecording command broadcasts updated state", async () => {
    const client = await connectClient();

    await new Promise<void>((resolve) => {
      client.emit(CTS_OBS_COMMAND, { type: "stopRecording" }, () => resolve());
    });

    expect(mockObs.call).toHaveBeenCalledWith("StopRecord");
    client.close();
  });

  it("OBS error is broadcast to all clients", async () => {
    const client = await connectClient();

    const errorReceived = new Promise<{ error: { code: string } }>((resolve) => {
      client.on(STC_OBS_ERROR, resolve);
    });

    eventBus.emit(BUS_OBS_ERROR, {
      error: Object.assign(new Error("test"), { code: "STREAM_START_FAILED" as const, name: "ObsError" }) as never,
    });

    const err = await errorReceived;
    expect(err.error.code).toBe("STREAM_START_FAILED");
    client.close();
  });

  it("session:manifest:update ack returns success", async () => {
    const client = await connectClient();

    const result = await new Promise<{ success: boolean }>((resolve) => {
      client.emit(CTS_SESSION_MANIFEST_UPDATE, { speaker: "John" }, resolve);
    });

    expect(result.success).toBe(true);
    expect(manifestService.get().speaker).toBe("John");
    client.close();
  });
});
