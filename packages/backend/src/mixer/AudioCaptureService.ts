/**
 * AudioCaptureService — the multi-consumer isolated-channel capture layer.
 *
 * Owns the mixer's USB audio device via PipeWire (GStreamer
 * `pipewiresrc ! audioconvert ! deinterleave`) and fans isolated channels out to
 * multiple consumers (Req 4). The gain-window envelope is the first consumer;
 * multitrack recording is a designed-for future consumer that can subscribe to
 * all channels with zero changes here (Req 4.2/4.3).
 *
 * WHY multi-consumer via a subscribe/fan-out seam: one USB device, one owner
 * (PipeWire), many readers. A raw ALSA hw: device is exclusive-open; PipeWire
 * shares it. We build only the CONSUMER side and document the routing + OBS
 * ownership as prerequisites (setup.md).
 *
 * USB SLOT SELECTION: X Air USB send routing is user-configurable, so a mixer
 * channel's audio is NOT guaranteed on the same-numbered USB slot. We select the
 * slot from the admin-configured channel→USB-slot map (Req 4.1), never assuming
 * slot == channel.
 *
 * ENVELOPE: we compute a decimated min/max envelope (~ENVELOPE_PAIRS_PER_SEC) on
 * the backend, NOT raw PCM — bounding bandwidth and giving a smooth graph
 * (Req 4.4). The tap is POST-PREAMP / PRE-PROCESSING so it reflects what the
 * preamp gain affects (Req 4.5).
 *
 * DEGRADATION: isAvailable() probes `gst-inspect-1.0 pipewiresrc`; when
 * unavailable, MixerService downgrades channel-audio-capture so the gain window
 * falls back to the slider tier (Req 4.7 / 15.1). No hardware is available in CI
 * — everything spawns through an injectable SpawnFn and is faked in tests.
 *
 * SINGLE OWNER OF RESPAWN (Req 15.7): this service is the sole owner of capture-
 * pipeline lifecycle and respawn. The gain-modal stall detection only reacts
 * (flips tiers); it never respawns, so two owners never race.
 */

import { type ChildProcess, spawn } from "child_process";
import type { EnvelopePair } from "@invisible-av-booth/shared";
import { ENVELOPE_PAIRS_PER_SEC, ENVELOPE_BURST_MS, LEVEL_AXIS_MIN_DBFS, LEVEL_AXIS_MAX_DBFS, PREVIEW_AUDIO_SAMPLE_RATE } from "@invisible-av-booth/shared";
import { logger } from "../logger.js";

export interface SpawnFn {
  (cmd: string, args: string[]): ChildProcess;
}

/** A consumer of isolated channel audio. Multiple consumers may overlap channels. */
export interface AudioConsumer {
  id: string;
  /** 1-based mixer channel numbers this consumer wants. */
  channels: number[];
  /**
   * Called with a BURST of decimated envelope pairs (oldest→newest) for a
   * monitored channel, flushed on a fixed cadence (ENVELOPE_BURST_MS). Batching
   * avoids per-pair WS sends and, crucially, per-pair React state updates on the
   * frontend that would coalesce and DROP intermediate pairs.
   */
  onEnvelope: (channel: number, pairs: EnvelopePair[]) => void;
}

/** Capture-target selection for a mixer channel (from device config). */
export interface CaptureTarget {
  /** 1-based USB slot the channel's audio lands on (from the channel→slot map). */
  slot: number;
  /**
   * PipeWire node name to target (e.g. the XR18 multichannel-input node). Empty
   * → bare pipewiresrc (default source) — legacy/fallback for unconfigured setups.
   */
  nodeName: string;
  /** Total discrete USB channels the device exposes (e.g. 18), for caps negotiation. */
  deviceChannels: number;
}

/** Resolves a mixer channel's capture target (slot + PipeWire node + channel count). */
export type CaptureTargetResolver = (mixerId: string, channel: number) => CaptureTarget;

interface ActiveChannel {
  channel: number;
  refCount: number;
  process: ChildProcess | null;
  // Running min/max accumulator for the current decimation window.
  windowMin: number;
  windowMax: number;
  windowStart: number;
  // Pairs accumulated since the last burst flush, and the flush timer.
  burst: EnvelopePair[];
  flushTimer: ReturnType<typeof setInterval> | null;
}

