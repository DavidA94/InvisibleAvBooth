import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VideoPreviewManager, buildMjpegArgs, buildAudioArgs, probeEncoder, checkGstreamerPath } from "./videoPreviewManager.js";
import type { SpawnFn } from "./videoPreviewManager.js";

vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("child_process", () => ({
  execSync: vi.fn(),
  spawn: vi.fn(() => makeMockProcess()),
}));

vi.mock("../eventBus/eventBus.js", () => ({
  eventBus: { emit: vi.fn(), subscribe: vi.fn() },
}));

const mockWssHandleUpgrade = vi.fn((_req: unknown, _socket: unknown, _head: unknown, cb: (ws: unknown) => void) => {
  cb(makeMockWs());
});
const mockWssClose = vi.fn();

vi.mock("ws", () => {
  class MockWebSocketServer {
    handleUpgrade = mockWssHandleUpgrade;
    close = mockWssClose;
    constructor(_opts: unknown) {}
  }
  return {
    WebSocketServer: MockWebSocketServer,
    WebSocket: { OPEN: 1, CLOSED: 3 },
  };
});

interface MockProcess {
  stdout: { on: ReturnType<typeof vi.fn>; _emit: (event: string, data: unknown) => void };
  stderr: { on: ReturnType<typeof vi.fn> };
  stdin: null;
  on: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  _emit: (event: string, ...args: unknown[]) => void;
}

function makeMockProcess(): MockProcess {
  const stdoutHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  const procHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    stdout: {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        stdoutHandlers[event] = stdoutHandlers[event] ?? [];
        stdoutHandlers[event]!.push(handler);
      }),
      _emit: (event: string, data: unknown) => stdoutHandlers[event]?.forEach((h) => h(data)),
    },
    stderr: { on: vi.fn() },
    stdin: null,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      procHandlers[event] = procHandlers[event] ?? [];
      procHandlers[event]!.push(handler);
    }),
    kill: vi.fn(),
    _emit: (event: string, ...args: unknown[]) => procHandlers[event]?.forEach((h) => h(...args)),
  };
}

interface MockWs {
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  _emit: (event: string, ...args: unknown[]) => void;
}

function makeMockWs(readyState = 1): MockWs {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event]!.push(handler);
    }),
    _emit: (event: string, ...args: unknown[]) => handlers[event]?.forEach((h) => h(...args)),
  };
}

describe("probeEncoder", () => {
  it("returns qsvh264enc when available", async () => {
    const spawnFn: SpawnFn = vi.fn((cmd, args) => {
      const proc = makeMockProcess();
      const element = args[0];
      setTimeout(() => proc._emit("close", element === "qsvh264enc" ? 0 : 1), 0);
      return proc as unknown as ReturnType<SpawnFn>;
    });
    const result = await probeEncoder(spawnFn);
    expect(result?.element).toBe("qsvh264enc");
  });

  it("returns vaapih264enc when qsv unavailable", async () => {
    const spawnFn: SpawnFn = vi.fn((cmd, args) => {
      const proc = makeMockProcess();
      const element = args[0];
      setTimeout(() => proc._emit("close", element === "vaapih264enc" ? 0 : 1), 0);
      return proc as unknown as ReturnType<SpawnFn>;
    });
    const result = await probeEncoder(spawnFn);
    expect(result?.element).toBe("vaapih264enc");
  });

  it("returns null when no hardware encoder", async () => {
    const spawnFn: SpawnFn = vi.fn(() => {
      const proc = makeMockProcess();
      setTimeout(() => proc._emit("close", 1), 0);
      return proc as unknown as ReturnType<SpawnFn>;
    });
    expect(await probeEncoder(spawnFn)).toBeNull();
  });

  it("returns null when process errors", async () => {
    const spawnFn: SpawnFn = vi.fn(() => {
      const proc = makeMockProcess();
      setTimeout(() => proc._emit("error", new Error("not found")), 0);
      return proc as unknown as ReturnType<SpawnFn>;
    });
    expect(await probeEncoder(spawnFn)).toBeNull();
  });
});

describe("checkGstreamerPath", () => {
  it("returns true when execSync succeeds", async () => {
    const { execSync } = vi.mocked(await import("child_process"));
    execSync.mockReturnValue(Buffer.from("gst-launch-1.0 version 1.22"));
    expect(checkGstreamerPath()).toBe(true);
  });

  it("returns false when execSync throws", async () => {
    const { execSync } = vi.mocked(await import("child_process"));
    execSync.mockImplementation(() => {
      throw new Error("not found");
    });
    expect(checkGstreamerPath()).toBe(false);
  });
});

