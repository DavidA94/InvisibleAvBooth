import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";
import { AudioCaptureService, sampleToDbfs, buildCaptureArgs } from "./AudioCaptureService.js";
import type { SpawnFn, AudioConsumer } from "./AudioCaptureService.js";
import type { EnvelopePair } from "@invisible-av-booth/shared";

vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

interface MockProcess extends EventEmitter {
  stdout: EventEmitter | null;
  kill: ReturnType<typeof vi.fn>;
}

function makeMockProcess(): MockProcess {
  const proc = new EventEmitter() as MockProcess;
  proc.stdout = new EventEmitter();
  proc.kill = vi.fn().mockImplementation(() => setTimeout(() => proc.emit("close", 0), 0));
  return proc;
}

/** identity resolver: slot === channel */
const identityResolver = (_mixerId: string, channel: number): number => channel;

describe("sampleToDbfs", () => {
  it("maps a zero sample to the axis minimum", () => {
    expect(sampleToDbfs(0)).toBe(-60);
  });

  it("maps full-scale to ~0 dBFS", () => {
    expect(sampleToDbfs(32767)).toBeCloseTo(0, 1);
  });

  it("maps half-scale to ~-6 dBFS", () => {
    expect(sampleToDbfs(16384)).toBeCloseTo(-6, 0);
  });
});

describe("buildCaptureArgs", () => {
  it("selects the configured USB slot's deinterleave pad (0-based)", () => {
    const args = buildCaptureArgs(3);
    expect(args).toContain("pipewiresrc");
    expect(args).toContain("deinterleave");
    expect(args).toContain("d.src_2"); // slot 3 → pad 2
    expect(args).toContain("fd=1");
  });
});

describe("AudioCaptureService", () => {
  let spawnFn: ReturnType<typeof vi.fn>;
  let processes: MockProcess[];

  beforeEach(() => {
    processes = [];
    spawnFn = vi.fn(() => {
      const proc = makeMockProcess();
      processes.push(proc);
      return proc;
    });
  });

  describe("isAvailable", () => {
    it("returns true when gst-inspect pipewiresrc exits 0", async () => {
      const inspectSpawn: SpawnFn = vi.fn(() => {
        const proc = makeMockProcess();
        setTimeout(() => proc.emit("close", 0), 0);
        return proc as unknown as ReturnType<SpawnFn>;
      });
      const service = new AudioCaptureService(identityResolver, inspectSpawn);
      expect(await service.isAvailable()).toBe(true);
    });

    it("returns false when gst-inspect pipewiresrc fails (degradation path)", async () => {
      const inspectSpawn: SpawnFn = vi.fn(() => {
        const proc = makeMockProcess();
        setTimeout(() => proc.emit("close", 1), 0);
        return proc as unknown as ReturnType<SpawnFn>;
      });
      const service = new AudioCaptureService(identityResolver, inspectSpawn);
      expect(await service.isAvailable()).toBe(false);
    });
  });

  describe("lazy spawn + teardown", () => {
    it("spawns a pipeline on first subscribe and tears down on last unsubscribe", () => {
      const service = new AudioCaptureService(identityResolver, spawnFn as unknown as SpawnFn);
      const consumer: AudioConsumer = { id: "c1", channels: [2], onEnvelope: vi.fn() };
      const unsubscribe = service.subscribe(consumer, "mix1");
      expect(service.getActiveChannelCount()).toBe(1);
      unsubscribe();
      expect(processes[0]!.kill).toHaveBeenCalledWith("SIGTERM");
      expect(service.getActiveChannelCount()).toBe(0);
      service.destroy();
    });

    it("selects the USB slot from the resolver, not the channel number", () => {
      const resolver = vi.fn((_mixerId: string, channel: number) => channel + 10);
      const service = new AudioCaptureService(resolver, spawnFn as unknown as SpawnFn);
      service.subscribe({ id: "c1", channels: [1], onEnvelope: vi.fn() }, "mix1");
      expect(resolver).toHaveBeenCalledWith("mix1", 1);
      // slot 11 → pad 10
      expect(spawnFn.mock.calls[0]![1]).toContain("d.src_10");
      service.destroy();
    });
  });

  describe("multi-consumer seam (Req 4.2)", () => {
    it("a second consumer subscribes without affecting the first, sharing one pipeline per channel", () => {
      const service = new AudioCaptureService(identityResolver, spawnFn as unknown as SpawnFn);
      const first = { id: "first", channels: [1], onEnvelope: vi.fn() };
      const second = { id: "second", channels: [1], onEnvelope: vi.fn() };

      const unsubFirst = service.subscribe(first, "mix1");
      expect(spawnFn).toHaveBeenCalledTimes(1); // channel 1 pipeline spawned
      const unsubSecond = service.subscribe(second, "mix1");
      expect(spawnFn).toHaveBeenCalledTimes(1); // shared — no second pipeline

      // The first consumer unsubscribing must NOT tear down the pipeline (second still needs it).
      unsubFirst();
      expect(service.getActiveChannelCount()).toBe(1);
      unsubSecond();
      expect(service.getActiveChannelCount()).toBe(0);
      service.destroy();
    });

    it("fans an envelope out to all consumers subscribed to a channel", () => {
      vi.useFakeTimers();
      const service = new AudioCaptureService(identityResolver, spawnFn as unknown as SpawnFn);
      const firstPairs: EnvelopePair[] = [];
      const secondPairs: EnvelopePair[] = [];
      service.subscribe({ id: "first", channels: [1], onEnvelope: (_c, p) => firstPairs.push(p) }, "mix1");
      service.subscribe({ id: "second", channels: [1], onEnvelope: (_c, p) => secondPairs.push(p) }, "mix1");

      // Feed PCM that spans a decimation window so a pair is emitted.
      const proc = processes[0]!;
      const pcm = Buffer.alloc(200);
      pcm.writeInt16LE(16384, 0); // ~-6 dBFS peak
      vi.advanceTimersByTime(30); // exceed WINDOW_MS (~16.7ms)
      proc.stdout!.emit("data", pcm);

      expect(firstPairs.length).toBeGreaterThan(0);
      expect(secondPairs.length).toBe(firstPairs.length);
      service.destroy();
      vi.useRealTimers();
    });
  });

  describe("respawn on crash while subscribed (single-owner)", () => {
    it("respawns the pipeline when it exits with consumers still attached", () => {
      const service = new AudioCaptureService(identityResolver, spawnFn as unknown as SpawnFn);
      service.subscribe({ id: "c1", channels: [1], onEnvelope: vi.fn() }, "mix1");
      expect(spawnFn).toHaveBeenCalledTimes(1);
      // Simulate a pipeline crash.
      processes[0]!.emit("close", 1);
      expect(spawnFn).toHaveBeenCalledTimes(2); // respawned
      service.destroy();
    });

    it("does not respawn after destroy", () => {
      const service = new AudioCaptureService(identityResolver, spawnFn as unknown as SpawnFn);
      service.subscribe({ id: "c1", channels: [1], onEnvelope: vi.fn() }, "mix1");
      service.destroy();
      const callsAfterDestroy = spawnFn.mock.calls.length;
      processes[0]!.emit("close", 1);
      expect(spawnFn.mock.calls.length).toBe(callsAfterDestroy);
    });
  });
});