const WINDOW_MS = 1000 / ENVELOPE_PAIRS_PER_SEC;

export class AudioCaptureService {
  private readonly consumers = new Map<string, AudioConsumer>();
  private readonly channelsActive = new Map<number, ActiveChannel>();
  private readonly spawnFn: SpawnFn;
  private available: boolean | null = null; // cached probe result
  private discovered: { nodeName: string; deviceChannels: number } | null | undefined = undefined; // cached auto-discovery
  private destroyed = false;

  constructor(
    private readonly captureTargetResolver: CaptureTargetResolver,
    spawnFn?: SpawnFn,
  ) {
    this.spawnFn = spawnFn ?? ((cmd, args) => spawn(cmd, args));
  }

  /**
   * Auto-discover the X Air / Midas multichannel-input PipeWire node so a
   * volunteer never has to look up node names (AGENTS.md: non-technical user).
   * Runs `pw-dump`, finds an Audio/Source whose node.name looks like a
   * Behringer/Midas USB multichannel input, and returns its node.name +
   * audio.channels. Returns null when none is found (caller falls back to the
   * configured value, then to bare pipewiresrc). Result is cached.
   *
   * WHY node.name (not object.serial): node.name is stable across reconnects and
   * matches what `pipewiresrc target-object=` accepts; the serial changes each
   * time the device re-enumerates.
   */
  async discoverCaptureNode(): Promise<{ nodeName: string; deviceChannels: number } | null> {
    if (this.discovered !== undefined) return this.discovered;
    this.discovered = await new Promise<{ nodeName: string; deviceChannels: number } | null>((resolve) => {
      try {
        const proc = this.spawnFn("pw-dump", []);
        let out = "";
        proc.stdout?.on("data", (chunk: Buffer) => (out += chunk.toString()));
        proc.on("error", () => resolve(null));
        proc.on("close", () => resolve(parsePipeWireCaptureNode(out)));
      } catch {
        resolve(null);
      }
    });
    return this.discovered;
  }

