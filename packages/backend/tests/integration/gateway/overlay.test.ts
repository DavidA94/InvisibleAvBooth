import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { io as ioClient } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { buildTestServer, resetServer, destroyServer } from "../harness.js";
import type { TestServer } from "../harness.js";
import { STO_LOWER_THIRD_STATE, OTS_LOWER_THIRD_PHASE, OTS_LOWER_THIRD_RESOLUTION } from "@invisible-av-booth/shared";

let s: TestServer;

beforeAll(async () => {
  s = await buildTestServer({ seedKjv: true });
});
afterAll(() => destroyServer(s));
beforeEach(() => resetServer(s));

function connectOverlay(): Socket {
  return ioClient(`http://localhost:${s.port}/overlay`, {
    transports: ["websocket"],
    autoConnect: true,
  });
}

describe("/overlay namespace", () => {
  it("connects without authentication", async () => {
    const socket = connectOverlay();
    await new Promise<void>((resolve) => socket.on("connect", resolve));
    expect(socket.connected).toBe(true);
    socket.disconnect();
  });

  it("receives initial state on connection", async () => {
    const socket = connectOverlay();
    const state = await new Promise<Record<string, unknown>>((resolve) => {
      socket.on(STO_LOWER_THIRD_STATE, (data: Record<string, unknown>) => resolve(data));
    });
    expect(state).toHaveProperty("phase", "hidden");
    expect(state).toHaveProperty("active", null);
    expect(state).toHaveProperty("library");
    expect(state).toHaveProperty("skipEntrance");
    socket.disconnect();
  });

  it("forcibly disconnects previous overlay client on new connection", async () => {
    const socket1 = connectOverlay();
    await new Promise<void>((resolve) => socket1.on("connect", resolve));

    const disconnectPromise = new Promise<void>((resolve) => socket1.on("disconnect", resolve));

    const socket2 = connectOverlay();
    await new Promise<void>((resolve) => socket2.on("connect", resolve));

    await disconnectPromise;
    expect(socket1.connected).toBe(false);
    expect(socket2.connected).toBe(true);

    socket2.disconnect();
  });

  it("accepts phase reports from overlay", async () => {
    const socket = connectOverlay();
    await new Promise<void>((resolve) => socket.on("connect", resolve));

    // Emit a phase report — should not throw
    socket.emit(OTS_LOWER_THIRD_PHASE, "visible");

    // Give it a tick to process
    await new Promise((r) => setTimeout(r, 50));
    socket.disconnect();
  });

  it("accepts resolution telemetry", async () => {
    const socket = connectOverlay();
    await new Promise<void>((resolve) => socket.on("connect", resolve));

    socket.emit(OTS_LOWER_THIRD_RESOLUTION, { width: 1920, height: 1080, isCorrect: true });

    await new Promise((r) => setTimeout(r, 50));
    expect(s.ctx.lowerThirdService.getFullState().overlayResolutionCorrect).toBe(true);
    socket.disconnect();
  });

  it("updates overlayConnected state on connect/disconnect", async () => {
    const socket = connectOverlay();
    await new Promise<void>((resolve) => socket.on("connect", resolve));
    await new Promise((r) => setTimeout(r, 50));
    expect(s.ctx.lowerThirdService.getFullState().overlayConnected).toBe(true);

    socket.disconnect();
    await new Promise((r) => setTimeout(r, 100));
    expect(s.ctx.lowerThirdService.getFullState().overlayConnected).toBe(false);
  });
});
