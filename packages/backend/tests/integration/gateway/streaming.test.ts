/**
 * Streaming lifecycle integration tests: start/stop via socket commands,
 * error recovery, recording start/stop with state verification,
 * manifest clear blocked while live, no_source handling.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { io as ioClient } from "socket.io-client";
import type { Socket as ClientSocket } from "socket.io-client";
import { buildTestServer, destroyServer, loginAsAdmin } from "../harness.js";
import type { TestServer } from "../harness.js";
import { CTS_PLATFORM_COMMAND, CTS_OBS_COMMAND, CTS_SESSION_MANIFEST_UPDATE, STC_PLATFORM_STATE, STC_PLATFORM_READINESS } from "@invisible-av-booth/shared";

let s: TestServer;
let token: string;
const clients: ClientSocket[] = [];

function setupObsMock() {
  s.fakeObs.call.mockImplementation((method: string) => {
    if (method === "GetStreamStatus") return Promise.resolve({ outputActive: false });
    if (method === "GetRecordStatus") return Promise.resolve({ outputActive: false });
    if (method === "StartStream") {
      // Simulate OBS connecting to relay shortly after StartStream
      setTimeout(() => s.fakeNms.simulatePublish(), 10);
      return Promise.resolve({});
    }
    if (method === "StopStream") return Promise.resolve({});
    if (method === "StartRecord") return Promise.resolve({});
    if (method === "StopRecord") return Promise.resolve({});
    if (method === "GetStreamServiceSettings") return Promise.resolve({ streamServiceSettings: { server: "rtmp://localhost:1935/live" } });
    if (method === "SetStreamServiceSettings") return Promise.resolve({});
    return Promise.resolve({});
  });
}

beforeAll(async () => {
  s = await buildTestServer({ seedPlatform: true });

  // Insert OBS device and connect
  s.ctx.database
    .prepare(
      "INSERT INTO device_connections (id, deviceType, label, host, port, encryptedPassword, metadata, features, enabled, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run("obs-1", "obs", "Main OBS", "localhost", 4455, null, "{}", "{}", 1, new Date().toISOString());

  setupObsMock();
  await s.ctx.obsService.connect();

  // Login once — token persists since we don't reset the users table
  const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
  const match = cookie.match(/token=([^;]+)/);
  token = match?.[1] ?? "";
});

afterAll(() => destroyServer(s));

beforeEach(() => {
  s.fakePlatformClient.reset();
  s.fakeObs.call.mockClear();
  setupObsMock();
  // Reset relay state so each test starts with OBS not connected
  s.fakeNms.simulateUnpublish();
});

afterEach(async () => {
  while (clients.length) clients.pop()!.close();

  // Ensure platform is back to idle for next test
  const states = s.ctx.platformService.getPlatformStates();
  for (const [, state] of states) {
    if (state.status === "streaming" || state.status === "no_source" || state.status === "recovering") {
      try {
        await s.ctx.platformService.stopAll();
      } catch {
        /* ignore */
      }
      break;
    }
  }
});

function connectClient(): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = ioClient(`http://localhost:${s.port}`, { auth: { token } });
    clients.push(client);
    client.on("connect", () => resolve(client));
    client.on("connect_error", reject);
  });
}

// ── Streaming lifecycle ───────────────────────────────────────────────────────

