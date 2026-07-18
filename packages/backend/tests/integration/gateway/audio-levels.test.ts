/**
 * Integration test: OBS Audio Level Broadcasting
 *
 * Tests the full path from GStreamer level pipeline stdout → parser → EventBus → Socket.io broadcast.
 * Uses the shared test harness with a fake spawn that simulates level output.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import { io as ioClient } from "socket.io-client";
import type { Socket as ClientSocket } from "socket.io-client";
import WebSocket from "ws";
import type { EventEmitter } from "events";
import { buildTestServer, resetServer, destroyServer, loginAsAdmin } from "../harness.js";
import type { TestServer } from "../harness.js";
import { STC_OBS_AUDIO_LEVELS } from "@invisible-av-booth/shared";
import { LEVEL_MAX_RESTART_ATTEMPTS, LEVEL_RESTART_DELAY_MS } from "../../../src/services/previewStreamManager.js";

let s: TestServer;
let token: string;
const clients: ClientSocket[] = [];
const previewWsConnections: WebSocket[] = [];

beforeAll(async () => {
  s = await buildTestServer();
  // Insert OBS device with NDI output name so the preview source gets registered
  s.ctx.database
    .prepare(
      "INSERT INTO device_connections (id, deviceType, label, host, port, encryptedPassword, metadata, features, enabled, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run("obs-1", "obs", "Main OBS", "localhost", 4455, null, '{"ndiOutputName":"OBS_NDI_OUTPUT"}', "{}", 1, new Date().toISOString());
  await s.ctx.obsService.connect();
  // Initialize preview manager and OBS NDI source
  await s.ctx.previewManager.initialize();
  s.ctx.obsNdiPreviewSource.initialize();
});

afterAll(() => destroyServer(s));

beforeEach(async () => {
  resetServer(s);
  // Re-insert OBS device
  s.ctx.database
    .prepare(
      "INSERT INTO device_connections (id, deviceType, label, host, port, encryptedPassword, metadata, features, enabled, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run("obs-1", "obs", "Main OBS", "localhost", 4455, null, '{"ndiOutputName":"OBS_NDI_OUTPUT"}', "{}", 1, new Date().toISOString());
  const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
  const match = cookie.match(/token=([^;]+)/);
  token = match?.[1] ?? "";
});

afterEach(() => {
  while (clients.length) clients.pop()!.close();
  while (previewWsConnections.length) {
    const ws = previewWsConnections.pop()!;
    if (ws.readyState === WebSocket.OPEN) ws.close();
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

/**
 * Connect a preview WebSocket subscriber to /preview/obs.
 * This triggers pipeline spawn (video + audio + level).
 */
