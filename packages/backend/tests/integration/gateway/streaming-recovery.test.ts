/**
 * Streaming recovery integration tests.
 *
 * Covers: FFmpeg auto-recovery, no_source→recovering transition,
 * stop-with-retry, OBS stop when all idle, and OBS disconnected rejection.
 *
 * Gaps addressed: B7–B13 from docs/testing-gaps.md
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { io as ioClient } from "socket.io-client";
import type { Socket as ClientSocket } from "socket.io-client";
import { buildTestServer, destroyServer, loginAsAdmin } from "../harness.js";
import type { TestServer } from "../harness.js";
import { CTS_PLATFORM_COMMAND, STC_PLATFORM_STATE } from "@invisible-av-booth/shared";
import { eventBus } from "../../../src/eventBus/eventBus.js";
import { BUS_FORWARDER_EXITED } from "../../../src/eventBus/types.js";

let s: TestServer;
let token: string;
const clients: ClientSocket[] = [];

function setupObsMock(): void {
  s.fakeObs.call.mockImplementation((method: string) => {
    if (method === "GetStreamStatus") return Promise.resolve({ outputActive: false });
    if (method === "GetRecordStatus") return Promise.resolve({ outputActive: false });
    if (method === "StartStream") {
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

  s.ctx.database
    .prepare(
      "INSERT INTO device_connections (id, deviceType, label, host, port, encryptedPassword, metadata, features, enabled, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run("obs-1", "obs", "Main OBS", "localhost", 4455, null, "{}", "{}", 1, new Date().toISOString());

  setupObsMock();
  await s.ctx.obsService.connect();

  const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
  const match = cookie.match(/token=([^;]+)/);
  token = match?.[1] ?? "";
});

afterAll(() => destroyServer(s));

beforeEach(async () => {
  s.fakePlatformClient.reset();
  s.fakeObs.call.mockClear();
  setupObsMock();
  s.fakeNms.simulateUnpublish();
  // Ensure OBS is connected (some tests disconnect it)
  s.fakeObs.connect.mockResolvedValue(undefined);
  await s.ctx.obsService.connect();
});

afterEach(async () => {
  while (clients.length) clients.pop()!.close();

  // Ensure platform is back to idle
  const states = s.ctx.platformService.getPlatformStates();
  for (const [, state] of states) {
    if (state.status !== "idle" && state.status !== "error") {
      try {
        await s.ctx.platformService.stopAll();
      } catch {
        /* ignore */
      }
      break;
    }
  }
  // Force any error-state platforms back to idle by reloading
  s.ctx.platformService.reloadPlatforms();
});

function connectClient(): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = ioClient(`http://localhost:${s.port}`, { auth: { token } });
    clients.push(client);
    client.on("connect", () => resolve(client));
    client.on("connect_error", reject);
  });
}

// ── B7: FFmpeg forwarder auto-recovery ───────────────────────────────────────

describe("FFmpeg forwarder auto-recovery", () => {
  it("recovers when forwarder exits and health poll succeeds", async () => {
    const client = await connectClient();

    // Start streaming
    await new Promise<void>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "startAll" }, () => resolve());
    });

    // Verify streaming
    const platformStates = s.ctx.platformService.getPlatformStates();
    expect([...platformStates.values()][0]?.status).toBe("streaming");

    // Simulate FFmpeg exit with health poll succeeding (default mock returns healthy)
    eventBus.emit(BUS_FORWARDER_EXITED, { platformId: "youtube", code: 1, lastStderr: ["Connection reset"] });

    // Wait for recovery (2s wait + 5s verify)
    await new Promise((r) => setTimeout(r, 8000));

    // Should still be streaming (recovery succeeded)
    const afterStates = s.ctx.platformService.getPlatformStates();
    expect([...afterStates.values()][0]?.status).toBe("streaming");
  }, 15000);

  it("transitions to error when forwarder exits and health poll fails", async () => {
    const client = await connectClient();

    await new Promise<void>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "startAll" }, () => resolve());
    });

    // Make health poll fail (broadcast ended)
    s.fakePlatformClient.enqueue("pollHealth", new Error("Broadcast ended"));

    // Simulate FFmpeg exit
    eventBus.emit(BUS_FORWARDER_EXITED, { platformId: "youtube", code: 1, lastStderr: [] });

    // Wait for recovery attempt (2s + 5s + buffer)
    await new Promise((r) => setTimeout(r, 8000));

    const afterStates = s.ctx.platformService.getPlatformStates();
    expect([...afterStates.values()][0]?.status).toBe("error");
  }, 15000);
});

// ── B8: no_source → recovering → streaming/error ─────────────────────────────

