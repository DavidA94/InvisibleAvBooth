import { describe, it, expect, vi, beforeEach } from "vitest";
import { eventBus } from "../../../eventBus/eventBus.js";
import { BUS_PLATFORM_STATE_CHANGED, BUS_PLATFORM_HEALTH_UPDATED, BUS_RELAY_STATE_CHANGED, BUS_PLATFORM_READINESS_CHANGED } from "../../../eventBus/types.js";
import { STC_PLATFORM_STATE, STC_PLATFORM_HEALTH, STC_RELAY_STATE, STC_PLATFORM_READINESS } from "@invisible-av-booth/shared";
import { StreamingPlatformModule } from "./streamingPlatformModule.js";
import type { StreamingPlatformService } from "../../../services/streamingPlatformService.js";
import type { RelayService } from "../../../services/relayService.js";
import type { AuthenticatedSocket } from "../socketModule.js";
import type { JwtPayload } from "../../../services/authService.js";

const fakeUser: JwtPayload = { sub: "u1", username: "admin", role: "ADMIN", iat: 0, exp: 9999999999 };

function makeMockPlatformService(): StreamingPlatformService {
  return {
    startAll: vi.fn().mockResolvedValue(undefined),
    startPlatform: vi.fn().mockResolvedValue(undefined),
    stopAll: vi.fn().mockResolvedValue(undefined),
    stopPlatform: vi.fn().mockResolvedValue(undefined),
    getPlatformStates: vi.fn().mockReturnValue(new Map([["youtube", { status: "idle" }]])),
    getPlatformHealth: vi.fn().mockReturnValue([{ platformType: "youtube", label: "YouTube", healthy: true }]),
    validateTokensOnStartup: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
  } as unknown as StreamingPlatformService;
}

function makeMockRelayService(): RelayService {
  return {
    getRelayState: vi.fn().mockReturnValue({ running: true, obsConnected: false }),
  } as unknown as RelayService;
}

const ioEmitMock = vi.fn();
const ioMock = { emit: ioEmitMock } as never;

const socketEmitMock = vi.fn();
const socketOnMock = vi.fn();
const socketMock = { emit: socketEmitMock, on: socketOnMock } as never;

beforeEach(() => {
  vi.resetAllMocks();
  eventBus.removeAllListeners();
});

describe("register", () => {
  it("forwards BUS events to Socket.io", () => {
    const mod = new StreamingPlatformModule(makeMockPlatformService(), makeMockRelayService());
    mod.register(ioMock);

    const payload = { platformId: "yt", state: { status: "streaming" } };
    eventBus.emit(BUS_PLATFORM_STATE_CHANGED, payload as never);
    expect(ioEmitMock).toHaveBeenCalledWith(STC_PLATFORM_STATE, payload);

    eventBus.emit(BUS_PLATFORM_HEALTH_UPDATED, { platformId: "yt", health: "good" } as never);
    expect(ioEmitMock).toHaveBeenCalledWith(STC_PLATFORM_HEALTH, expect.anything());

    eventBus.emit(BUS_RELAY_STATE_CHANGED, { running: true, obsConnected: true });
    expect(ioEmitMock).toHaveBeenCalledWith(STC_RELAY_STATE, expect.anything());

    eventBus.emit(BUS_PLATFORM_READINESS_CHANGED, { platforms: [] });
    expect(ioEmitMock).toHaveBeenCalledWith(STC_PLATFORM_READINESS, expect.anything());
  });
});

