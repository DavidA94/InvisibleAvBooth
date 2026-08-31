import { describe, it, expect, vi, beforeEach } from "vitest";
import { AudioPreviewManager, parseMixerChannelPath, CLOSE_MALFORMED_PATH, CLOSE_UNKNOWN_CHANNEL } from "./audioPreviewManager.js";
import type { AudioCaptureService, AudioConsumer } from "../mixer/AudioCaptureService.js";
import { decodeEnvelopeFrame } from "@invisible-av-booth/shared";

vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock ws so handleUpgrade synchronously invokes the callback with a mock socket.
let lastWs: MockWs;
vi.mock("ws", () => {
  class MockWebSocketServer {
    handleUpgrade = vi.fn((_req: unknown, _socket: unknown, _head: unknown, cb: (ws: MockWs) => void) => {
      lastWs = makeMockWs();
      cb(lastWs);
    });
    close = vi.fn();
    constructor(_opts: unknown) {}
  }
  return { WebSocketServer: MockWebSocketServer, WebSocket: { OPEN: 1 } };
});

interface MockWs {
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  ping: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  emit: (event: string, ...args: unknown[]) => void;
}

function makeMockWs(): MockWs {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(),
    ping: vi.fn(),
    terminate: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event]!.push(handler);
    }),
    emit: (event: string, ...args: unknown[]) => handlers[event]?.forEach((h) => h(...args)),
  };
}

/** A fake capture service that records subscriptions and can push envelopes. */
interface FakeCapture {
  consumers: AudioConsumer[];
  unsubscribeCalls: number;
  subscribe: (consumer: AudioConsumer) => () => void;
  push: (channel: number, minDb: number, maxDb: number) => void;
  isAvailable: () => Promise<boolean>;
  destroy: () => void;
  getActiveChannelCount: () => number;
}

function makeFakeCapture(): FakeCapture {
  const consumers: AudioConsumer[] = [];
  let unsubscribeCalls = 0;
  return {
    consumers,
    get unsubscribeCalls() {
      return unsubscribeCalls;
    },
    subscribe(consumer: AudioConsumer) {
      consumers.push(consumer);
      return () => {
        unsubscribeCalls++;
        const index = consumers.indexOf(consumer);
        if (index >= 0) consumers.splice(index, 1);
      };
    },
    push(channel: number, minDb: number, maxDb: number) {
      for (const consumer of consumers) consumer.onEnvelope(channel, [{ minDb, maxDb }]);
    },
    isAvailable: async () => true,
    destroy: vi.fn(),
    getActiveChannelCount: () => consumers.length,
  };
}

/** Cast the fake to the manager's expected AudioCaptureService parameter. */
function asCapture(fake: FakeCapture): AudioCaptureService {
  return fake as unknown as AudioCaptureService;
}

const user = { id: "u1", username: "admin", role: "ADMIN" as const };

describe("parseMixerChannelPath", () => {
  it("parses a well-formed path", () => {
    expect(parseMixerChannelPath("/preview/mixer/mix1/channel/3")).toEqual({ mixerId: "mix1", channel: 3 });
  });
  it("returns null for a malformed path", () => {
    expect(parseMixerChannelPath("/preview/mixer/mix1")).toBeNull();
    expect(parseMixerChannelPath("/preview/mixer/mix1/channel/0")).toBeNull();
    expect(parseMixerChannelPath("/preview/obs")).toBeNull();
  });
});

describe("AudioPreviewManager", () => {
  let capture: FakeCapture;

  beforeEach(() => {
    capture = makeFakeCapture();
  });

  it("closes with a malformed-path code for an unparseable path", () => {
    const manager = new AudioPreviewManager(asCapture(capture), () => true);
    manager.handleUpgrade({ url: "/preview/mixer/mix1" } as never, {} as never, Buffer.alloc(0), user);
    expect(lastWs.close).toHaveBeenCalledWith(CLOSE_MALFORMED_PATH, expect.any(String));
    manager.destroy();
  });

  it("closes with a distinct unknown-channel code when the channel is not valid", () => {
    const manager = new AudioPreviewManager(asCapture(capture), () => false);
    manager.handleUpgrade({ url: "/preview/mixer/mix1/channel/99" } as never, {} as never, Buffer.alloc(0), user);
    expect(lastWs.close).toHaveBeenCalledWith(CLOSE_UNKNOWN_CHANNEL, expect.any(String));
    manager.destroy();
  });

  it("subscribes to capture and forwards envelope frames to the socket", () => {
    const manager = new AudioPreviewManager(asCapture(capture), () => true);
    manager.handleUpgrade({ url: "/preview/mixer/mix1/channel/2" } as never, {} as never, Buffer.alloc(0), user);
    expect(capture.consumers).toHaveLength(1);

    capture.push(2, -40, -12);
    expect(lastWs.send).toHaveBeenCalledTimes(1);
    const frame = lastWs.send.mock.calls[0]![0] as ArrayBuffer;
    const decoded = decodeEnvelopeFrame(frame);
    expect(decoded[0]!.minDb).toBeCloseTo(-40, 2);
    expect(decoded[0]!.maxDb).toBeCloseTo(-12, 2);
    manager.destroy();
  });

  it("ignores envelopes for other channels", () => {
    const manager = new AudioPreviewManager(asCapture(capture), () => true);
    manager.handleUpgrade({ url: "/preview/mixer/mix1/channel/2" } as never, {} as never, Buffer.alloc(0), user);
    capture.push(5, -40, -12); // different channel
    expect(lastWs.send).not.toHaveBeenCalled();
    manager.destroy();
  });

  it("unsubscribes from capture on socket close (teardown on disconnect)", () => {
    const manager = new AudioPreviewManager(asCapture(capture), () => true);
    manager.handleUpgrade({ url: "/preview/mixer/mix1/channel/2" } as never, {} as never, Buffer.alloc(0), user);
    expect(capture.consumers).toHaveLength(1);
    lastWs.emit("close");
    expect(capture.consumers).toHaveLength(0);
    expect(capture.unsubscribeCalls).toBe(1);
    manager.destroy();
  });

  it("is a dumb forwarder — stops forwarding when capture stops, never respawns", () => {
    // The manager has no respawn API; capture crash simply means no more onEnvelope
    // calls arrive. We assert the manager exposes no respawn hook and simply stops.
    const manager = new AudioPreviewManager(asCapture(capture), () => true);
    manager.handleUpgrade({ url: "/preview/mixer/mix1/channel/2" } as never, {} as never, Buffer.alloc(0), user);
    // No further pushes → no sends. Nothing on the manager triggers a capture respawn.
    expect(lastWs.send).not.toHaveBeenCalled();
    expect((manager as unknown as Record<string, unknown>)["respawn"]).toBeUndefined();
    manager.destroy();
  });
});
