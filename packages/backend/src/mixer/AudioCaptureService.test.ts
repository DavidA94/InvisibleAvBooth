import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";
import { AudioCaptureService, sampleToDbfs, buildCaptureArgs, parsePipeWireCaptureNode } from "./AudioCaptureService.js";
import type { SpawnFn, AudioConsumer, CaptureTarget } from "./AudioCaptureService.js";
import type { EnvelopePair } from "@invisible-av-booth/shared";
import { ENVELOPE_BURST_MS } from "@invisible-av-booth/shared";

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

/** identity resolver: slot === channel, no node targeting, unknown channel count */
const identityResolver = (_mixerId: string, channel: number): CaptureTarget => ({ slot: channel, nodeName: "", deviceChannels: 0 });

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

  it("targets the configured PipeWire node and forces the full multichannel stream", () => {
    const args = buildCaptureArgs(9, "alsa_input.usb-BEHRINGER_XR18_x-00.multichannel-input", 18);
    // Node targeting so pipewiresrc doesn't grab the down-mixed default.
    expect(args).toContain("target-object=alsa_input.usb-BEHRINGER_XR18_x-00.multichannel-input");
    // Full discrete channel negotiation with an unpositioned mask (>8 channels).
    expect(args).toContain("audio/x-raw,channels=18,channel-mask=(bitmask)0x0");
    // Slot 9 → pad 8 (only reachable when all 18 pads exist).
    expect(args).toContain("d.src_8");
  });

  it("omits targeting/caps for the unconfigured fallback (bare pipewiresrc)", () => {
    const args = buildCaptureArgs(1);
    expect(args.some((a) => a.startsWith("target-object="))).toBe(false);
    expect(args.some((a) => a.includes("channel-mask"))).toBe(false);
  });
});

describe("parsePipeWireCaptureNode", () => {
  const xr18Dump = JSON.stringify([
    { info: { props: { "media.class": "Audio/Sink", "node.name": "alsa_output.usb-BEHRINGER_XR18_x-00.multichannel-output", "audio.channels": 18 } } },
    { info: { props: { "media.class": "Audio/Source", "node.name": "alsa_input.pci-0000_00.analog-stereo", "audio.channels": 2 } } },
    { info: { props: { "media.class": "Audio/Source", "node.name": "alsa_input.usb-BEHRINGER_XR18_x-00.multichannel-input", "audio.channels": 18 } } },
  ]);

  it("finds the X Air multichannel-input source node and its channel count", () => {
    const result = parsePipeWireCaptureNode(xr18Dump);
    expect(result).toEqual({ nodeName: "alsa_input.usb-BEHRINGER_XR18_x-00.multichannel-input", deviceChannels: 18 });
  });

  it("ignores the multichannel OUTPUT (sink) and picks only the input source", () => {
    const result = parsePipeWireCaptureNode(xr18Dump);
    expect(result?.nodeName).toContain("multichannel-input");
  });

  it("returns null when no X Air capture node is present", () => {
    const dump = JSON.stringify([
      { info: { props: { "media.class": "Audio/Source", "node.name": "alsa_input.pci-0000_00.analog-stereo", "audio.channels": 2 } } },
    ]);
    expect(parsePipeWireCaptureNode(dump)).toBeNull();
  });

  it("returns null for unparseable JSON", () => {
    expect(parsePipeWireCaptureNode("not json")).toBeNull();
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
      const resolver = vi.fn((_mixerId: string, channel: number): CaptureTarget => ({ slot: channel + 10, nodeName: "", deviceChannels: 0 }));
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

    it("fans a burst out to all consumers subscribed to a channel", () => {
      vi.useFakeTimers();
      const service = new AudioCaptureService(identityResolver, spawnFn as unknown as SpawnFn);
      const firstBursts: EnvelopePair[][] = [];
      const secondBursts: EnvelopePair[][] = [];
      service.subscribe({ id: "first", channels: [1], onEnvelope: (_c, pairs) => firstBursts.push(pairs) }, "mix1");
      service.subscribe({ id: "second", channels: [1], onEnvelope: (_c, pairs) => secondBursts.push(pairs) }, "mix1");

      // Feed PCM across several decimation windows so pairs accumulate in the burst.
      const proc = processes[0]!;
      for (let i = 0; i < 3; i++) {
        const pcm = Buffer.alloc(200);
        pcm.writeInt16LE(16384, 0); // ~-6 dBFS peak
        vi.advanceTimersByTime(20); // exceed WINDOW_MS (~16.7ms) each iteration
        proc.stdout!.emit("data", pcm);
      }
      // Advance past the burst-flush cadence so the accumulated pairs are emitted.
      vi.advanceTimersByTime(ENVELOPE_BURST_MS);

      expect(firstBursts.length).toBeGreaterThan(0);
      expect(firstBursts[0]!.length).toBeGreaterThan(0);
      expect(secondBursts.length).toBe(firstBursts.length);
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