describe("registerSocket", () => {
  it("startAll command calls platformService.startAll", async () => {
    const svc = makeMockPlatformService();
    const mod = new StreamingPlatformModule(svc, makeMockRelayService());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let handler: any;
    socketOnMock.mockImplementation((_: string, fn: unknown) => {
      handler = fn;
    });
    mod.registerSocket({ socket: socketMock, jwtPayload: fakeUser } as AuthenticatedSocket);

    const ack = vi.fn();
    await handler({ type: "startAll" }, ack);
    expect(svc.startAll).toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith({ success: true });
  });

  it("startPlatform command calls platformService.startPlatform", async () => {
    const svc = makeMockPlatformService();
    const mod = new StreamingPlatformModule(svc, makeMockRelayService());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let handler: any;
    socketOnMock.mockImplementation((_: string, fn: unknown) => {
      handler = fn;
    });
    mod.registerSocket({ socket: socketMock, jwtPayload: fakeUser } as AuthenticatedSocket);

    const ack = vi.fn();
    await handler({ type: "startPlatform", platformType: "youtube" }, ack);
    expect(svc.startPlatform).toHaveBeenCalledWith("youtube");
    expect(ack).toHaveBeenCalledWith({ success: true });
  });

  it("startPlatform without platformType returns error", async () => {
    const svc = makeMockPlatformService();
    const mod = new StreamingPlatformModule(svc, makeMockRelayService());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let handler: any;
    socketOnMock.mockImplementation((_: string, fn: unknown) => {
      handler = fn;
    });
    mod.registerSocket({ socket: socketMock, jwtPayload: fakeUser } as AuthenticatedSocket);

    const ack = vi.fn();
    await handler({ type: "startPlatform" }, ack);
    expect(ack).toHaveBeenCalledWith({ success: false, error: "platformType required" });
  });

  it("stopAll command calls platformService.stopAll", async () => {
    const svc = makeMockPlatformService();
    const mod = new StreamingPlatformModule(svc, makeMockRelayService());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let handler: any;
    socketOnMock.mockImplementation((_: string, fn: unknown) => {
      handler = fn;
    });
    mod.registerSocket({ socket: socketMock, jwtPayload: fakeUser } as AuthenticatedSocket);

    const ack = vi.fn();
    await handler({ type: "stopAll" }, ack);
    expect(svc.stopAll).toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith({ success: true });
  });

  it("stopPlatform command calls platformService.stopPlatform", async () => {
    const svc = makeMockPlatformService();
    const mod = new StreamingPlatformModule(svc, makeMockRelayService());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let handler: any;
    socketOnMock.mockImplementation((_: string, fn: unknown) => {
      handler = fn;
    });
    mod.registerSocket({ socket: socketMock, jwtPayload: fakeUser } as AuthenticatedSocket);

    const ack = vi.fn();
    await handler({ type: "stopPlatform", platformType: "youtube" }, ack);
    expect(svc.stopPlatform).toHaveBeenCalledWith("youtube");
    expect(ack).toHaveBeenCalledWith({ success: true });
  });

  it("returns error on failure", async () => {
    const svc = makeMockPlatformService();
    (svc.startAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("busy"));
    const mod = new StreamingPlatformModule(svc, makeMockRelayService());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let handler: any;
    socketOnMock.mockImplementation((_: string, fn: unknown) => {
      handler = fn;
    });
    mod.registerSocket({ socket: socketMock, jwtPayload: fakeUser } as AuthenticatedSocket);

    const ack = vi.fn();
    await handler({ type: "startAll" }, ack);
    expect(ack).toHaveBeenCalledWith({ success: false, error: "busy" });
  });

  it("stopPlatform without platformType returns error", async () => {
    const svc = makeMockPlatformService();
    const mod = new StreamingPlatformModule(svc, makeMockRelayService());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let handler: any;
    socketOnMock.mockImplementation((_: string, fn: unknown) => {
      handler = fn;
    });
    mod.registerSocket({ socket: socketMock, jwtPayload: fakeUser } as AuthenticatedSocket);

    const ack = vi.fn();
    await handler({ type: "stopPlatform" }, ack);
    expect(ack).toHaveBeenCalledWith({ success: false, error: "platformType required" });
  });

  it("unknown command returns error", async () => {
    const svc = makeMockPlatformService();
    const mod = new StreamingPlatformModule(svc, makeMockRelayService());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let handler: any;
    socketOnMock.mockImplementation((_: string, fn: unknown) => {
      handler = fn;
    });
    mod.registerSocket({ socket: socketMock, jwtPayload: fakeUser } as AuthenticatedSocket);

    const ack = vi.fn();
    await handler({ type: "invalidCommand" }, ack);
    expect(ack).toHaveBeenCalledWith({ success: false, error: expect.stringContaining("Unknown command") });
  });
});

describe("emitInitialState", () => {
  it("emits platform states, relay state, and readiness", () => {
    const svc = makeMockPlatformService();
    const relay = makeMockRelayService();
    const mod = new StreamingPlatformModule(svc, relay);
    mod.emitInitialState({ socket: socketMock, jwtPayload: fakeUser } as AuthenticatedSocket);

    expect(socketEmitMock).toHaveBeenCalledWith(STC_PLATFORM_STATE, { platformId: "youtube", state: { status: "idle" } });
    expect(socketEmitMock).toHaveBeenCalledWith(STC_RELAY_STATE, { running: true, obsConnected: false });
    expect(socketEmitMock).toHaveBeenCalledWith(STC_PLATFORM_READINESS, { platforms: expect.any(Array) });
  });
});
