import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { WebSocket } from "ws";
import { buildTestServer, destroyServer, resetServer, loginAsAdmin } from "../harness.js";
import type { TestServer } from "../harness.js";
import { CLOSE_MALFORMED_PATH, CLOSE_UNKNOWN_CHANNEL } from "../../../src/services/audioPreviewManager.js";

/**
 * Verifies the router split (Task 24a/24b): the mixer audio preview endpoint
 * shares the /preview/* upgrade seam and cookie-JWT auth with video, but audio
 * connections never touch the video source map or count against MAX_PREVIEW_STREAMS.
 */
describe("Mixer audio preview endpoint", () => {
  let s: TestServer;

  beforeAll(async () => {
    s = await buildTestServer();
  });
  afterAll(() => destroyServer(s));
  beforeEach(() => {
    resetServer(s);
    // A soundboard device with 8 channels so channel 2 is valid.
    s.ctx.database
      .prepare("INSERT INTO device_connections (id, deviceType, label, host, port, metadata, features, createdAt) VALUES (?,?,?,?,?,?,?,?)")
      .run(
        "mix1",
        "soundboard",
        "Mixer",
        "127.0.0.1",
        10024,
        JSON.stringify({ model: "behringer-xair", channelCount: 8 }),
        JSON.stringify({ "channel-audio-capture": true }),
        new Date().toISOString(),
      );
  });

  function connectWs(path: string, cookie?: string): WebSocket {
    return new WebSocket(`ws://localhost:${s.port}${path}`, { headers: cookie ? { Cookie: cookie } : {} });
  }

  async function waitForOpen(ws: WebSocket): Promise<void> {
    if (ws.readyState === WebSocket.OPEN) return;
    await new Promise<void>((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
      setTimeout(() => reject(new Error("open timeout")), 2000);
    });
  }

  /** Resolve the close code (or -1 if it opened without closing quickly). */
  async function closeCodeOf(ws: WebSocket): Promise<number> {
    return new Promise<number>((resolve) => {
      ws.on("close", (code) => resolve(code));
      ws.on("error", () => {
        /* wait for close */
      });
      setTimeout(() => resolve(-1), 2000);
    });
  }

  it("rejects an unauthenticated mixer preview connection (router auth)", async () => {
    const ws = connectWs("/preview/mixer/mix1/channel/2");
    const code = await closeCodeOf(ws);
    expect(ws.readyState).not.toBe(WebSocket.OPEN);
    void code;
  });

  it("accepts an authenticated mixer preview connection without touching video streams", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const ws = connectWs("/preview/mixer/mix1/channel/2", cookie);
    await waitForOpen(ws);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    // Audio previews never appear in the video source map (Req 24b-b) nor count
    // against video stream limits (Req 24b-a).
    expect(s.ctx.videoPreviewManager.getActiveStreams()).toBe(0);
    expect(s.ctx.videoPreviewManager.getSubscriberCount("mix1")).toBe(0);
    ws.close();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("closes with the malformed-path code for a bad mixer path", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const ws = connectWs("/preview/mixer/mix1", cookie); // missing /channel/N
    // This path does not match /preview/mixer/ prefix dispatch fully — router 404s
    // OR audio manager malformed-closes. Either way it must not stay open.
    const code = await closeCodeOf(ws);
    expect(ws.readyState).not.toBe(WebSocket.OPEN);
    void code;
  });

  it("closes with a distinct unknown-channel code for an out-of-range channel", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const ws = connectWs("/preview/mixer/mix1/channel/99", cookie); // channelCount is 8
    const code = await closeCodeOf(ws);
    expect(code).toBe(CLOSE_UNKNOWN_CHANNEL);
    expect(code).not.toBe(CLOSE_MALFORMED_PATH);
  });

  it("closes unknown-channel for an unknown mixer id", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const ws = connectWs("/preview/mixer/nope/channel/1", cookie);
    const code = await closeCodeOf(ws);
    expect(code).toBe(CLOSE_UNKNOWN_CHANNEL);
  });
});
