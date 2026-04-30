import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RelayService } from "./relayService.js";
import type { NmsInstance, NmsFactory, SpawnFn } from "./relayService.js";
import { eventBus } from "../eventBus/eventBus.js";
import { BUS_RELAY_STATE_CHANGED, BUS_FORWARDER_EXITED } from "../eventBus/types.js";
import { EventEmitter } from "events";

// ── Mock NMS ──────────────────────────────────────────────────────────────────

type NmsHandler = (id: string, streamPath: string, args: object) => void;

function makeMockNms() {
  const handlers: Record<string, NmsHandler[]> = {};
  const mock: NmsInstance & { fire(event: string, id: string, path: string, args?: object): void } = {
    run: vi.fn(),
    stop: vi.fn(),
    on: vi.fn((event: string, handler: NmsHandler) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event]!.push(handler);
    }),
    fire(event: string, id: string, path: string, args: object = {}) {
      handlers[event]?.forEach((handler) => handler(id, path, args));
    },
  };
  return mock;
}

// ── Mock spawn ────────────────────────────────────────────────────────────────

function makeMockChild(exitCode = 0) {
  const child = new EventEmitter() as EventEmitter & {
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
    pid: number;
  };
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  child.pid = 12345;

  // Auto-emit close for ffmpeg -version checks
  if (exitCode >= 0) {
    setTimeout(() => child.emit("close", exitCode, null), 0);
  }
  return child;
}

