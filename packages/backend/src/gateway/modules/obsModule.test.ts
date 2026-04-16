import { describe, it, expect, vi, afterEach } from "vitest";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { io as ioClient } from "socket.io-client";
import type { Socket as ClientSocket } from "socket.io-client";
import { ObsModule } from "./obsModule.js";
import { eventBus } from "../../eventBus.js";
import { BUS_OBS_STATE_CHANGED, BUS_OBS_ERROR, BUS_OBS_ERROR_RESOLVED, BUS_DEVICE_CAPABILITIES_UPDATED } from "../../socketEvents.js";
import type { ObsState } from "../../eventBus.js";
import type { JwtPayload } from "../../services/authService.js";

const idleState: ObsState = {
  connected: true,
  streaming: false,
  recording: false,
  commandedState: { streaming: false, recording: false },
};

const fakePayload: JwtPayload = { sub: "u1", username: "user", role: "ADMIN", iat: 0, exp: 9999999999 };

function makeMockObsService() {
  return {
    getState: vi.fn().mockReturnValue(idleState),
    startStream: vi.fn().mockResolvedValue({ success: true, value: idleState }),
    stopStream: vi.fn().mockResolvedValue({ success: true, value: idleState }),
    startRecording: vi.fn().mockResolvedValue({ success: true, value: idleState }),
    stopRecording: vi.fn().mockResolvedValue({ success: true, value: idleState }),
    reconnect: vi.fn().mockResolvedValue({ success: true, value: undefined }),
  };
}

async function buildTestServer(module: ObsModule) {
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
  return { httpServer, io, port };
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

describe("ObsModule — register (EventBus → stc: broadcasts)", () => {
  it("broadcasts stc:obs:state when bus:obs:state:changed fires", async () => {
    const obsService = makeMockObsService();
    const { httpServer, port } = await buildTestServer(new ObsModule(obsService as never));
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port);
    cleanups.push(() => client.close());

    const received = await new Promise<ObsState>((resolve) => {
      client.on("stc:obs:state", resolve);
      eventBus.emit(BUS_OBS_STATE_CHANGED, { state: { ...idleState, connected: false } });
    });

    expect(received.connected).toBe(false);
  });

  it("broadcasts stc:obs:error when bus:obs:error fires", async () => {
    const { httpServer, port } = await buildTestServer(new ObsModule(makeMockObsService() as never));
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port);
    cleanups.push(() => client.close());

    const received = await new Promise<{ error: { code: string } }>((resolve) => {
      client.on("stc:obs:error", resolve);
      const error = Object.assign(new Error("fail"), { code: "OBS_UNREACHABLE" as const, name: "ObsError" });
      eventBus.emit(BUS_OBS_ERROR, { error: error as never, retryExhausted: false, context: { streaming: false, recording: false } });
    });

    expect(received.error.code).toBe("OBS_UNREACHABLE");
  });

  it("broadcasts stc:obs:error:resolved when bus:obs:error:resolved fires", async () => {
    const { httpServer, port } = await buildTestServer(new ObsModule(makeMockObsService() as never));
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port);
    cleanups.push(() => client.close());

    const received = await new Promise<{ errorCode: string }>((resolve) => {
      client.on("stc:obs:error:resolved", resolve);
      eventBus.emit(BUS_OBS_ERROR_RESOLVED, { errorCode: "OBS_UNREACHABLE" });
    });

    expect(received.errorCode).toBe("OBS_UNREACHABLE");
  });

  it("broadcasts stc:device:capabilities when bus:device:capabilities:updated fires", async () => {
    const { httpServer, port } = await buildTestServer(new ObsModule(makeMockObsService() as never));
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port);
    cleanups.push(() => client.close());

    const received = await new Promise<{ deviceId: string }>((resolve) => {
      client.on("stc:device:capabilities", resolve);
      eventBus.emit(BUS_DEVICE_CAPABILITIES_UPDATED, {
        deviceId: "obs-1",
        capabilities: { deviceId: "obs-1", deviceType: "obs", features: {} },
      });
    });

    expect(received.deviceId).toBe("obs-1");
  });
});