function connectPreviewWs(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${s.port}/preview/obs`, {
      headers: { cookie: `token=${token}` },
    });
    previewWsConnections.push(ws);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

/**
 * Get the level pipeline's stdout emitter from the fake spawn.
 * The level pipeline is spawned with args containing "-m" and "level".
 */
function getLevelProcessStdout(): EventEmitter | null {
  const fakeSpawn = s.ctx.previewManager["spawnFn"] as Mock;
  const calls = fakeSpawn.mock?.calls ?? [];
  for (let i = calls.length - 1; i >= 0; i--) {
    const args = calls[i]?.[1] as string[] | undefined;
    if (args && args.includes("-m") && args.includes("level")) {
      const result = fakeSpawn.mock.results[i];
      if (result?.type === "return") {
        return (result.value as { stdout: EventEmitter }).stdout;
      }
    }
  }
  return null;
}

/**
 * Get the level pipeline process (to simulate crashes).
 */
function getLevelProcess(): (EventEmitter & { kill: Mock }) | null {
  const fakeSpawn = s.ctx.previewManager["spawnFn"] as Mock;
  const calls = fakeSpawn.mock?.calls ?? [];
  for (let i = calls.length - 1; i >= 0; i--) {
    const args = calls[i]?.[1] as string[] | undefined;
    if (args && args.includes("-m") && args.includes("level")) {
      const result = fakeSpawn.mock.results[i];
      if (result?.type === "return") {
        return result.value as EventEmitter & { kill: Mock };
      }
    }
  }
  return null;
}

function simulateLevelOutput(stdout: EventEmitter, left: number, right: number): void {
  const line = `/GstPipeline:pipeline0/GstLevel:level0: peak, GstValueList:(double)${left}, (double)${right};\n`;
  stdout.emit("data", Buffer.from(line));
}

function waitForEvent<T>(client: ClientSocket, event: string, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeoutMs);
    client.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("OBS Audio Level Broadcasting", () => {
  it("emits stc:obs:audio:levels with correct independent L/R values", async () => {
    const client = await connectClient();

    // Make the OBS source available and connect a preview subscriber (triggers pipeline spawn)
    s.ctx.previewManager.setSourceAvailable("obs", true, "OBS_NDI_OUTPUT");
    await connectPreviewWs();
    await sleep(50);

    const stdout = getLevelProcessStdout();
    expect(stdout).not.toBeNull();

    const levelPromise = waitForEvent<{ left: number; right: number }>(client, STC_OBS_AUDIO_LEVELS);
    simulateLevelOutput(stdout!, -20.5, -6.3);

    const levels = await levelPromise;
    expect(levels.left).toBeCloseTo(-20.5);
    expect(levels.right).toBeCloseTo(-6.3);
  });

  it("emits correct values when L and R are identical", async () => {
    const client = await connectClient();
    s.ctx.previewManager.setSourceAvailable("obs", true, "OBS_NDI_OUTPUT");
    await connectPreviewWs();
    await sleep(50);

    const stdout = getLevelProcessStdout();
    expect(stdout).not.toBeNull();

    const levelPromise = waitForEvent<{ left: number; right: number }>(client, STC_OBS_AUDIO_LEVELS);
    simulateLevelOutput(stdout!, -15.0, -15.0);

    const levels = await levelPromise;
    expect(levels.left).toBe(-15);
    expect(levels.right).toBe(-15);
  });

  it("clamps silence (-inf) to -60", async () => {
    const client = await connectClient();
    s.ctx.previewManager.setSourceAvailable("obs", true, "OBS_NDI_OUTPUT");
    await connectPreviewWs();
    await sleep(50);

    const stdout = getLevelProcessStdout();
    expect(stdout).not.toBeNull();

    const levelPromise = waitForEvent<{ left: number; right: number }>(client, STC_OBS_AUDIO_LEVELS);
    stdout!.emit("data", Buffer.from("peak, GstValueList:(double)-inf, (double)-inf;\n"));

    const levels = await levelPromise;
    expect(levels.left).toBe(-60);
    expect(levels.right).toBe(-60);
  });

  it("does not emit audio levels when no preview subscribers are connected", async () => {
    const client = await connectClient();

    // Source is available but NO preview WS subscriber connects — pipeline not spawned
    s.ctx.previewManager.setSourceAvailable("obs", true, "OBS_NDI_OUTPUT");
    await sleep(100);

    const received: unknown[] = [];
    client.on(STC_OBS_AUDIO_LEVELS, (data) => received.push(data));
    await sleep(200);
    expect(received).toHaveLength(0);
  });

  it("level pipeline crash triggers restart and events resume", async () => {
    const client = await connectClient();
    s.ctx.previewManager.setSourceAvailable("obs", true, "OBS_NDI_OUTPUT");
    await connectPreviewWs();
    await sleep(50);

    // Verify initial level output works
    let stdout = getLevelProcessStdout();
    expect(stdout).not.toBeNull();

    let levelPromise = waitForEvent<{ left: number; right: number }>(client, STC_OBS_AUDIO_LEVELS);
    simulateLevelOutput(stdout!, -20, -20);
    let levels = await levelPromise;
    expect(levels.left).toBe(-20);

    // Simulate crash (non-zero exit)
    const levelProc = getLevelProcess();
    expect(levelProc).not.toBeNull();
    levelProc!.emit("close", 1);

    // Wait for restart delay
    await sleep(LEVEL_RESTART_DELAY_MS + 200);

    // New process should be spawned — get its stdout
    stdout = getLevelProcessStdout();
    expect(stdout).not.toBeNull();

    // Verify events resume from the new process
    levelPromise = waitForEvent<{ left: number; right: number }>(client, STC_OBS_AUDIO_LEVELS);
    simulateLevelOutput(stdout!, -10, -5);
    levels = await levelPromise;
    expect(levels.left).toBe(-10);
    expect(levels.right).toBe(-5);
  }, 10000);

  it("stops retrying after 3 consecutive failures", async () => {
    const client = await connectClient();
    s.ctx.previewManager.setSourceAvailable("obs", true, "OBS_NDI_OUTPUT");
    await connectPreviewWs();
    await sleep(50);

    // Crash the level pipeline MAX times
    for (let i = 0; i < LEVEL_MAX_RESTART_ATTEMPTS; i++) {
      const levelProc = getLevelProcess();
      expect(levelProc).not.toBeNull();
      levelProc!.emit("close", 1);
      if (i < LEVEL_MAX_RESTART_ATTEMPTS - 1) {
        await sleep(LEVEL_RESTART_DELAY_MS + 200);
      }
    }

    // After max failures, no more restarts even after waiting
    await sleep(LEVEL_RESTART_DELAY_MS + 500);

    // No events should arrive
    const received: unknown[] = [];
    client.on(STC_OBS_AUDIO_LEVELS, (data) => received.push(data));
    await sleep(200);
    expect(received).toHaveLength(0);
  }, 15000);

  it("does not count level pipeline against MAX_PREVIEW_STREAMS", async () => {
    await connectClient();
    s.ctx.previewManager.setSourceAvailable("obs", true, "OBS_NDI_OUTPUT");
    await connectPreviewWs();
    await sleep(50);

    // OBS source spawns: video + audio + level = 3 processes
    // But getActiveStreams should only count 1 (the video pipeline)
    expect(s.ctx.previewManager.getActiveStreams()).toBe(1);
  });

  it("new subscriber resets retry counter after dormant state and re-attempts level pipeline", async () => {
    const client = await connectClient();
    s.ctx.previewManager.setSourceAvailable("obs", true, "OBS_NDI_OUTPUT");
    await connectPreviewWs();
    await sleep(50);

    // Crash MAX times to enter dormant
    for (let i = 0; i < LEVEL_MAX_RESTART_ATTEMPTS; i++) {
      const levelProc = getLevelProcess();
      expect(levelProc).not.toBeNull();
      levelProc!.emit("close", 1);
      if (i < LEVEL_MAX_RESTART_ATTEMPTS - 1) {
        await sleep(LEVEL_RESTART_DELAY_MS + 200);
      }
    }
    await sleep(LEVEL_RESTART_DELAY_MS + 200);

    // Verify dormant state
    const source = (s.ctx.previewManager as unknown as { sources: Map<string, { levelRestartCount: number }> }).sources.get("obs");
    expect(source!.levelRestartCount).toBe(LEVEL_MAX_RESTART_ATTEMPTS);

    // Connect a new preview subscriber — should reset counter and re-attempt
    await connectPreviewWs();
    await sleep(100);

    // Verify level pipeline was re-spawned
    const stdout = getLevelProcessStdout();
    expect(stdout).not.toBeNull();

    // Verify events flow again
    const levelPromise = waitForEvent<{ left: number; right: number }>(client, STC_OBS_AUDIO_LEVELS);
    simulateLevelOutput(stdout!, -12, -8);
    const levels = await levelPromise;
    expect(levels.left).toBe(-12);
    expect(levels.right).toBe(-8);
  }, 15000);
});