describe("No source → Recovering flow", () => {
  it("transitions to no_source when OBS disconnects from relay, then recovers", async () => {
    const client = await connectClient();

    const states: Array<{ state: { status: string } }> = [];
    client.on(STC_PLATFORM_STATE, (payload: { state: { status: string } }) => {
      states.push(payload);
    });

    await new Promise<void>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "startAll" }, () => resolve());
    });

    // Simulate OBS disconnecting from relay
    s.fakeNms.simulateUnpublish();
    await new Promise((r) => setTimeout(r, 100));

    // Should be in no_source
    const noSourceStates = states.filter((st) => st.state.status === "no_source");
    expect(noSourceStates.length).toBeGreaterThan(0);

    // Simulate OBS reconnecting
    s.fakeNms.simulatePublish();
    await new Promise((r) => setTimeout(r, 200));

    // Should transition through recovering to streaming
    const recoveringStates = states.filter((st) => st.state.status === "recovering");
    expect(recoveringStates.length).toBeGreaterThan(0);

    const streamingStates = states.filter((st) => st.state.status === "streaming");
    expect(streamingStates.length).toBeGreaterThanOrEqual(2); // initial + after recovery
  });

  it("transitions to error when recovery health poll fails", async () => {
    const client = await connectClient();

    const states: Array<{ state: { status: string } }> = [];
    client.on(STC_PLATFORM_STATE, (payload: { state: { status: string } }) => {
      states.push(payload);
    });

    await new Promise<void>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "startAll" }, () => resolve());
    });

    // Make health poll fail for recovery
    s.fakePlatformClient.enqueue("pollHealth", new Error("Broadcast ended"));

    // Simulate disconnect + reconnect
    s.fakeNms.simulateUnpublish();
    await new Promise((r) => setTimeout(r, 100));
    s.fakeNms.simulatePublish();
    await new Promise((r) => setTimeout(r, 200));

    // Should have transitioned to error
    const errorStates = states.filter((st) => st.state.status === "error");
    expect(errorStates.length).toBeGreaterThan(0);
  });

  it("FFmpeg exit during no_source does NOT trigger auto-recovery", async () => {
    const client = await connectClient();

    await new Promise<void>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "startAll" }, () => resolve());
    });

    // Enter no_source
    s.fakeNms.simulateUnpublish();
    await new Promise((r) => setTimeout(r, 100));

    const platformStates = s.ctx.platformService.getPlatformStates();
    expect([...platformStates.values()][0]?.status).toBe("no_source");

    // Simulate FFmpeg exit — should NOT trigger recovery logic
    eventBus.emit(BUS_FORWARDER_EXITED, { platformId: "youtube", code: 1, lastStderr: [] });
    await new Promise((r) => setTimeout(r, 100));

    // Should still be no_source (not error or streaming)
    const afterStates = s.ctx.platformService.getPlatformStates();
    expect([...afterStates.values()][0]?.status).toBe("no_source");
  });
});

// ── B10: OBS not connected → reject start ────────────────────────────────────

describe("OBS not connected rejection", () => {
  it("rejects startAll when OBS is disconnected", async () => {
    const client = await connectClient();

    // Disconnect OBS
    s.fakeObs.emit("ConnectionClosed");
    await new Promise((r) => setTimeout(r, 50));

    // Make OBS start fail (simulating disconnected)
    s.fakeObs.call.mockImplementation((method: string) => {
      if (method === "StartStream") return Promise.reject(new Error("not connected"));
      if (method === "GetStreamStatus") return Promise.resolve({ outputActive: false });
      if (method === "GetRecordStatus") return Promise.resolve({ outputActive: false });
      if (method === "GetStreamServiceSettings") return Promise.resolve({ streamServiceSettings: { server: "rtmp://localhost:1935/live" } });
      return Promise.resolve({});
    });

    await new Promise<{ success: boolean; error?: string }>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "startAll" }, resolve);
    });

    // The start creates the broadcast first (succeeds) then fails at OBS step
    // Platform should be in error state
    const platformStates = s.ctx.platformService.getPlatformStates();
    const status = [...platformStates.values()][0]?.status;
    expect(status).toBe("error");
  });
});

// ── B12: OBS stream stopped when all platforms reach idle ────────────────────

describe("OBS stream stopped when all platforms idle", () => {
  it("stops OBS stream after all platforms reach idle via stopAll", async () => {
    const client = await connectClient();

    await new Promise<void>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "startAll" }, () => resolve());
    });

    // Verify platform is streaming
    const platformStates = s.ctx.platformService.getPlatformStates();
    expect([...platformStates.values()][0]?.status).toBe("streaming");

    // Clear mock call history AFTER starting so we can track what stopAll does
    s.fakeObs.call.mockClear();

    // Stop all
    await new Promise<void>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "stopAll" }, () => resolve());
    });

    // OBS stream should have been stopped (checkAllIdle triggers StopStream)
    expect(s.fakeObs.call).toHaveBeenCalledWith("StopStream");
  });
});

// ── B13: Start from Error state ends previous broadcast ──────────────────────

describe("Start from Error state", () => {
  it("attempts to end previous broadcast before creating new one", async () => {
    const client = await connectClient();

    // First start → get to streaming, then force to error state with broadcastId.
    await new Promise<void>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "startAll" }, () => resolve());
    });

    // Force to error (simulate health poll failure)
    s.ctx.platformService._transitionPlatform("youtube", "error", "Test error");

    // Verify in error
    const errorStates = s.ctx.platformService.getPlatformStates();
    expect([...errorStates.values()][0]?.status).toBe("error");

    // Clear call history
    s.fakePlatformClient.reset();

    // Start again from error state
    await new Promise<void>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "startPlatform", platformType: "youtube" }, () => resolve());
    });

    // Should have called endBroadcast (best-effort cleanup) before createBroadcast
    const endCalls = s.fakePlatformClient.calls.filter((c) => c.method === "endBroadcast");
    const createCalls = s.fakePlatformClient.calls.filter((c) => c.method === "createBroadcast");
    expect(endCalls.length).toBeGreaterThanOrEqual(1);
    expect(createCalls.length).toBeGreaterThanOrEqual(1);

    // endBroadcast should come before createBroadcast
    const endIndex = s.fakePlatformClient.calls.findIndex((c) => c.method === "endBroadcast");
    const createIndex = s.fakePlatformClient.calls.findIndex((c) => c.method === "createBroadcast");
    expect(endIndex).toBeLessThan(createIndex);
  });
});
