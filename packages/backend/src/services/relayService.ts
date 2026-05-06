/**
 * RelayService manages the node-media-server lifecycle and FFmpeg forwarder processes.
 *
 * This is the only service that interacts with the RTMP relay or spawns child processes.
 * StreamingPlatformService depends on this for forwarder management.
 *
 * Emits:
 * - BUS_RELAY_STATE_CHANGED when relay or OBS connection state changes
 * - BUS_FORWARDER_EXITED when an FFmpeg process exits unexpectedly
 */
import type { ChildProcess } from "child_process";
import { BUS_RELAY_STATE_CHANGED, BUS_FORWARDER_EXITED } from "../eventBus/types.js";
import { eventBus } from "../eventBus/eventBus.js";
import { logger } from "../logger.js";
import type { RelayState } from "../gateway/modules/platform/types.js";

const MAX_CRASH_RETRIES = 3;
const CRASH_RETRY_DELAY_MS = 5_000;
const MAX_STDERR_LINES = 50;

// ── NMS abstraction for dependency injection ─────────────────────────────────

export interface NmsInstance {
  run(): void;
  stop(): void;
  on(event: string, handler: (id: string, streamPath: string, args: object) => void): void;
}

export type NmsFactory = () => NmsInstance;
export type SpawnFn = (command: string, args: string[], options: object) => ChildProcess;

// ── RelayService ─────────────────────────────────────────────────────────────

export class RelayService {
  private nms: NmsInstance | null = null;
  private state: RelayState = { running: false, obsConnected: false };
  private readonly forwarders = new Map<string, { process: ChildProcess; stderrLines: string[] }>();
  private crashCount = 0;
  private publisherSessionId: string | null = null;

  constructor(
    private readonly nmsFactory: NmsFactory,
    private readonly spawnFn: SpawnFn,
    private readonly relayPort = 1935,
  ) {}

  async start(): Promise<void> {
    await this.verifyFfmpeg();
    this.nms = this.nmsFactory();
    this.wireNmsEvents(this.nms);
    this.nms.run();
    this.updateState({ running: true, obsConnected: false });
    logger.info("Relay started", { context: { port: this.relayPort } });
  }

  stop(): void {
    this.stopAllForwarders();
    if (this.nms) {
      this.nms.stop();
      this.nms = null;
    }
    this.publisherSessionId = null;
    this.updateState({ running: false, obsConnected: false });
  }

  getRelayState(): RelayState {
    return { ...this.state };
  }

  startForwarder(platformId: string, rtmpUrl: string): void {
    if (this.forwarders.has(platformId)) return;

    const inputUrl = `rtmp://127.0.0.1:${this.relayPort}/live/stream`;
    const child = this.spawnFn("ffmpeg", ["-i", inputUrl, "-c", "copy", "-f", "flv", rtmpUrl], {
      stdio: ["ignore", "ignore", "pipe"],
    });

    const entry = { process: child, stderrLines: [] as string[] };
    this.forwarders.set(platformId, entry);

    child.stderr?.on("data", (data: Buffer) => {
      const lines = data
        .toString()
        .split("\n")
        .filter((line) => line.length > 0);
      entry.stderrLines.push(...lines);
      if (entry.stderrLines.length > MAX_STDERR_LINES) {
        entry.stderrLines.splice(0, entry.stderrLines.length - MAX_STDERR_LINES);
      }
    });

    child.on("close", (code: number | null) => {
      this.forwarders.delete(platformId);
      eventBus.emit(BUS_FORWARDER_EXITED, {
        platformId,
        code,
        lastStderr: [...entry.stderrLines],
      });
    });

    logger.info(`Forwarder started for ${platformId}`, { context: { rtmpUrl } });
  }

  stopForwarder(platformId: string): void {
    const entry = this.forwarders.get(platformId);
    if (entry) {
      entry.process.kill("SIGTERM");
      this.forwarders.delete(platformId);
    }
  }

  stopAllForwarders(): void {
    for (const [id, entry] of this.forwarders) {
      entry.process.kill("SIGTERM");
      this.forwarders.delete(id);
    }
  }

  isForwarderAlive(platformId: string): boolean {
    return this.forwarders.has(platformId);
  }

  /** Simulate a relay crash — used by tests only. */
  async simulateCrash(): Promise<void> {
    await this.handleCrash();
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private wireNmsEvents(nms: NmsInstance): void {
    nms.on("prePublish", (_id: string, streamPath: string, args: object) => {
      logger.info("Relay prePublish", { context: { streamPath, hasPublisher: this.publisherSessionId !== null } });
      const rejectArgs = args as { reject?: () => void };
      if (streamPath !== "/live/stream") {
        logger.warn("Relay rejected publish: wrong path", { context: { streamPath } });
        rejectArgs.reject?.();
        return;
      }
      if (this.publisherSessionId !== null) {
        logger.warn("Relay rejected publish: already has publisher");
        rejectArgs.reject?.();
        return;
      }
    });

    nms.on("postPublish", (id: string, streamPath: string) => {
      if (streamPath !== "/live/stream") return;
      this.publisherSessionId = id;
      this.updateState({ ...this.state, obsConnected: true });
      logger.info("OBS connected to relay");
    });

    nms.on("donePublish", (id: string, streamPath: string) => {
      if (streamPath !== "/live/stream" || id !== this.publisherSessionId) return;
      this.publisherSessionId = null;
      this.updateState({ ...this.state, obsConnected: false });
      logger.info("OBS disconnected from relay");
    });
  }

  private async handleCrash(): Promise<void> {
    this.updateState({ running: false, obsConnected: false });
    this.publisherSessionId = null;

    if (this.crashCount >= MAX_CRASH_RETRIES) {
      logger.error("Relay crash recovery exhausted");
      return;
    }

    this.crashCount++;
    logger.warn(`Relay crashed, attempting recovery (${this.crashCount}/${MAX_CRASH_RETRIES})`);

    await new Promise((resolve) => setTimeout(resolve, CRASH_RETRY_DELAY_MS));

    this.nms = this.nmsFactory();
    this.wireNmsEvents(this.nms);
    this.nms.run();
    this.updateState({ running: true, obsConnected: false });
  }

  private async verifyFfmpeg(): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = this.spawnFn("ffmpeg", ["-version"], { stdio: ["ignore", "ignore", "pipe"] });
      child.on("close", (code: number | null) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });
      child.on("error", () => {
        reject(new Error("FFmpeg not found"));
      });
    });
  }

  private updateState(newState: RelayState): void {
    this.state = newState;
    eventBus.emit(BUS_RELAY_STATE_CHANGED, { ...this.state });
  }
}