  /** Probe PipeWire availability (gst-inspect-1.0 pipewiresrc). Cached after first call. */
  async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available;
    this.available = await new Promise<boolean>((resolve) => {
      try {
        const proc = this.spawnFn("gst-inspect-1.0", ["pipewiresrc"]);
        proc.on("close", (code) => resolve(code === 0));
        proc.on("error", () => resolve(false));
      } catch {
        resolve(false);
      }
    });
    return this.available;
  }

  /**
   * Subscribe a consumer. Lazily spawns capture for any channel that gains its
   * first subscriber; tears it down when the last subscriber for a channel
   * unsubscribes. Returns an unsubscribe function (also called on client
   * disconnect without an explicit stop — Req 4.6).
   */
  subscribe(consumer: AudioConsumer, mixerId: string): () => void {
    this.consumers.set(consumer.id, consumer);
    for (const channel of consumer.channels) {
      this.addChannelRef(mixerId, channel);
    }
    return () => this.unsubscribe(consumer.id, mixerId);
  }

  private unsubscribe(consumerId: string, mixerId: string): void {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) return;
    this.consumers.delete(consumerId);
    for (const channel of consumer.channels) {
      this.releaseChannelRef(mixerId, channel);
    }
  }

  private addChannelRef(mixerId: string, channel: number): void {
    let active = this.channelsActive.get(channel);
    if (!active) {
      active = {
        channel,
        refCount: 0,
        process: null,
        windowMin: LEVEL_AXIS_MAX_DBFS,
        windowMax: LEVEL_AXIS_MIN_DBFS,
        windowStart: Date.now(),
        burst: [],
        flushTimer: null,
      };
      this.channelsActive.set(channel, active);
    }
    active.refCount++;
    if (active.refCount === 1) {
      this.spawnChannel(mixerId, active);
      // Flush accumulated pairs to consumers as one burst on a fixed cadence.
      active.flushTimer = setInterval(() => this.flushBurst(active!), ENVELOPE_BURST_MS);
    }
  }

  private releaseChannelRef(mixerId: string, channel: number): void {
    const active = this.channelsActive.get(channel);
    if (!active) return;
    active.refCount--;
    if (active.refCount <= 0) {
      if (active.flushTimer) clearInterval(active.flushTimer);
      active.flushTimer = null;
      this.killChannel(active);
      this.channelsActive.delete(channel);
    }
  }

  /** Emit the accumulated pairs (if any) as a single burst, then clear the buffer. */
  private flushBurst(active: ActiveChannel): void {
    if (active.burst.length === 0) return;
    const pairs = active.burst;
    active.burst = [];
    this.emitEnvelope(active.channel, pairs);
  }

  private spawnChannel(mixerId: string, active: ActiveChannel): void {
    if (this.destroyed) return;
    const target = this.captureTargetResolver(mixerId, active.channel);
    // Config wins; otherwise fall back to auto-discovered node/channel-count so a
    // volunteer needn't configure PipeWire node names by hand.
    const nodeName = target.nodeName || this.discovered?.nodeName || "";
    const deviceChannels = target.deviceChannels || this.discovered?.deviceChannels || 0;
    const args = buildCaptureArgs(target.slot, nodeName, deviceChannels);
    logger.info("Audio capture spawning pipeline", { context: { mixerId, channel: active.channel, slot: target.slot, nodeName, deviceChannels } });

    let proc: ChildProcess;
    try {
      proc = this.spawnFn("gst-launch-1.0", args);
    } catch (error) {
      logger.warn("Audio capture spawn failed", { context: { mixerId, channel: active.channel, error: (error as Error).message } });
      return;
    }
    active.process = proc;
    active.windowStart = Date.now();

    proc.stdout?.on("data", (chunk: Buffer) => this.consumePcm(active, chunk));

    proc.on("close", (code) => {
      logger.info("Audio capture pipeline exited", { context: { mixerId, channel: active.channel, code } });
      const wasActive = active.process !== null;
      active.process = null;
      // SINGLE OWNER OF RESPAWN (Req 15.7): if consumers still need this channel,
      // respawn once. The gain modal never respawns — it only reacts.
      if (!this.destroyed && wasActive && active.refCount > 0) {
        this.spawnChannel(mixerId, active);
      }
    });

    proc.on("error", () => {
      active.process = null;
    });
  }

  private killChannel(active: ActiveChannel): void {
    if (active.process) {
      active.process.kill("SIGTERM");
      active.process = null;
    }
  }

  /**
   * Consume raw PCM (S16LE mono) and produce decimated min/max envelope pairs.
   * Each ~WINDOW_MS window emits one pair (peak min/max in dBFS) to all consumers
   * subscribed to this channel.
   */
  private consumePcm(active: ActiveChannel, chunk: Buffer): void {
    // Interpret as signed 16-bit little-endian mono samples.
    for (let offset = 0; offset + 1 < chunk.length; offset += 2) {
      const sample = chunk.readInt16LE(offset);
      const db = sampleToDbfs(sample);
      if (db < active.windowMin) active.windowMin = db;
      if (db > active.windowMax) active.windowMax = db;
    }
    const now = Date.now();
    if (now - active.windowStart >= WINDOW_MS) {
      // Accumulate into the burst buffer; the flush timer emits it as one frame.
      active.burst.push({ minDb: clamp(active.windowMin), maxDb: clamp(active.windowMax) });
      active.windowMin = LEVEL_AXIS_MAX_DBFS;
      active.windowMax = LEVEL_AXIS_MIN_DBFS;
      active.windowStart = now;
    }
  }

  private emitEnvelope(channel: number, pairs: EnvelopePair[]): void {
    for (const consumer of this.consumers.values()) {
      if (consumer.channels.includes(channel)) consumer.onEnvelope(channel, pairs);
    }
  }

  /** Test/inspection helper: number of pipelines currently running. */
  getActiveChannelCount(): number {
    let count = 0;
    for (const active of this.channelsActive.values()) {
      if (active.process) count++;
    }
    return count;
  }

  destroy(): void {
    this.destroyed = true;
    for (const active of this.channelsActive.values()) {
      if (active.flushTimer) clearInterval(active.flushTimer);
      active.flushTimer = null;
      this.killChannel(active);
    }
    this.channelsActive.clear();
    this.consumers.clear();
  }
}

// ── Pure helpers ───────────────────────────────────────────────────────────────

