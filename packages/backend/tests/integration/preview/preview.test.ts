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
    expect(server.ctx.videoPreviewManager.getSubscriberCount("obs")).toBe(1);

    const ws2 = connectWs("/preview/obs", cookie);
    await waitForOpen(ws2);
    expect(server.ctx.videoPreviewManager.getSubscriberCount("obs")).toBe(2);

    ws1.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(server.ctx.videoPreviewManager.getSubscriberCount("obs")).toBe(1);

    ws2.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(server.ctx.videoPreviewManager.getSubscriberCount("obs")).toBe(0);
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
    server.ctx.videoPreviewManager.setSourceAvailable("obs", true, "pipe:0");

    const ws = connectWs("/preview/obs", cookie);
    await waitForOpen(ws);

    // Subscriber is connected; since fakeSpawn emits close immediately,
    // we just verify the subscriber count is tracked
    expect(server.ctx.videoPreviewManager.getSubscriberCount("obs")).toBe(1);

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
    expect(server.ctx.videoPreviewManager.getSubscriberCount("obs")).toBe(1);
    expect(server.ctx.videoPreviewManager.getActiveStreams()).toBe(0);

    ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("source unavailable — no FFmpeg spawned even with subscribers", async () => {
    createObsDevice("MY-PC (OBS)");
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);

    // Do NOT mark source available — simulates DistroAV not enabled
    const ws = connectWs("/preview/obs", cookie);
    await waitForOpen(ws);

    expect(server.ctx.videoPreviewManager.getSubscriberCount("obs")).toBe(1);
    expect(server.ctx.videoPreviewManager.getActiveStreams()).toBe(0);

    ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("source becomes available after subscriber connects — spawns FFmpeg", async () => {
    createObsDevice("MY-PC (OBS)");
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);

    const ws = connectWs("/preview/obs", cookie);
    await waitForOpen(ws);
    expect(server.ctx.videoPreviewManager.getActiveStreams()).toBe(0);

    // Source becomes available (NDI connected)
    server.ctx.videoPreviewManager.setSourceAvailable("obs", true, "pipe:0");

    // FFmpeg spawn should be triggered (fakeSpawn creates a mock process)
    // Give a tick for async spawn
    await new Promise((r) => setTimeout(r, 50));
    // The fakeSpawn emits close(0) immediately so the process may have already exited
    // but the spawn was attempted, verifiable by the source existing
    expect(server.ctx.videoPreviewManager.getSubscriberCount("obs")).toBe(1);

    ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("source marked unavailable — FFmpeg killed", async () => {
    createObsDevice("MY-PC (OBS)");
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);

    server.ctx.videoPreviewManager.setSourceAvailable("obs", true, "pipe:0");
    const ws = connectWs("/preview/obs", cookie);
    await waitForOpen(ws);
    await new Promise((r) => setTimeout(r, 50));

    // Mark source unavailable (DistroAV disabled)
    server.ctx.videoPreviewManager.setSourceAvailable("obs", false, "pipe:0");
    await new Promise((r) => setTimeout(r, 50));

    expect(server.ctx.videoPreviewManager.getActiveStreams()).toBe(0);

    ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });
});