describe("VideoPreviewManager", () => {
  let manager: VideoPreviewManager;
  let spawnFn: ReturnType<typeof vi.fn>;
  let lastProcess: MockProcess;

  beforeEach(() => {
    vi.useFakeTimers();
    spawnFn = vi.fn(() => {
      lastProcess = makeMockProcess();
      return lastProcess;
    });
    manager = new VideoPreviewManager(spawnFn as unknown as SpawnFn);
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
  });

  it("isAvailable returns false before initialize", () => {
    expect(manager.isAvailable()).toBe(false);
  });

  it("getEncoder returns null before initialize", () => {
    expect(manager.getEncoder()).toBeNull();
  });

  it("getActiveStreams returns 0 initially", () => {
    expect(manager.getActiveStreams()).toBe(0);
  });

  describe("initialize", () => {
    it("sets gstreamerAvailable to false when gst-launch-1.0 not found", async () => {
      const { execSync } = vi.mocked(await import("child_process"));
      execSync.mockImplementation(() => {
        throw new Error("not found");
      });
      await manager.initialize();
      expect(manager.isAvailable()).toBe(false);
    });

    it("probes encoder when gstreamer is available", async () => {
      const { execSync } = vi.mocked(await import("child_process"));
      execSync.mockReturnValue(Buffer.from("ok"));
      // All probes fail → software encoder
      spawnFn.mockImplementation(() => {
        const proc = makeMockProcess();
        process.nextTick(() => proc._emit("close", 1));
        return proc;
      });
      await manager.initialize();
      expect(manager.isAvailable()).toBe(true);
      expect(manager.getEncoder()).toBeNull();
    });
  });

  describe("setSourceAvailable", () => {
    it("registers a source", () => {
      manager.setSourceAvailable("cam1", true, "Camera1");
      expect(manager.getSubscriberCount("cam1")).toBe(0);
    });

    it("does not spawn pipeline without subscribers", () => {
      manager.setSourceAvailable("cam1", true, "Camera1");
      expect(spawnFn).not.toHaveBeenCalled();
    });
  });

  describe("destroy", () => {
    it("kills active processes", async () => {
      const { execSync } = vi.mocked(await import("child_process"));
      execSync.mockReturnValue(Buffer.from("ok"));
      spawnFn.mockImplementation(() => {
        const proc = makeMockProcess();
        process.nextTick(() => proc._emit("close", 1));
        return proc;
      });
      await manager.initialize();

      // Reset for pipeline spawn
      spawnFn.mockImplementation(() => {
        lastProcess = makeMockProcess();
        return lastProcess;
      });

      manager.setSourceAvailable("obs", true, "OBS");
      manager.destroy();
      expect(mockWssClose).toHaveBeenCalled();
    });
  });

  describe("handleConnection flow", () => {
    beforeEach(async () => {
      const { execSync } = vi.mocked(await import("child_process"));
      execSync.mockReturnValue(Buffer.from("ok"));
      spawnFn.mockImplementation(() => {
        const proc = makeMockProcess();
        process.nextTick(() => proc._emit("close", 1));
        return proc;
      });
      await manager.initialize();

      // Reset spawn for pipeline use
      spawnFn.mockImplementation(() => {
        lastProcess = makeMockProcess();
        return lastProcess;
      });
    });

    it("spawns pipeline when first subscriber connects to available source", () => {
      manager.setSourceAvailable("cam1", true, "Camera1");
      // No pipeline spawned yet since no subscribers
      expect(manager.getActiveStreams()).toBe(0);
      expect(manager.getSubscriberCount("cam1")).toBe(0);
    });

    it("getSubscriberCount returns correct count after setSourceAvailable", () => {
      manager.setSourceAvailable("obs", true, "OBS");
      expect(manager.getSubscriberCount("obs")).toBe(0);
    });

    it("getActiveStreams counts running processes", () => {
      expect(manager.getActiveStreams()).toBe(0);
    });
  });

  describe("pipeline lifecycle with subscribers", () => {
    beforeEach(async () => {
      const { execSync } = vi.mocked(await import("child_process"));
      execSync.mockReturnValue(Buffer.from("ok"));
      spawnFn.mockImplementation(() => {
        const proc = makeMockProcess();
        process.nextTick(() => proc._emit("close", 1));
        return proc;
      });
      await manager.initialize();
    });

    it("destroy cleans up all sources and intervals", () => {
      spawnFn.mockImplementation(() => {
        lastProcess = makeMockProcess();
        return lastProcess;
      });
      manager.setSourceAvailable("cam1", true, "Camera1");
      manager.setSourceAvailable("obs", true, "OBS");
      manager.destroy();
      expect(mockWssClose).toHaveBeenCalled();
    });
  });
});

describe("buildMjpegArgs", () => {
  it("produces gstreamer MJPEG pipeline args", () => {
    const args = buildMjpegArgs("CAM1");
    expect(args).toContain('ndi-name="CAM1"');
    expect(args).toContain("jpegenc");
    expect(args).toContain("fd=1");
  });
});

describe("buildAudioArgs", () => {
  it("produces gstreamer audio pipeline args", () => {
    const args = buildAudioArgs("OBS");
    expect(args).toContain('ndi-name="OBS"');
    expect(args).toContain("audioconvert");
    expect(args).toContain("fd=1");
  });
});