/**
 * Parse `pw-dump` JSON and find the X Air / Midas multichannel USB capture node.
 * Matches an Audio/Source whose node.name contains "multichannel-input" and a
 * Behringer/Midas/X-Air/MR marker. Returns its node.name + audio.channels, or
 * null when not found or the JSON is unparseable. Pure so it can be unit-tested
 * against captured pw-dump fixtures without PipeWire.
 */
export function parsePipeWireCaptureNode(pwDumpJson: string): { nodeName: string; deviceChannels: number } | null {
  let data: unknown;
  try {
    data = JSON.parse(pwDumpJson);
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return null;
  for (const object of data) {
    const props = (object as { info?: { props?: Record<string, unknown> } })?.info?.props;
    if (!props) continue;
    const nodeName = typeof props["node.name"] === "string" ? (props["node.name"] as string) : "";
    const mediaClass = props["media.class"];
    if (mediaClass !== "Audio/Source") continue;
    if (!nodeName.includes("multichannel-input")) continue;
    const upper = nodeName.toUpperCase();
    if (!/BEHRINGER|MIDAS|X-?AIR|\bMR\d|\bXR\d/.test(upper)) continue;
    const channelsRaw = props["audio.channels"];
    const deviceChannels = typeof channelsRaw === "number" ? channelsRaw : Number(channelsRaw) || 0;
    return { nodeName, deviceChannels };
  }
  return null;
}

/** Convert a signed 16-bit PCM sample to dBFS. 0 sample → -Infinity → axis min. */
export function sampleToDbfs(sample: number): number {
  const magnitude = Math.abs(sample) / 32768;
  if (magnitude <= 0) return LEVEL_AXIS_MIN_DBFS;
  const db = 20 * Math.log10(magnitude);
  return clamp(db);
}

function clamp(db: number): number {
  if (!Number.isFinite(db) || db < LEVEL_AXIS_MIN_DBFS) return LEVEL_AXIS_MIN_DBFS;
  if (db > LEVEL_AXIS_MAX_DBFS) return LEVEL_AXIS_MAX_DBFS;
  return db;
}

/**
 * Build the GStreamer capture pipeline for a single USB slot.
 *
 * CRITICAL — device targeting + multichannel negotiation (verified against a real
 * XR18): a bare `pipewiresrc` connects to the device's DEFAULT profile, which
 * PipeWire down-mixes to 1–2 channels — so `deinterleave` only exposes src_0/_1
 * and any higher slot fails with `not-linked`, and the pipeline exits (the
 * "Live Audio View Unavailable" symptom). We must:
 *   1. TARGET the specific node via `target-object=<node.name>` (the XR18's
 *      `alsa_input.usb-BEHRINGER_XR18_..._multichannel-input`), not the default.
 *   2. FORCE the full discrete channel count with an UNPOSITIONED channel mask
 *      (`channel-mask=(bitmask)0x0`) — >8-channel raw streams have no standard
 *      positional mask, and requesting a positioned layout fails to negotiate.
 * With both, `deinterleave` exposes all N pads and we can pick any USB slot.
 *
 * `nodeName` is empty for the identity/legacy fallback (bare pipewiresrc) so tests
 * and non-configured setups still build a valid pipeline; production supplies the
 * node from device config.
 */
export function buildCaptureArgs(usbSlot: number, nodeName = "", deviceChannels = 0): string[] {
  const srcPad = Math.max(0, usbSlot - 1); // slots are 1-based in config; deinterleave pads are 0-based
  const args = ["-q"];
  args.push("pipewiresrc");
  if (nodeName) args.push(`target-object=${nodeName}`);
  args.push("!");
  // Force the full multichannel stream so every USB slot is available on its own
  // deinterleave pad. An unpositioned mask (0x0) is required for >8 channels.
  if (deviceChannels > 0) {
    args.push(`audio/x-raw,channels=${deviceChannels},channel-mask=(bitmask)0x0`, "!");
  }
  args.push("audioconvert", "!");
  args.push("deinterleave", "name=d");
  args.push(`d.src_${srcPad}`, "!");
  args.push("audioconvert", "!");
  args.push("audioresample", "!");
  args.push(`audio/x-raw,format=S16LE,rate=${PREVIEW_AUDIO_SAMPLE_RATE},channels=1`, "!");
  args.push("fdsink", "fd=1");
  return args;
}