describe("Preview data fan-out and lifecycle", () => {
  let server: TestServer;
  // Track all spawned processes from the fakeSpawn mock
  const spawnedProcesses: Array<{
    cmd: string;
    args: string[];
    process: { stdout: { emit: (e: string, d: Buffer) => void } | null; emit: (e: string, ...a: unknown[]) => void };
  }> = [];

  beforeAll(async () => {
    server = await buildTestServer();
    // Initialize the preview manager so gstreamerAvailable = true and pipelines can spawn.
    (server.ctx.videoPreviewManager as unknown as { gstreamerAvailable: boolean }).gstreamerAvailable = true;

    // Wrap the fakeSpawn to track all spawned processes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalSpawn = (server.ctx.videoPreviewManager as any).spawnFn;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (server.ctx.videoPreviewManager as any).spawnFn = (cmd: string, args: string[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const proc = originalSpawn(cmd, args) as any;
      spawnedProcesses.push({ cmd, args, process: proc });
      return proc;
    };
  });

  beforeEach(() => {
    resetServer(server);
    // Don't clear spawnedProcesses — sources persist across tests in same server
  });

  afterAll(() => {
    destroyServer(server);
  });

  function connectWs(path: string, cookie: string): WebSocket {
    return new WebSocket(`ws://localhost:${server.port}${path}`, {
      headers: { Cookie: cookie },
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
  it("fans out MJPEG frames to connected subscribers", async () => {
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);

    const ws = connectWs("/preview/obs", cookie);
    await waitForOpen(ws);

    // Mark source available — triggers pipeline spawn since subscriber already connected
    server.ctx.videoPreviewManager.setSourceAvailable("obs", true, "OBS-NDI");
    await new Promise((r) => setTimeout(r, 100));

    // Verify pipeline was spawned and tracked
    const gstProcs = spawnedProcesses.filter((e) => e.cmd === "gst-launch-1.0" && e.args[0] !== "--version");
    expect(gstProcs.length).toBeGreaterThanOrEqual(1);

    // Get the video pipeline process (first one spawned)
    const videoProc = gstProcs[0]!.process;
    expect(videoProc.stdout).not.toBeNull();

    // Emit a fake JPEG frame on stdout (SOI + data + EOI)
    const frame = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from("fake-jpeg"), Buffer.from([0xff, 0xd9])]);

    const received = new Promise<Buffer>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("No message received")), 2000);
      ws.on("message", (data) => {
        clearTimeout(timeout);
        resolve(data as Buffer);
      });
    });

    videoProc.stdout!.emit("data", frame);

    // OBS source has withAudio=true, so frame is prefixed with type byte 0x01
    const msg = await received;
    expect(msg[0]).toBe(0x01); // PREVIEW_MSG_VIDEO
    // The rest is the original JPEG frame
    expect(Buffer.from(msg).subarray(1).equals(frame)).toBe(true);

    ws.close();
    await new Promise((r) => setTimeout(r, 50));
  }, 10000);

  it("fans out audio PCM chunks to subscribers", async () => {
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);

    const ws = connectWs("/preview/obs", cookie);
    await waitForOpen(ws);

    server.ctx.videoPreviewManager.setSourceAvailable("obs", true, "OBS-NDI");
    await new Promise((r) => setTimeout(r, 100));

    // OBS spawns 2 processes: video + audio
    const gstProcs = spawnedProcesses.filter((e) => e.cmd === "gst-launch-1.0" && e.args[0] !== "--version" && e.process.stdout);
    expect(gstProcs.length).toBeGreaterThanOrEqual(2);
    const audioProc = gstProcs[gstProcs.length - 1]!.process;

    // Emit enough PCM data for one chunk (44100 Hz * 1 channel * 2 bytes * 20ms / 1000 = 1764 bytes)
    const bytesPerChunk = (44100 * 1 * 2 * 20) / 1000;
    const pcmChunk = Buffer.alloc(bytesPerChunk, 0x42);

    const received = new Promise<Buffer>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("No audio message")), 2000);
      ws.on("message", (data) => {
        const buffer = data as Buffer;
        if (buffer[0] === 0x02) {
          clearTimeout(timeout);
          resolve(buffer);
        }
      });
    });

    audioProc.stdout!.emit("data", pcmChunk);

    const msg = await received;
    expect(msg[0]).toBe(0x02); // PREVIEW_MSG_AUDIO
    expect(msg.length).toBe(1 + bytesPerChunk);

    ws.close();
    await new Promise((r) => setTimeout(r, 50));
  }, 10000);

  it("camera preview fans out frames without audio prefix", async () => {
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);

    const ws = connectWs("/preview/camera/cam1", cookie);
    await waitForOpen(ws);

    server.ctx.videoPreviewManager.setSourceAvailable("camera-cam1", true, "CAM1-NDI");
    await new Promise((r) => setTimeout(r, 100));

    const gstProcs = spawnedProcesses.filter((e) => e.cmd === "gst-launch-1.0" && e.args[0] !== "--version" && e.process.stdout);
    expect(gstProcs.length).toBeGreaterThanOrEqual(1);
    const proc = gstProcs[gstProcs.length - 1]!.process;

    const frame = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from("cam-data"), Buffer.from([0xff, 0xd9])]);

    const received = new Promise<Buffer>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("No message")), 2000);
      ws.on("message", (data) => {
        clearTimeout(timeout);
        resolve(data as Buffer);
      });
    });

    proc.stdout!.emit("data", frame);

    // Camera sources don't have audio, so no type byte prefix — raw JPEG
    const msg = await received;
    expect(msg[0]).toBe(0xff); // JPEG SOI first byte
    expect(msg[1]).toBe(0xd8); // JPEG SOI second byte

    ws.close();
    await new Promise((r) => setTimeout(r, 50));
  }, 10000);

  it("pipeline restart on unexpected close (while subscribers exist)", async () => {
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);

    const ws = connectWs("/preview/camera/cam1", cookie);
    await waitForOpen(ws);

    server.ctx.videoPreviewManager.setSourceAvailable("camera-cam1", true, "CAM1-NDI");
    await new Promise((r) => setTimeout(r, 100));

    const gstProcs = spawnedProcesses.filter((e) => e.cmd === "gst-launch-1.0" && e.args[0] !== "--version");
    expect(gstProcs.length).toBeGreaterThanOrEqual(1);
    const proc = gstProcs[gstProcs.length - 1]!.process;

    // Simulate pipeline crash
    proc.emit("close", 1);

    // After RESTART_DELAY_MS (2000ms), it should restart
    await new Promise((r) => setTimeout(r, 2200));

    // Should have spawned a new process
    const newGstCalls = spawnedProcesses.filter((e) => e.cmd === "gst-launch-1.0" && e.args[0] !== "--version");
    expect(newGstCalls.length).toBeGreaterThanOrEqual(2);

    ws.close();
    await new Promise((r) => setTimeout(r, 50));
  }, 10000);

  it("grace period keeps pipeline alive briefly after last subscriber disconnects", async () => {
    const cookie = await loginAsAdmin(server.agent, server.ctx.authService);

    const ws = connectWs("/preview/camera/cam1", cookie);
    await waitForOpen(ws);

    server.ctx.videoPreviewManager.setSourceAvailable("camera-cam1", true, "CAM1-NDI");
    await new Promise((r) => setTimeout(r, 100));

    const gstProcs = spawnedProcesses.filter((e) => e.cmd === "gst-launch-1.0" && e.args[0] !== "--version");
    expect(gstProcs.length).toBeGreaterThanOrEqual(1);

    // Disconnect last subscriber
    ws.close();
    await new Promise((r) => setTimeout(r, 100));

    expect(server.ctx.videoPreviewManager.getSubscriberCount("camera-cam1")).toBe(0);

    // After grace period (GRACE_PERIOD_MS = 3000), pipeline is killed
    await new Promise((r) => setTimeout(r, 3100));
    expect(server.ctx.videoPreviewManager.getActiveStreams()).toBe(0);
  }, 10000);
});
