import { BUS_OBS_STATE_CHANGED, BUS_OBS_ERROR } from "./../eventBus/types.js";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import { applySchema } from "../database/schema.js";
import { ObsService, ObsError } from "./obsService.js";
import { eventBus } from "../eventBus/eventBus.js";

// ── Mock OBSWebSocket client ──────────────────────────────────────────────────
// We mock at the constructor boundary — ObsService accepts an optional obsClient
// parameter so tests can inject a mock without touching the real obs-websocket.

type EventHandler = (...args: unknown[]) => void;

function makeMockObs() {
  const handlers: Record<string, EventHandler[]> = {};
  const mock = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    call: vi.fn().mockImplementation((method: string) => {
      if (method === "GetStreamStatus") return Promise.resolve({ outputActive: true });
      if (method === "GetRecordStatus") return Promise.resolve({ outputActive: true });
      return Promise.resolve({});
    }),
    on: vi.fn().mockImplementation((event: string, handler: EventHandler) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event]!.push(handler);
    }),
    off: vi.fn(),
    // Helper to fire a registered event in tests
    emit(event: string, ...args: unknown[]) {
      handlers[event]?.forEach((h) => h(...args));
    },
  };
  return mock;
}

type MockObs = ReturnType<typeof makeMockObs>;

// ── Test DB setup ─────────────────────────────────────────────────────────────

function makeDatabase(withDevice = true) {
  const database = new Database(":memory:");
  applySchema(database);
  if (withDevice) {
    database
      .prepare(
        "INSERT INTO device_connections (id, deviceType, label, host, port, encryptedPassword, metadata, features, enabled, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run("obs-1", "obs", "Main OBS", "localhost", 4455, null, "{}", "{}", 1, new Date().toISOString());
  }
  return database;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const services: ObsService[] = [];
const cleanups: Array<() => void> = [];

function makeSvc(
  database: BetterSqlite3.Database,
  mockObs: MockObs,
  retry = { initialDelayMs: 10, maxDelayMs: 100, maxAttempts: 3, backoffFactor: 1, jitterMs: 0 },
) {
  const service = new ObsService(database, retry, mockObs as never);
  services.push(service);
  return service;
}

beforeEach(() => {
  process.env["DEVICE_SECRET_KEY"] = "a".repeat(64);
});

afterEach(() => {
  services.forEach((s) => s.destroy());
  services.length = 0;
  cleanups.forEach((fn) => fn());
  cleanups.length = 0;
  vi.restoreAllMocks();
});

// ── connect ───────────────────────────────────────────────────────────────────

describe("ObsService.connect", () => {
  it("returns success and sets connected state", async () => {
    const mockObs = makeMockObs();
    const service = makeSvc(makeDatabase(), mockObs);
    const result = await service.connect();
    expect(result.success).toBe(true);
    expect(service.getState().connected).toBe(true);
  });

  it("emits obs:state:changed on connect", async () => {
    const mockObs = makeMockObs();
    const service = makeSvc(makeDatabase(), mockObs);
    const handler = vi.fn();
    eventBus.subscribe(BUS_OBS_STATE_CHANGED, handler);
    cleanups.push(() => eventBus.unsubscribe(BUS_OBS_STATE_CHANGED, handler));
    await service.connect();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ state: expect.objectContaining({ connected: true }) }));
  });

  it("returns OBS_NOT_CONFIGURED when no enabled device exists", async () => {
    const mockObs = makeMockObs();
    const service = makeSvc(makeDatabase(false), mockObs);
    const result = await service.connect();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("OBS_NOT_CONFIGURED");
  });

  it("returns OBS_UNREACHABLE when connection fails", async () => {
    const mockObs = makeMockObs();
    mockObs.connect.mockRejectedValueOnce(new Error("refused"));
    const service = makeSvc(makeDatabase(), mockObs);
    const result = await service.connect();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("OBS_UNREACHABLE");
  });
});

// ── disconnect ────────────────────────────────────────────────────────────────

describe("ObsService.disconnect", () => {
  it("sets connected to false", async () => {
    const mockObs = makeMockObs();
    const service = makeSvc(makeDatabase(), mockObs);
    await service.connect();
    await service.disconnect();
    expect(service.getState().connected).toBe(false);
  });
});

// ── safe-start sequence ───────────────────────────────────────────────────────

