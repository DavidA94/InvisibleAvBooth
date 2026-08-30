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
import { ENVELOPE_PAIRS_PER_SEC, LEVEL_AXIS_MIN_DBFS, LEVEL_AXIS_MAX_DBFS, PREVIEW_AUDIO_SAMPLE_RATE } from "@invisible-av-booth/shared";
import { logger } from "../logger.js";

export interface SpawnFn {
  (cmd: string, args: string[]): ChildProcess;
}

/** A consumer of isolated channel audio. Multiple consumers may overlap channels. */
export interface AudioConsumer {
  id: string;
  /** 1-based mixer channel numbers this consumer wants. */
  channels: number[];
  /** Called with each decimated envelope pair for a monitored channel. */
  onEnvelope: (channel: number, pair: EnvelopePair) => void;
}

/** Resolves a mixer's channel→USB-slot map (from device config). */
export type UsbSlotResolver = (mixerId: string, channel: number) => number;

interface ActiveChannel {
  channel: number;
  refCount: number;
  process: ChildProcess | null;
  // Running min/max accumulator for the current decimation window.
  windowMin: number;
  windowMax: number;
  windowStart: number;
}

const WINDOW_MS = 1000 / ENVELOPE_PAIRS_PER_SEC;

export class AudioCaptureService {
  private readonly consumers = new Map<string, AudioConsumer>();
  private readonly channelsActive = new Map<number, ActiveChannel>();
  private readonly spawnFn: SpawnFn;
  private available: boolean | null = null; // cached probe result
  private destroyed = false;

  constructor(
    private readonly usbSlotResolver: UsbSlotResolver,
    spawnFn?: SpawnFn,
  ) {
    this.spawnFn = spawnFn ?? ((cmd, args) => spawn(cmd, args));
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
      active = { channel, refCount: 0, process: null, windowMin: LEVEL_AXIS_MAX_DBFS, windowMax: LEVEL_AXIS_MIN_DBFS, windowStart: Date.now() };
      this.channelsActive.set(channel, active);
    }
    active.refCount++;
    if (active.refCount === 1) {
      this.spawnChannel(mixerId, active);
    }
  }

  private releaseChannelRef(mixerId: string, channel: number): void {
    const active = this.channelsActive.get(channel);
    if (!active) return;
    active.refCount--;
    if (active.refCount <= 0) {
      this.killChannel(active);
      this.channelsActive.delete(channel);
    }
  }

  private spawnChannel(mixerId: string, active: ActiveChannel): void {
    if (this.destroyed) return;
    const slot = this.usbSlotResolver(mixerId, active.channel);
    const args = buildCaptureArgs(slot);
    logger.info("Audio capture spawning pipeline", { context: { mixerId, channel: active.channel, slot } });

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
      const pair: EnvelopePair = { minDb: clamp(active.windowMin), maxDb: clamp(active.windowMax) };
      this.emitEnvelope(active.channel, pair);
      active.windowMin = LEVEL_AXIS_MAX_DBFS;
      active.windowMax = LEVEL_AXIS_MIN_DBFS;
      active.windowStart = now;
    }
  }

  private emitEnvelope(channel: number, pair: EnvelopePair): void {
    for (const consumer of this.consumers.values()) {
      if (consumer.channels.includes(channel)) consumer.onEnvelope(channel, pair);
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
      this.killChannel(active);
    }
    this.channelsActive.clear();
    this.consumers.clear();
  }
}

// ── Pure helpers ───────────────────────────────────────────────────────────────

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
 * Build the GStreamer capture pipeline for a single USB slot. Selects one
 * deinterleaved channel (the configured USB slot, 0-based src pad), converts to
 * S16LE mono, and writes raw PCM to stdout for envelope decimation.
 */
export function buildCaptureArgs(usbSlot: number): string[] {
  const srcPad = Math.max(0, usbSlot - 1); // slots are 1-based in config; deinterleave pads are 0-based
  const args = ["-q"];
  args.push("pipewiresrc", "!");
  args.push("audioconvert", "!");
  args.push("deinterleave", "name=d");
  args.push(`d.src_${srcPad}`, "!");
  args.push("audioconvert", "!");
  args.push("audioresample", "!");
  args.push(`audio/x-raw,format=S16LE,rate=${PREVIEW_AUDIO_SAMPLE_RATE},channels=1`, "!");
  args.push("fdsink", "fd=1");
  return args;
}