describe("Streaming lifecycle via platform commands", () => {
  it("startAll creates broadcast, starts OBS stream, and transitions to streaming", async () => {
    const client = await connectClient();

    const states: Array<{ platformId: string; state: { status: string } }> = [];
    client.on(STC_PLATFORM_STATE, (payload: { platformId: string; state: { status: string } }) => {
      states.push(payload);
    });

    const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "startAll" }, resolve);
    });

    expect(result.success).toBe(true);
    expect(s.fakePlatformClient.calls.some((c) => c.method === "createBroadcast")).toBe(true);

    const statusSequence = states.map((s) => s.state.status);
    expect(statusSequence).toContain("starting");
    expect(statusSequence).toContain("streaming");
  });

  it("stopAll ends broadcast and transitions to idle", async () => {
    const client = await connectClient();

    // Start first
    await new Promise<void>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "startAll" }, () => resolve());
    });

    const states: Array<{ state: { status: string } }> = [];
    client.on(STC_PLATFORM_STATE, (payload: { state: { status: string } }) => {
      states.push(payload);
    });

    const result = await new Promise<{ success: boolean }>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "stopAll" }, resolve);
    });

    expect(result.success).toBe(true);
    expect(s.fakePlatformClient.calls.some((c) => c.method === "endBroadcast")).toBe(true);

    const statusSequence = states.map((s) => s.state.status);
    expect(statusSequence).toContain("stopping");
    expect(statusSequence).toContain("idle");
  });

  it("startPlatform starts a single platform by type", async () => {
    const client = await connectClient();

    const result = await new Promise<{ success: boolean }>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "startPlatform", platformType: "youtube" }, resolve);
    });

    expect(result.success).toBe(true);
    expect(s.fakePlatformClient.calls.some((c) => c.method === "createBroadcast")).toBe(true);
  });

  it("stopPlatform stops a single platform by type", async () => {
    const client = await connectClient();

    await new Promise<void>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "startPlatform", platformType: "youtube" }, () => resolve());
    });

    const result = await new Promise<{ success: boolean }>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "stopPlatform", platformType: "youtube" }, resolve);
    });

    expect(result.success).toBe(true);
    expect(s.fakePlatformClient.calls.some((c) => c.method === "endBroadcast")).toBe(true);
  });

  it("startAll with broadcast failure transitions to error", async () => {
    const { PlatformError } = await import("../../../src/platforms/platformClient.js");
    s.fakePlatformClient.enqueue("createBroadcast", new PlatformError("BROADCAST_CREATE_FAILED", "API error"));

    const client = await connectClient();

    const states: Array<{ state: { status: string } }> = [];
    client.on(STC_PLATFORM_STATE, (payload: { state: { status: string } }) => {
      states.push(payload);
    });

    await new Promise<void>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "startAll" }, () => resolve());
    });

    expect(states.some((s) => s.state.status === "error")).toBe(true);

    // Platform is now in error — startPlatform can restart from error
    // (error → starting is a valid transition). Clean up for next test:
    s.fakePlatformClient.reset();
    await new Promise<void>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "startPlatform", platformType: "youtube" }, () => resolve());
    });
    await new Promise<void>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "stopPlatform", platformType: "youtube" }, () => resolve());
    });
  });

  it("rejects concurrent operations", async () => {
    const client = await connectClient();

    // Make createBroadcast slow so the operation is still in progress
    s.fakePlatformClient.enqueue(
      "createBroadcast",
      new Promise((resolve) => {
        setTimeout(
          () =>
            resolve({
              broadcastId: "slow-1",
              rtmpUrl: "rtmp://fake/live/stream",
              streamUrl: "rtmp://fake/live",
              streamKey: "stream",
            }),
          500,
        );
      }),
    );

    // Start a long operation — don't await
    const p1 = new Promise<{ success: boolean }>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "startAll" }, resolve);
    });

    // Small delay to ensure first command is processing
    await new Promise((r) => setTimeout(r, 50));

    // Try another while first is in progress
    const r2 = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "stopAll" }, resolve);
    });

    expect(r2.success).toBe(false);
    expect(r2.error).toContain("already in progress");

    await p1; // let first finish
  });

  it("unknown command type returns error", async () => {
    const client = await connectClient();
    const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "invalid" as never }, resolve);
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown");
  });
});

// ── Recording lifecycle ───────────────────────────────────────────────────────

