import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter, Readable } from "stream";
import {
  PreviewStreamManager,
  buildFfmpegArgs,
  probeEncoder,
  checkFfmpegPath,
  PREVIEW_RESOLUTION,
  MAX_PREVIEW_STREAMS,
  GRACE_PERIOD_MS,
  MAX_RESTART_ATTEMPTS,
  RESTART_DELAY_MS,
} from "./previewStreamManager.js";
import type { SpawnFn } from "./previewStreamManager.js";
import type { ChildProcess } from "child_process";
import type { AuthService } from "./authService.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createFakeAuthService(valid = true) {
  return {
    verifyToken: vi.fn((_token: string) =>
      valid
        ? { success: true, value: { sub: "u1", username: "admin", role: "ADMIN" as const, iat: 0, exp: 9e9 } }
        : { success: false, error: new Error("Invalid") },
    ),
  } as unknown as AuthService;
}

interface FakeProc extends EventEmitter {
  stdout: Readable;
  stderr: Readable;
  kill: ReturnType<typeof vi.fn>;
}

function createFakeProcess(): FakeProc {
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const proc = new EventEmitter() as FakeProc;
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.kill = vi.fn().mockReturnValue(true);
  return proc;
}

function makeSpawn(): { spawn: SpawnFn; procs: FakeProc[] } {
  const procs: FakeProc[] = [];
  const spawn: SpawnFn = () => {
    const proc = createFakeProcess();
    procs.push(proc);
    return proc as unknown as ChildProcess;
  };
  return { spawn, procs };
}

// ── Tests: buildFfmpegArgs ───────────────────────────────────────────────────

describe("buildFfmpegArgs", () => {
  it("produces software encoder args when encoder is null", () => {
    const args = buildFfmpegArgs("rtmp://localhost/live", null, false);
    expect(args).toContain("libx264");
    expect(args).toContain("-preset");
    expect(args).toContain("ultrafast");
    expect(args).toContain("-an");
    expect(args).toContain("pipe:1");
    expect(args).not.toContain("aac");
  });

  it("uses hardware encoder when provided", () => {
    const args = buildFfmpegArgs("input.mp4", "h264_vaapi", true);
    expect(args).toContain("h264_vaapi");
    expect(args).not.toContain("libx264");
    expect(args).toContain("aac");
  });

  it("includes audio when withAudio is true", () => {
    const args = buildFfmpegArgs("in", null, true);
    expect(args).toContain("-c:a");
    expect(args).toContain("aac");
    expect(args).toContain("-b:a");
    expect(args).toContain("64k");
    expect(args).not.toContain("-an");
  });

  it("includes correct resolution scale filter", () => {
    const args = buildFfmpegArgs("in", null, false);
    expect(args).toContain(`scale=${PREVIEW_RESOLUTION.width}:${PREVIEW_RESOLUTION.height}`);
  });

  it("outputs fMP4 with correct movflags", () => {
    const args = buildFfmpegArgs("in", null, false);
    expect(args).toContain("-f");
    expect(args).toContain("mp4");
    expect(args).toContain("-movflags");
    expect(args).toContain("frag_keyframe+empty_moov+default_base_moof");
  });
});

// ── Tests: probeEncoder ──────────────────────────────────────────────────────