function makeMockSpawn(children: Array<ReturnType<typeof makeMockChild>> = []) {
  let callIndex = 0;
  return vi.fn(() => {
    const child = children[callIndex] ?? makeMockChild(0);
    callIndex++;
    return child;
  }) as unknown as SpawnFn;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let mockNms: ReturnType<typeof makeMockNms>;
let nmsFactory: NmsFactory;
let service: RelayService;

beforeEach(() => {
  mockNms = makeMockNms();
  nmsFactory = vi.fn(() => mockNms);
  eventBus.removeAllListeners();
});

afterEach(() => {
  service?.stop();
  eventBus.removeAllListeners();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RelayService", () => {
  describe("start / stop", () => {
    it("starts NMS and emits running state", async () => {
      const spawnFn = makeMockSpawn();
      service = new RelayService(nmsFactory, spawnFn);

      const states: Array<{ running: boolean; obsConnected: boolean }> = [];
      eventBus.subscribe(BUS_RELAY_STATE_CHANGED, (payload) => states.push(payload));

      await service.start();

      expect(mockNms.run).toHaveBeenCalled();
      expect(service.getRelayState()).toEqual({ running: true, obsConnected: false });
      expect(states).toContainEqual({ running: true, obsConnected: false });
    });

    it("stops NMS and resets state", async () => {
      const spawnFn = makeMockSpawn();
      service = new RelayService(nmsFactory, spawnFn);
      await service.start();

      service.stop();

      expect(mockNms.stop).toHaveBeenCalled();
      expect(service.getRelayState()).toEqual({ running: false, obsConnected: false });
    });

    it("verifies FFmpeg on start", async () => {
      const failChild = makeMockChild(-1);
      const spawnFn = makeMockSpawn([failChild]);
      service = new RelayService(nmsFactory, spawnFn);

      // Emit error instead of close
      setTimeout(() => failChild.emit("error", new Error("ENOENT")), 0);

      await expect(service.start()).rejects.toThrow("FFmpeg not found");
    });

    it("rejects when FFmpeg exits with non-zero code", async () => {
      const failChild = makeMockChild(1);
      const spawnFn = makeMockSpawn([failChild]);
      service = new RelayService(nmsFactory, spawnFn);

      await expect(service.start()).rejects.toThrow("FFmpeg exited with code 1");
    });
  });

  describe("OBS connection detection", () => {
    it("detects OBS connect via postPublish", async () => {
      const spawnFn = makeMockSpawn();
      service = new RelayService(nmsFactory, spawnFn);
      await service.start();

      const states: Array<{ running: boolean; obsConnected: boolean }> = [];
      eventBus.subscribe(BUS_RELAY_STATE_CHANGED, (payload) => states.push(payload));

      mockNms.fire("postPublish", "session-1", "/live/stream");

      expect(service.getRelayState().obsConnected).toBe(true);
      expect(states).toContainEqual({ running: true, obsConnected: true });
    });

    it("detects OBS disconnect via donePublish", async () => {
      const spawnFn = makeMockSpawn();
      service = new RelayService(nmsFactory, spawnFn);
      await service.start();

      mockNms.fire("postPublish", "session-1", "/live/stream");
      expect(service.getRelayState().obsConnected).toBe(true);

      mockNms.fire("donePublish", "session-1", "/live/stream");
      expect(service.getRelayState().obsConnected).toBe(false);
    });

    it("ignores postPublish on non-matching paths", async () => {
      const spawnFn = makeMockSpawn();
      service = new RelayService(nmsFactory, spawnFn);
      await service.start();

      mockNms.fire("postPublish", "session-1", "/other/path");
      expect(service.getRelayState().obsConnected).toBe(false);
    });
  });

  describe("prePublish rejection", () => {
    it("rejects publish to invalid path", async () => {
      const spawnFn = makeMockSpawn();
      service = new RelayService(nmsFactory, spawnFn);
      await service.start();

      const reject = vi.fn();
      mockNms.fire("prePublish", "session-1", "/wrong/path", { reject });

      expect(reject).toHaveBeenCalled();
    });

    it("rejects second concurrent publisher", async () => {
      const spawnFn = makeMockSpawn();
      service = new RelayService(nmsFactory, spawnFn);
      await service.start();

      // First publisher connects
      mockNms.fire("postPublish", "session-1", "/live/stream");
      expect(service.getRelayState().obsConnected).toBe(true);

      // Second publisher tries to connect
      const reject = vi.fn();
      mockNms.fire("prePublish", "session-2", "/live/stream", { reject });

      expect(reject).toHaveBeenCalled();
    });

    it("allows first publisher on valid path", async () => {
      const spawnFn = makeMockSpawn();
      service = new RelayService(nmsFactory, spawnFn);
      await service.start();

      const reject = vi.fn();
      mockNms.fire("prePublish", "session-1", "/live/stream", { reject });

      expect(reject).not.toHaveBeenCalled();
    });
  });

  describe("FFmpeg forwarders", () => {
    it("spawns a forwarder process", async () => {
      const forwarderChild = makeMockChild(-1); // Don't auto-close
      const ffmpegCheck = makeMockChild(0);
      const spawnFn = makeMockSpawn([ffmpegCheck, forwarderChild]);
      service = new RelayService(nmsFactory, spawnFn);
      await service.start();

      service.startForwarder("youtube", "rtmp://youtube.com/live/key123");

      // Second call is the forwarder (first was ffmpeg -version)
      expect(spawnFn).toHaveBeenCalledTimes(2);
      expect(spawnFn).toHaveBeenLastCalledWith(
        "ffmpeg",
        ["-i", "rtmp://127.0.0.1:1935/live/stream", "-c", "copy", "-f", "flv", "rtmp://youtube.com/live/key123"],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
    });

    it("kills a forwarder process", async () => {
      const forwarderChild = makeMockChild(-1);
      const ffmpegCheck = makeMockChild(0);
      const spawnFn = makeMockSpawn([ffmpegCheck, forwarderChild]);
      service = new RelayService(nmsFactory, spawnFn);
      await service.start();

      service.startForwarder("youtube", "rtmp://youtube.com/live/key123");
      service.stopForwarder("youtube");

      expect(forwarderChild.kill).toHaveBeenCalledWith("SIGTERM");
    });

    it("does not spawn duplicate forwarder for same platform", async () => {
      const child1 = makeMockChild(-1);
      const child2 = makeMockChild(-1);
      const ffmpegCheck = makeMockChild(0);
      const spawnFn = makeMockSpawn([ffmpegCheck, child1, child2]);
      service = new RelayService(nmsFactory, spawnFn);
      await service.start();

      service.startForwarder("youtube", "rtmp://youtube.com/live/key1");
      service.startForwarder("youtube", "rtmp://youtube.com/live/key2");

      // Only ffmpeg -version + one forwarder
      expect(spawnFn).toHaveBeenCalledTimes(2);
    });

    it("emits BUS_FORWARDER_EXITED on forwarder close", async () => {
      const forwarderChild = makeMockChild(-1);
      const ffmpegCheck = makeMockChild(0);
      const spawnFn = makeMockSpawn([ffmpegCheck, forwarderChild]);
      service = new RelayService(nmsFactory, spawnFn);
      await service.start();

      const exits: Array<{ platformId: string; code: number | null }> = [];
      eventBus.subscribe(BUS_FORWARDER_EXITED, (payload) => exits.push(payload));

      service.startForwarder("youtube", "rtmp://youtube.com/live/key123");
      forwarderChild.emit("close", 1, null);

      expect(exits).toHaveLength(1);
      expect(exits[0]).toMatchObject({ platformId: "youtube", code: 1 });
    });

    it("retains last 50 lines of stderr", async () => {
      const forwarderChild = makeMockChild(-1);
      const ffmpegCheck = makeMockChild(0);
      const spawnFn = makeMockSpawn([ffmpegCheck, forwarderChild]);
      service = new RelayService(nmsFactory, spawnFn);
      await service.start();

      const exits: Array<{ lastStderr: string[] }> = [];
      eventBus.subscribe(BUS_FORWARDER_EXITED, (payload) => exits.push(payload));

      service.startForwarder("youtube", "rtmp://youtube.com/live/key123");

      // Push 60 lines of stderr
      const lines = Array.from({ length: 60 }, (_, index) => `line-${index}`).join("\n");
      forwarderChild.stderr.emit("data", Buffer.from(lines));

      forwarderChild.emit("close", 0, null);

      expect(exits[0]!.lastStderr).toHaveLength(50);
      expect(exits[0]!.lastStderr[0]).toBe("line-10");
      expect(exits[0]!.lastStderr[49]).toBe("line-59");
    });

    it("kills all forwarders on stop", async () => {
      const child1 = makeMockChild(-1);
      const child2 = makeMockChild(-1);
      const ffmpegCheck = makeMockChild(0);
      const spawnFn = makeMockSpawn([ffmpegCheck, child1, child2]);
      service = new RelayService(nmsFactory, spawnFn);
      await service.start();

      service.startForwarder("youtube", "rtmp://youtube.com/live/key1");
      // Need to manually add second since first spawn call was ffmpeg -version
      // and the mock increments. Let's just start a second forwarder with different ID.
      // But child1 is already used for youtube. We need to stop youtube first or use different platform.
      service.startForwarder("facebook", "rtmp://facebook.com/live/key2");

      service.stop();

      expect(child1.kill).toHaveBeenCalledWith("SIGTERM");
      expect(child2.kill).toHaveBeenCalledWith("SIGTERM");
    });
  });

  describe("crash recovery", () => {
    it("retries up to 3 times on crash", async () => {
      const spawnFn = makeMockSpawn();
      service = new RelayService(nmsFactory, spawnFn);
      await service.start();

      // Use fake timers for crash recovery delays
      vi.useFakeTimers();

      const states: Array<{ running: boolean }> = [];
      eventBus.subscribe(BUS_RELAY_STATE_CHANGED, (payload) => states.push(payload));

      // Simulate 3 crashes — each should recover
      for (let attempt = 0; attempt < MAX_CRASH_RETRIES; attempt++) {
        const crashPromise = service.simulateCrash();
        await vi.advanceTimersByTimeAsync(5000);
        await crashPromise;
      }

      // After 3 recoveries, NMS should have been created 4 times total (1 initial + 3 retries)
      // nmsFactory: 1 (start) + 3 (crash recoveries) = 4
      expect(nmsFactory).toHaveBeenCalledTimes(4);

      vi.useRealTimers();
    });

    it("stops retrying after 3 crash attempts", async () => {
      const spawnFn = makeMockSpawn();
      service = new RelayService(nmsFactory, spawnFn);
      await service.start();

      vi.useFakeTimers();

      // Exhaust all 3 retries
      for (let attempt = 0; attempt < MAX_CRASH_RETRIES; attempt++) {
        const crashPromise = service.simulateCrash();
        await vi.advanceTimersByTimeAsync(5000);
        await crashPromise;
      }

      // 4th crash should not retry
      const crashPromise = service.simulateCrash();
      await vi.advanceTimersByTimeAsync(5000);
      await crashPromise;

      // Still 4 calls (1 initial + 3 retries), not 5
      expect(nmsFactory).toHaveBeenCalledTimes(4);
      expect(service.getRelayState().running).toBe(false);

      vi.useRealTimers();
    });

    it("emits state changes during crash recovery", async () => {
      const spawnFn = makeMockSpawn();
      service = new RelayService(nmsFactory, spawnFn);
      await service.start();

      vi.useFakeTimers();

      const states: boolean[] = [];
      eventBus.subscribe(BUS_RELAY_STATE_CHANGED, (payload) => states.push(payload.running));

      const crashPromise = service.simulateCrash();
      // Should emit running=false immediately (synchronous part of handleCrash)
      expect(states).toContain(false);

      await vi.advanceTimersByTimeAsync(5000);
      await crashPromise;

      // Should emit running=true after recovery
      expect(states[states.length - 1]).toBe(true);

      vi.useRealTimers();
    });
  });
});

const MAX_CRASH_RETRIES = 3;