describe("Recording lifecycle with state verification", () => {
  it("startRecording returns success and updates state", async () => {
    const client = await connectClient();

    let isRecording = false;
    s.fakeObs.call.mockImplementation((method: string) => {
      if (method === "StartRecord") {
        isRecording = true;
        return Promise.resolve({});
      }
      if (method === "StopRecord") {
        isRecording = false;
        return Promise.resolve({});
      }
      if (method === "GetRecordStatus") return Promise.resolve({ outputActive: isRecording });
      if (method === "GetStreamStatus") return Promise.resolve({ outputActive: false });
      if (method === "GetStreamServiceSettings") return Promise.resolve({ streamServiceSettings: { server: "rtmp://localhost:1935/live" } });
      return Promise.resolve({});
    });

    const result = await new Promise<{ success: boolean }>((resolve) => {
      client.emit(CTS_OBS_COMMAND, { type: "startRecording" }, resolve);
    });

    expect(result.success).toBe(true);
    expect(s.ctx.obsService.getState().recording).toBe(true);
  });

  it("stopRecording returns success and updates state", async () => {
    const client = await connectClient();

    let isRecording = false;
    s.fakeObs.call.mockImplementation((method: string) => {
      if (method === "StartRecord") {
        isRecording = true;
        return Promise.resolve({});
      }
      if (method === "StopRecord") {
        isRecording = false;
        return Promise.resolve({});
      }
      if (method === "GetRecordStatus") return Promise.resolve({ outputActive: isRecording });
      if (method === "GetStreamStatus") return Promise.resolve({ outputActive: false });
      if (method === "GetStreamServiceSettings") return Promise.resolve({ streamServiceSettings: { server: "rtmp://localhost:1935/live" } });
      return Promise.resolve({});
    });

    // Start then stop
    await new Promise<void>((resolve) => {
      client.emit(CTS_OBS_COMMAND, { type: "startRecording" }, () => resolve());
    });

    const result = await new Promise<{ success: boolean }>((resolve) => {
      client.emit(CTS_OBS_COMMAND, { type: "stopRecording" }, resolve);
    });

    expect(result.success).toBe(true);
    expect(s.ctx.obsService.getState().commandedState.recording).toBe(false);
  });

  it("startRecording fails when OBS reports recording did not start", async () => {
    const client = await connectClient();

    s.fakeObs.call.mockImplementation((method: string) => {
      if (method === "StartRecord") return Promise.resolve({});
      if (method === "GetRecordStatus") return Promise.resolve({ outputActive: false });
      if (method === "GetStreamStatus") return Promise.resolve({ outputActive: false });
      if (method === "GetStreamServiceSettings") return Promise.resolve({ streamServiceSettings: { server: "rtmp://localhost:1935/live" } });
      return Promise.resolve({});
    });

    const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      client.emit(CTS_OBS_COMMAND, { type: "startRecording" }, resolve);
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("failed to start");
  });
});

// ── Manifest clear blocked while live ─────────────────────────────────────────

describe("Manifest clear blocked while live", () => {
  it("rejects manifest clear while streaming", async () => {
    const client = await connectClient();

    await new Promise<void>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "startAll" }, () => resolve());
    });

    const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      client.emit(CTS_SESSION_MANIFEST_UPDATE, {}, resolve);
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("streaming or recording");
  });
});

// ── No source handling ────────────────────────────────────────────────────────

describe("No source handling", () => {
  it("transitions streaming platforms to no_source when OBS disconnects from relay", async () => {
    const client = await connectClient();

    await new Promise<void>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "startAll" }, () => resolve());
    });

    // Verify platform is actually streaming
    const platformStates = s.ctx.platformService.getPlatformStates();
    const statuses = [...platformStates.values()].map((s) => s.status);
    expect(statuses).toContain("streaming");

    const states: Array<{ state: { status: string } }> = [];
    client.on(STC_PLATFORM_STATE, (payload: { state: { status: string } }) => {
      states.push(payload);
    });

    // Simulate OBS disconnecting from relay
    s.fakeNms.simulateUnpublish();

    await new Promise((r) => setTimeout(r, 200));

    expect(states.some((s) => s.state.status === "no_source")).toBe(true);
  });
});

// ── Hot-reload after platform CRUD ────────────────────────────────────────────

describe("reloadPlatforms (hot-reload)", () => {
  it("emits updated platform readiness after a platform is deleted via REST", async () => {
    const client = await connectClient();
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);

    const readiness: Array<{ platforms: Array<{ platformType: string }> }> = [];
    client.on(STC_PLATFORM_READINESS, (payload: { platforms: Array<{ platformType: string }> }) => {
      readiness.push(payload);
    });

    // Delete the seeded YouTube platform via REST
    await s.agent.delete("/api/admin/platforms/youtube").set("Cookie", cookie);

    await new Promise((r) => setTimeout(r, 100));

    // Should have received a readiness update with empty platforms
    expect(readiness.length).toBeGreaterThanOrEqual(1);
    const last = readiness[readiness.length - 1]!;
    expect(last.platforms).toEqual([]);
  });
});
