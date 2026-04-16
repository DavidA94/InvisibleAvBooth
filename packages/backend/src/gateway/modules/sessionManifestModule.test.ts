import { describe, it, expect, vi, afterEach } from "vitest";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { io as ioClient } from "socket.io-client";
import type { Socket as ClientSocket } from "socket.io-client";
import { SessionManifestModule } from "./sessionManifestModule.js";
import { eventBus } from "../../eventBus.js";
import { BUS_SESSION_MANIFEST_UPDATED } from "../../socketEvents.js";
import type { JwtPayload } from "../../services/authService.js";

const fakePayload: JwtPayload = { sub: "u1", username: "user", role: "ADMIN", iat: 0, exp: 9999999999 };

function makeMockManifestService() {
  return {
    get: vi.fn().mockReturnValue({ speaker: "John" }),
    update: vi.fn().mockReturnValue({ success: true, value: { speaker: "John" } }),
    interpolate: vi.fn().mockReturnValue("Today – John – Grace"),
  };
}

async function buildTestServer(module: SessionManifestModule) {
  const httpServer = createServer();
  const io = new SocketServer(httpServer, { cors: { origin: "*" } });
  module.register(io);
  io.on("connection", (socket) => {
    const auth = { socket, jwtPayload: fakePayload };
    module.registerSocket(auth);
    module.emitInitialState(auth);
  });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as { port: number }).port;
  return { httpServer, port };
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.forEach((fn) => fn());
  cleanups.length = 0;
  vi.restoreAllMocks();
});

function connectClient(port: number): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = ioClient(`http://localhost:${port}`);
    client.on("connect", () => resolve(client));
    client.on("connect_error", reject);
  });
}

describe("SessionManifestModule — register (EventBus → stc: broadcasts)", () => {
  it("broadcasts stc:session:manifest:updated when bus:session:manifest:updated fires", async () => {
    const { httpServer, port } = await buildTestServer(new SessionManifestModule(makeMockManifestService() as never));
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port);
    cleanups.push(() => client.close());

    // Wait past the initial state emission
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    const received = await new Promise<{ interpolatedStreamTitle: string }>((resolve) => {
      client.on("stc:session:manifest:updated", (payload) => {
        if ((payload as { interpolatedStreamTitle: string }).interpolatedStreamTitle === "EventBus Title") {
          resolve(payload as { interpolatedStreamTitle: string });
        }
      });
      eventBus.emit(BUS_SESSION_MANIFEST_UPDATED, { manifest: {}, interpolatedStreamTitle: "EventBus Title" });
    });

    expect(received.interpolatedStreamTitle).toBe("EventBus Title");
  });
});

describe("SessionManifestModule — registerSocket (cts: commands)", () => {
  it("routes cts:session:manifest:update to manifestService.update", async () => {
    const manifestService = makeMockManifestService();
    const { httpServer, port } = await buildTestServer(new SessionManifestModule(manifestService as never));
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port);
    cleanups.push(() => client.close());

    const result = await new Promise<{ success: boolean }>((resolve) => {
      client.emit("cts:session:manifest:update", { speaker: "Jane" }, resolve);
    });

    expect(manifestService.update).toHaveBeenCalledWith({ speaker: "Jane" }, fakePayload);
    expect(result.success).toBe(true);
  });

  it("returns success: false when update fails", async () => {
    const manifestService = makeMockManifestService();
    manifestService.update.mockReturnValueOnce({ success: false, error: { code: "CLEAR_BLOCKED_WHILE_LIVE", message: "blocked" } });
    const { httpServer, port } = await buildTestServer(new SessionManifestModule(manifestService as never));
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port);
    cleanups.push(() => client.close());

    const result = await new Promise<{ success: boolean }>((resolve) => {
      client.emit("cts:session:manifest:update", {}, resolve);
    });
    expect(result.success).toBe(false);
  });
});

describe("SessionManifestModule — emitInitialState", () => {
  it("emits stc:session:manifest:updated on connect with current manifest", async () => {
    const manifestService = makeMockManifestService();
    const { httpServer, port } = await buildTestServer(new SessionManifestModule(manifestService as never));
    cleanups.push(() => httpServer.close());

    const received = await new Promise<{ interpolatedStreamTitle: string }>((resolve) => {
      const client = ioClient(`http://localhost:${port}`);
      client.on("stc:session:manifest:updated", (payload) => {
        resolve(payload as { interpolatedStreamTitle: string });
        client.close();
      });
    });

    expect(received.interpolatedStreamTitle).toBe("Today – John – Grace");
  });
});
