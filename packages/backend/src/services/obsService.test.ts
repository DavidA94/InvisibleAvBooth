import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import { applySchema } from "../db/schema.js";
import { ObsService, ObsError } from "./obsService.js";
import { eventBus } from "../eventBus.js";

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
      if (method === "GetStreamStatus") return Promise.resolve({ outputActive: false });
      if (method === "GetRecordStatus") return Promise.resolve({ outputActive: false });
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

function makeDb(withDevice = true) {
  const db = new Database(":memory:");
  applySchema(db);
  if (withDevice) {
    db.prepare(
      "INSERT INTO device_connections (id, deviceType, label, host, port, encryptedPassword, metadata, features, enabled, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run("obs-1", "obs", "Main OBS", "localhost", 4455, null, "{}", "{}", 1, new Date().toISOString());
  }
  return db;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const services: ObsService[] = [];
const cleanups: Array<() => void> = [];

function makeSvc(db: BetterSqlite3.Database, mockObs: MockObs, retry = { initialDelayMs: 10, maxDelayMs: 100, maxAttempts: 3, backoffFactor: 1, jitterMs: 0 }) {
  const svc = new ObsService(db, retry, mockObs as never);
  services.push(svc);
  return svc;
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
    const svc = makeSvc(makeDb(), mockObs);
    const result = await svc.connect();
    expect(result.success).toBe(true);
    expect(svc.getState().connected).toBe(true);
  });

  it("emits obs:state:changed on connect", async () => {
    const mockObs = makeMockObs();
    const svc = makeSvc(makeDb(), mockObs);
    const handler = vi.fn();
    eventBus.subscribe("obs:state:changed", handler);
    cleanups.push(() => eventBus.unsubscribe("obs:state:changed", handler));
    await svc.connect();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ state: expect.objectContaining({ connected: true }) }));
  });

  it("returns OBS_NOT_CONFIGURED when no enabled device exists", async () => {
    const mockObs = makeMockObs();
    const svc = makeSvc(makeDb(false), mockObs);
    const result = await svc.connect();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("OBS_NOT_CONFIGURED");
  });

  it("returns OBS_UNREACHABLE when connection fails", async () => {
    const mockObs = makeMockObs();
    mockObs.connect.mockRejectedValueOnce(new Error("refused"));
    const svc = makeSvc(makeDb(), mockObs);
    const result = await svc.connect();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("OBS_UNREACHABLE");
  });
});

// ── disconnect ────────────────────────────────────────────────────────────────

describe("ObsService.disconnect", () => {
  it("sets connected to false", async () => {
    const mockObs = makeMockObs();
    const svc = makeSvc(makeDb(), mockObs);
    await svc.connect();
    await svc.disconnect();
    expect(svc.getState().connected).toBe(false);
  });
});

// ── safe-start sequence ───────────────────────────────────────────────────────

describe("ObsService.startStream — safe-start", () => {
  it("calls SetStreamServiceSettings before StartStream", async () => {
    const mockObs = makeMockObs();
    const svc = makeSvc(makeDb(), mockObs);
    await svc.connect();
    await svc.startStream();
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
    const svc = makeSvc(makeDb(), mockObs);
    await svc.connect();
    const result = await svc.startStream();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("METADATA_UPDATE_FAILED");
    const calls = mockObs.call.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain("StartStream");
  });

  it("sets commandedState.streaming on success", async () => {
    const mockObs = makeMockObs();
    const svc = makeSvc(makeDb(), mockObs);
    await svc.connect();
    await svc.startStream();
    expect(svc.getState().commandedState.streaming).toBe(true);
  });

  it("returns OBS_UNREACHABLE when not connected", async () => {
    const mockObs = makeMockObs();
    const svc = makeSvc(makeDb(), mockObs);
    const result = await svc.startStream();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("OBS_UNREACHABLE");
  });
});

// ── stopStream / startRecording / stopRecording ───────────────────────────────

describe("ObsService command methods", () => {
  it("stopStream sets commandedState.streaming to false", async () => {
    const mockObs = makeMockObs();
    const svc = makeSvc(makeDb(), mockObs);
    await svc.connect();
    await svc.startStream();
    await svc.stopStream();
    expect(svc.getState().commandedState.streaming).toBe(false);
  });

  it("startRecording sets commandedState.recording to true", async () => {
    const mockObs = makeMockObs();
    const svc = makeSvc(makeDb(), mockObs);
    await svc.connect();
    await svc.startRecording();
    expect(svc.getState().commandedState.recording).toBe(true);
  });

  it("stopRecording sets commandedState.recording to false", async () => {
    const mockObs = makeMockObs();
    const svc = makeSvc(makeDb(), mockObs);
    await svc.connect();
    await svc.startRecording();
    await svc.stopRecording();
    expect(svc.getState().commandedState.recording).toBe(false);
  });

  it("emits STREAM_STOP_FAILED on stopStream failure", async () => {
    const mockObs = makeMockObs();
    mockObs.call.mockImplementation((method: string) => {
      if (method === "GetStreamStatus") return Promise.resolve({ outputActive: true });
      if (method === "GetRecordStatus") return Promise.resolve({ outputActive: false });
      if (method === "StopStream") return Promise.reject(new Error("failed"));
      return Promise.resolve({});
    });
    const svc = makeSvc(makeDb(), mockObs);
    await svc.connect();
    const handler = vi.fn();
    eventBus.subscribe("obs:error", handler);
    cleanups.push(() => eventBus.unsubscribe("obs:error", handler));
    await svc.stopStream();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: "STREAM_STOP_FAILED" }) }));
  });
});

// ── disconnect event / reconnect ──────────────────────────────────────────────

describe("ObsService reconnect", () => {
  it("emits obs:error with OBS_UNREACHABLE on ConnectionClosed", async () => {
    const mockObs = makeMockObs();
    const svc = makeSvc(makeDb(), mockObs);
    await svc.connect();
    const handler = vi.fn();
    eventBus.subscribe("obs:error", handler);
    cleanups.push(() => eventBus.unsubscribe("obs:error", handler));
    mockObs.emit("ConnectionClosed");
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: "OBS_UNREACHABLE" }), retryExhausted: false }));
  });

  it("exhausts retries and emits retryExhausted: true", async () => {
    const mockObs = makeMockObs();
    mockObs.connect
      .mockResolvedValueOnce(undefined) // initial connect succeeds
      .mockRejectedValue(new Error("refused")); // all retries fail

    const svc = makeSvc(makeDb(), mockObs, {
      initialDelayMs: 1,
      maxDelayMs: 10,
      maxAttempts: 2,
      backoffFactor: 1,
      jitterMs: 0,
    });
    await svc.connect();

    const handler = vi.fn();
    eventBus.subscribe("obs:error", handler);
    cleanups.push(() => eventBus.unsubscribe("obs:error", handler));

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
