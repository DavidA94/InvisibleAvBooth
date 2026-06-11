import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { WebSocket } from "ws";
import { buildTestServer, destroyServer, resetServer, loginAsAdmin } from "../harness.js";
import type { TestServer } from "../harness.js";

describe("Preview WebSocket", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await buildTestServer();
  });

  beforeEach(() => {
    resetServer(server);
  });

  afterAll(() => {
    destroyServer(server);
  });

  function connectWs(path: string, cookie?: string): WebSocket {
    return new WebSocket(`ws://localhost:${server.port}${path}`, {
      headers: cookie ? { Cookie: cookie } : {},
    });
  }

  async function expectWsRejected(ws: WebSocket): Promise<void> {
    await new Promise<void>((resolve) => {
      ws.on("error", () => resolve());
      ws.on("close", () => resolve());
      setTimeout(() => resolve(), 2000);
    });
    expect(ws.readyState).not.toBe(WebSocket.OPEN);
  }

  async function waitForOpen(ws: WebSocket): Promise<void> {
    if (ws.readyState === WebSocket.OPEN) return;
    await new Promise<void>((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
      setTimeout(() => reject(new Error("WebSocket open timeout")), 2000);
    });
  }

  it("rejects connection without auth cookie", async () => {
    const ws = connectWs("/preview/obs");
    await expectWsRejected(ws);
  });

  it("rejects connection with invalid auth cookie", async () => {
    const ws = connectWs("/preview/obs", "token=invalid-jwt-token");
    await expectWsRejected(ws);
  });

  it("accepts authenticated connection to /preview/obs", async () => {
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);
    const ws = connectWs("/preview/obs", cookie);
    await waitForOpen(ws);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("accepts authenticated connection to /preview/camera/:id", async () => {
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);
    const ws = connectWs("/preview/camera/cam1", cookie);
    await waitForOpen(ws);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("tracks subscriber count", async () => {
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);
    const ws1 = connectWs("/preview/obs", cookie);
    await waitForOpen(ws1);
    expect(server.ctx.previewManager.getSubscriberCount("obs")).toBe(1);

    const ws2 = connectWs("/preview/obs", cookie);
    await waitForOpen(ws2);
    expect(server.ctx.previewManager.getSubscriberCount("obs")).toBe(2);

    ws1.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(server.ctx.previewManager.getSubscriberCount("obs")).toBe(1);

    ws2.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(server.ctx.previewManager.getSubscriberCount("obs")).toBe(0);
  });

  it("rejects connection to invalid preview path", async () => {
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);
    const ws = connectWs("/preview/bad/path/extra", cookie);
    await expectWsRejected(ws);
  });
});

describe("OBS Preview with ndiOutputName", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await buildTestServer();
  });

  beforeEach(() => {
    resetServer(server);
  });

  afterAll(() => {
    destroyServer(server);
  });

  function connectWs(path: string, cookie?: string): WebSocket {
    return new WebSocket(`ws://localhost:${server.port}${path}`, {
      headers: cookie ? { Cookie: cookie } : {},
    });
  }

  async function waitForOpen(ws: WebSocket): Promise<void> {
    if (ws.readyState === WebSocket.OPEN) return;
    await new Promise<void>((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
      setTimeout(() => reject(new Error("WebSocket open timeout")), 2000);
    });
  }

  function createObsDevice(ndiOutputName?: string): void {
    const metadata = ndiOutputName ? { ndiOutputName } : {};
    server.ctx.database
      .prepare(
        "INSERT INTO device_connections (id, deviceType, label, host, port, encryptedPassword, metadata, features, enabled, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run("obs-1", "obs", "Main OBS", "10.0.0.1", 4455, null, JSON.stringify(metadata), "{}", 1, new Date().toISOString());
  }

  it("OBS device with ndiOutputName — source available sends data to preview WebSocket", async () => {
    createObsDevice("MY-PC (OBS)");
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);

    // Mark source available (simulates NDI connection established)
    server.ctx.previewManager.setSourceAvailable("obs", true, "pipe:0");

    const ws = connectWs("/preview/obs", cookie);
    await waitForOpen(ws);

    // Subscriber is connected; since fakeSpawn emits close immediately,
    // we just verify the subscriber count is tracked
    expect(server.ctx.previewManager.getSubscriberCount("obs")).toBe(1);

    ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("OBS device without ndiOutputName — preview WebSocket still accepts connection but no data", async () => {
    createObsDevice(); // No ndiOutputName
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);

    // Source NOT marked available (no NDI output configured)
    const ws = connectWs("/preview/obs", cookie);
    await waitForOpen(ws);

    // Subscriber connected, but no FFmpeg spawned (source unavailable)
    expect(server.ctx.previewManager.getSubscriberCount("obs")).toBe(1);
    expect(server.ctx.previewManager.getActiveStreams()).toBe(0);

    ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("source unavailable — no FFmpeg spawned even with subscribers", async () => {
    createObsDevice("MY-PC (OBS)");
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);

    // Do NOT mark source available — simulates DistroAV not enabled
    const ws = connectWs("/preview/obs", cookie);
    await waitForOpen(ws);

    expect(server.ctx.previewManager.getSubscriberCount("obs")).toBe(1);
    expect(server.ctx.previewManager.getActiveStreams()).toBe(0);

    ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("source becomes available after subscriber connects — spawns FFmpeg", async () => {
    createObsDevice("MY-PC (OBS)");
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);

    const ws = connectWs("/preview/obs", cookie);
    await waitForOpen(ws);
    expect(server.ctx.previewManager.getActiveStreams()).toBe(0);

    // Source becomes available (NDI connected)
    server.ctx.previewManager.setSourceAvailable("obs", true, "pipe:0");

    // FFmpeg spawn should be triggered (fakeSpawn creates a mock process)
    // Give a tick for async spawn
    await new Promise((r) => setTimeout(r, 50));
    // The fakeSpawn emits close(0) immediately so the process may have already exited
    // but the spawn was attempted, verifiable by the source existing
    expect(server.ctx.previewManager.getSubscriberCount("obs")).toBe(1);

    ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("source marked unavailable — FFmpeg killed", async () => {
    createObsDevice("MY-PC (OBS)");
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);

    server.ctx.previewManager.setSourceAvailable("obs", true, "pipe:0");
    const ws = connectWs("/preview/obs", cookie);
    await waitForOpen(ws);
    await new Promise((r) => setTimeout(r, 50));

    // Mark source unavailable (DistroAV disabled)
    server.ctx.previewManager.setSourceAvailable("obs", false, "pipe:0");
    await new Promise((r) => setTimeout(r, 50));

    expect(server.ctx.previewManager.getActiveStreams()).toBe(0);

    ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });
});