describe("probeEncoder", () => {
  it("returns h264_vaapi when present in output", async () => {
    const customSpawn: SpawnFn = (_cmd, _args) => {
      const proc = createFakeProcess();
      setTimeout(() => {
        proc.stdout.push("V..... h264_vaapi           H.264 (VA-API)\n");
        proc.stdout.push(null);
        proc.emit("close", 0);
      }, 0);
      return proc as unknown as ChildProcess;
    };
    const result = await probeEncoder(customSpawn);
    expect(result).toBe("h264_vaapi");
  });

  it("returns h264_qsv when vaapi not available but qsv is", async () => {
    const customSpawn: SpawnFn = () => {
      const proc = createFakeProcess();
      setTimeout(() => {
        proc.stdout.push("V..... h264_qsv           H.264 (QSV)\n");
        proc.stdout.push(null);
        proc.emit("close", 0);
      }, 0);
      return proc as unknown as ChildProcess;
    };
    const result = await probeEncoder(customSpawn);
    expect(result).toBe("h264_qsv");
  });

  it("returns null when no hardware encoder found", async () => {
    const customSpawn: SpawnFn = () => {
      const proc = createFakeProcess();
      setTimeout(() => {
        proc.stdout.push("V..... libx264           libx264\n");
        proc.stdout.push(null);
        proc.emit("close", 0);
      }, 0);
      return proc as unknown as ChildProcess;
    };
    const result = await probeEncoder(customSpawn);
    expect(result).toBeNull();
  });

  it("respects priority order (vaapi > qsv > nvenc)", async () => {
    const customSpawn: SpawnFn = () => {
      const proc = createFakeProcess();
      setTimeout(() => {
        proc.stdout.push("V..... h264_nvenc\nV..... h264_vaapi\nV..... h264_qsv\n");
        proc.stdout.push(null);
        proc.emit("close", 0);
      }, 0);
      return proc as unknown as ChildProcess;
    };
    const result = await probeEncoder(customSpawn);
    expect(result).toBe("h264_vaapi");
  });
});

// ── Tests: PreviewStreamManager ──────────────────────────────────────────────

describe("PreviewStreamManager", () => {
  let manager: PreviewStreamManager;
  let spawnCtx: ReturnType<typeof makeSpawn>;

  beforeEach(() => {
    vi.useFakeTimers();
    spawnCtx = makeSpawn();
    manager = new PreviewStreamManager(createFakeAuthService(), spawnCtx.spawn);
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
  });

  describe("setSourceAvailable", () => {
    it("creates a source entry", () => {
      manager.setSourceAvailable("obs", true, "rtmp://localhost/live");
      expect(manager.getSubscriberCount("obs")).toBe(0);
    });

    it("does not spawn FFmpeg when no subscribers", () => {
      manager.setSourceAvailable("obs", true, "rtmp://localhost/live");
      expect(spawnCtx.procs).toHaveLength(0);
    });

    it("kills FFmpeg when source becomes unavailable", () => {
      manager.setSourceAvailable("obs", true, "rtmp://localhost/live");
      // Manually inject a fake process
      const source = (manager as unknown as { sources: Map<string, { ffmpegProcess: unknown }> }).sources.get("obs")!;
      const proc = createFakeProcess();
      source.ffmpegProcess = proc;

      manager.setSourceAvailable("obs", false, "rtmp://localhost/live");
      expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
    });
  });

  describe("getActiveStreams", () => {
    it("returns 0 initially", () => {
      expect(manager.getActiveStreams()).toBe(0);
    });
  });

  describe("constants", () => {
    it("has correct values", () => {
      expect(MAX_RESTART_ATTEMPTS).toBe(3);
      expect(RESTART_DELAY_MS).toBe(2000);
      expect(GRACE_PERIOD_MS).toBe(3000);
      expect(MAX_PREVIEW_STREAMS).toBe(4);
      expect(PREVIEW_RESOLUTION).toEqual({ width: 1280, height: 720 });
    });
  });

  describe("isAvailable / getEncoder", () => {
    it("returns false before initialize", () => {
      expect(manager.isAvailable()).toBe(false);
    });

    it("returns null encoder before initialize", () => {
      expect(manager.getEncoder()).toBeNull();
    });
  });

  describe("destroy", () => {
    it("cleans up sources", () => {
      manager.setSourceAvailable("obs", true, "rtmp://localhost/live");
      manager.destroy();
      expect(manager.getActiveStreams()).toBe(0);
    });
  });
});

// ── Tests: checkFfmpegPath ───────────────────────────────────────────────────

describe("checkFfmpegPath", () => {
  it("returns a boolean", () => {
    const result = checkFfmpegPath();
    expect(typeof result).toBe("boolean");
  });
});