describe("ObsModule — registerSocket (cts: commands)", () => {
  it("routes cts:obs:command startStream to obsService.startStream", async () => {
    const obsService = makeMockObsService();
    const { httpServer, port } = await buildTestServer(new ObsModule(obsService as never));
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port);
    cleanups.push(() => client.close());

    const result = await new Promise<{ success: boolean }>((resolve) => {
      client.emit("cts:obs:command", { type: "startStream" }, resolve);
    });

    expect(obsService.startStream).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
  });

  it("routes cts:obs:command stopStream to obsService.stopStream", async () => {
    const obsService = makeMockObsService();
    const { httpServer, port } = await buildTestServer(new ObsModule(obsService as never));
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port);
    cleanups.push(() => client.close());

    await new Promise<void>((resolve) => {
      client.emit("cts:obs:command", { type: "stopStream" }, () => resolve());
    });
    expect(obsService.stopStream).toHaveBeenCalledOnce();
  });

  it("routes cts:obs:command startRecording to obsService.startRecording", async () => {
    const obsService = makeMockObsService();
    const { httpServer, port } = await buildTestServer(new ObsModule(obsService as never));
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port);
    cleanups.push(() => client.close());

    await new Promise<void>((resolve) => {
      client.emit("cts:obs:command", { type: "startRecording" }, () => resolve());
    });
    expect(obsService.startRecording).toHaveBeenCalledOnce();
  });

  it("routes cts:obs:command stopRecording to obsService.stopRecording", async () => {
    const obsService = makeMockObsService();
    const { httpServer, port } = await buildTestServer(new ObsModule(obsService as never));
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port);
    cleanups.push(() => client.close());

    await new Promise<void>((resolve) => {
      client.emit("cts:obs:command", { type: "stopRecording" }, () => resolve());
    });
    expect(obsService.stopRecording).toHaveBeenCalledOnce();
  });

  it("returns success: false for unknown command type", async () => {
    const { httpServer, port } = await buildTestServer(new ObsModule(makeMockObsService() as never));
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port);
    cleanups.push(() => client.close());

    const result = await new Promise<{ success: boolean }>((resolve) => {
      client.emit("cts:obs:command", { type: "unknown" }, resolve);
    });
    expect(result.success).toBe(false);
  });

  it("routes cts:obs:reconnect to obsService.reconnect", async () => {
    const obsService = makeMockObsService();
    const { httpServer, port } = await buildTestServer(new ObsModule(obsService as never));
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port);
    cleanups.push(() => client.close());

    const result = await new Promise<{ success: boolean }>((resolve) => {
      client.emit("cts:obs:reconnect", resolve);
    });
    expect(obsService.reconnect).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
  });
});

describe("ObsModule — emitInitialState", () => {
  it("emits stc:obs:state on connect with current OBS state", async () => {
    const obsService = makeMockObsService();
    const { httpServer, port } = await buildTestServer(new ObsModule(obsService as never));
    cleanups.push(() => httpServer.close());

    const received = await new Promise<ObsState>((resolve) => {
      const client = ioClient(`http://localhost:${port}`);
      client.on("stc:obs:state", (state) => {
        resolve(state as ObsState);
        client.close();
      });
    });

    expect(received).toMatchObject(idleState);
  });
});

describe("ObsModule — service error propagation", () => {
  it("returns success: false when obsService.startStream fails", async () => {
    const obsService = makeMockObsService();
    const error = Object.assign(new Error("failed"), { code: "STREAM_START_FAILED" as const, name: "ObsError" });
    obsService.startStream.mockResolvedValueOnce({ success: false, error });
    const { httpServer, port } = await buildTestServer(new ObsModule(obsService as never));
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port);
    cleanups.push(() => client.close());

    const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      client.emit("cts:obs:command", { type: "startStream" }, resolve);
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("failed");
  });
});