describe("ObsService.startStream — safe-start", () => {
  it("calls SetStreamServiceSettings before StartStream", async () => {
    const mockObs = makeMockObs();
    const service = makeSvc(makeDatabase(), mockObs);
    await service.connect();
    await service.startStream();
    const calls = mockObs.call.mock.calls.map((c) => c[0]);
    const metaIdx = calls.indexOf("SetStreamServiceSettings");
    const startIdx = calls.indexOf("StartStream");
    expect(metaIdx).toBeGreaterThanOrEqual(0);
    expect(startIdx).toBeGreaterThan(metaIdx);
  });

  it("does not start stream if metadata update fails", async () => {
    const mockObs = makeMockObs();
    mockObs.call.mockImplementation((method: string) => {
      if (method === "GetStreamStatus") return Promise.resolve({ outputActive: false });
      if (method === "GetRecordStatus") return Promise.resolve({ outputActive: false });
      if (method === "SetStreamServiceSettings") return Promise.reject(new Error("meta failed"));
      return Promise.resolve({});
    });
    const service = makeSvc(makeDatabase(), mockObs);
    await service.connect();
    const result = await service.startStream();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("METADATA_UPDATE_FAILED");
    const calls = mockObs.call.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain("StartStream");
  });

  it("sets commandedState.streaming on success", async () => {
    const mockObs = makeMockObs();
    const service = makeSvc(makeDatabase(), mockObs);
    await service.connect();
    await service.startStream();
    expect(service.getState().commandedState.streaming).toBe(true);
  });

  it("returns OBS_UNREACHABLE when not connected", async () => {
    const mockObs = makeMockObs();
    const service = makeSvc(makeDatabase(), mockObs);
    const result = await service.startStream();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("OBS_UNREACHABLE");
  });

  it("returns STREAM_START_FAILED when OBS accepts command but does not transition", async () => {
    const mockObs = makeMockObs();
    mockObs.call.mockImplementation((method: string) => {
      if (method === "GetStreamStatus") return Promise.resolve({ outputActive: false });
      if (method === "GetRecordStatus") return Promise.resolve({ outputActive: true });
      return Promise.resolve({});
    });
    const service = makeSvc(makeDatabase(), mockObs);
    await service.connect();
    const result = await service.startStream();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("STREAM_START_FAILED");
      expect(result.error.message).toContain("check OBS");
    }
    expect(service.getState().commandedState.streaming).toBe(false);
  });

  it("returns RECORDING_START_FAILED when OBS accepts command but does not transition", async () => {
    const mockObs = makeMockObs();
    mockObs.call.mockImplementation((method: string) => {
      if (method === "GetRecordStatus") return Promise.resolve({ outputActive: false });
      if (method === "GetStreamStatus") return Promise.resolve({ outputActive: true });
      return Promise.resolve({});
    });
    const service = makeSvc(makeDatabase(), mockObs);
    await service.connect();
    const result = await service.startRecording();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("RECORDING_START_FAILED");
      expect(result.error.message).toContain("check OBS");
    }
    expect(service.getState().commandedState.recording).toBe(false);
  });
});

// ── stopStream / startRecording / stopRecording ───────────────────────────────

describe("ObsService command methods", () => {
  it("stopStream sets commandedState.streaming to false", async () => {
    const mockObs = makeMockObs();
    const service = makeSvc(makeDatabase(), mockObs);
    await service.connect();
    await service.startStream();
    await service.stopStream();
    expect(service.getState().commandedState.streaming).toBe(false);
  });

  it("startRecording sets commandedState.recording to true", async () => {
    const mockObs = makeMockObs();
    const service = makeSvc(makeDatabase(), mockObs);
    await service.connect();
    await service.startRecording();
    expect(service.getState().commandedState.recording).toBe(true);
  });

  it("stopRecording sets commandedState.recording to false", async () => {
    const mockObs = makeMockObs();
    const service = makeSvc(makeDatabase(), mockObs);
    await service.connect();
    await service.startRecording();
    await service.stopRecording();
    expect(service.getState().commandedState.recording).toBe(false);
  });

  it("emits STREAM_STOP_FAILED on stopStream failure", async () => {
    const mockObs = makeMockObs();
    mockObs.call.mockImplementation((method: string) => {
      if (method === "GetStreamStatus") return Promise.resolve({ outputActive: true });
      if (method === "GetRecordStatus") return Promise.resolve({ outputActive: false });
      if (method === "StopStream") return Promise.reject(new Error("failed"));
      return Promise.resolve({});
    });
    const service = makeSvc(makeDatabase(), mockObs);
    await service.connect();
    const handler = vi.fn();
    eventBus.subscribe(BUS_OBS_ERROR, handler);
    cleanups.push(() => eventBus.unsubscribe(BUS_OBS_ERROR, handler));
    await service.stopStream();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: "STREAM_STOP_FAILED" }) }));
  });
});

// ── disconnect event / reconnect ──────────────────────────────────────────────

describe("ObsService reconnect", () => {
  it("emits obs:error with OBS_UNREACHABLE on ConnectionClosed", async () => {
    const mockObs = makeMockObs();
    const service = makeSvc(makeDatabase(), mockObs);
    await service.connect();
    const handler = vi.fn();
    eventBus.subscribe(BUS_OBS_ERROR, handler);
    cleanups.push(() => eventBus.unsubscribe(BUS_OBS_ERROR, handler));
    mockObs.emit("ConnectionClosed");
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: "OBS_UNREACHABLE" }), retryExhausted: false }));
  });

  it("exhausts retries and emits retryExhausted: true", async () => {
    const mockObs = makeMockObs();
    mockObs.connect
      .mockResolvedValueOnce(undefined) // initial connect succeeds
      .mockRejectedValue(new Error("refused")); // all retries fail

    const service = makeSvc(makeDatabase(), mockObs, {
      initialDelayMs: 1,
      maxDelayMs: 10,
      maxAttempts: 2,
      backoffFactor: 1,
      jitterMs: 0,
    });
    await service.connect();

    const handler = vi.fn();
    eventBus.subscribe(BUS_OBS_ERROR, handler);
    cleanups.push(() => eventBus.unsubscribe(BUS_OBS_ERROR, handler));

    mockObs.emit("ConnectionClosed");

    // Wait for retries to exhaust
    await new Promise((r) => setTimeout(r, 100));

    const exhaustedCall = handler.mock.calls.find((c) => (c[0] as { retryExhausted?: boolean }).retryExhausted === true);
    expect(exhaustedCall).toBeDefined();
  });
});

// ── ObsError ──────────────────────────────────────────────────────────────────

describe("ObsError", () => {
  it("has correct code and name", () => {
    const err = new ObsError("OBS_UNREACHABLE", "test");
    expect(err.code).toBe("OBS_UNREACHABLE");
    expect(err.name).toBe("ObsError");
    expect(err).toBeInstanceOf(Error);
  });
});
