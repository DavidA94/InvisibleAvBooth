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
