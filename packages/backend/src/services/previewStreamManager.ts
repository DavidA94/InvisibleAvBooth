import { type Server as HttpServer } from "http";
import { type ChildProcess, spawn, execSync } from "child_process";
import { createInterface } from "readline";
import { WebSocketServer, WebSocket } from "ws";
import type { AuthService } from "./authService.js";
import { logger } from "../logger.js";
import { eventBus } from "../eventBus/eventBus.js";
import { BUS_DEVICE_CAPABILITIES_UPDATED, BUS_OBS_AUDIO_LEVELS } from "../eventBus/types.js";
import {
  PREVIEW_AUDIO_SAMPLE_RATE,
  PREVIEW_AUDIO_CHANNELS,
  PREVIEW_AUDIO_CHUNK_MS,
  MJPEG_WIDTH,
  MJPEG_HEIGHT,
  MJPEG_FRAMERATE,
  MJPEG_QUALITY,
  PREVIEW_MSG_VIDEO,
  PREVIEW_MSG_AUDIO,
} from "@invisible-av-booth/shared";

// ── Constants ────────────────────────────────────────────────────────────────
export const MJPEG_RESOLUTION = { width: MJPEG_WIDTH, height: MJPEG_HEIGHT };
export const MAX_PREVIEW_STREAMS = 4;
export const GRACE_PERIOD_MS = 3000;
export const MAX_RESTART_ATTEMPTS = 3;
export const RESTART_DELAY_MS = 2000;
export const PING_INTERVAL_MS = 30000;
export const PING_TIMEOUT_MS = 10000;
export const RESTART_RESET_MS = 10000;
export const LEVEL_MAX_RESTART_ATTEMPTS = 3;
export const LEVEL_RESTART_DELAY_MS = 2000;

export type GstEncoder = { element: string; options: string } | null;

// ── Level message parsing ────────────────────────────────────────────────────

/**
 * Regex for parsing GStreamer level element peak output.
 * The `-m` flag causes level to print messages like:
 *   /GstPipeline:pipeline0/GstLevel:level0: peak, GstValueList:(double)-20.5, (double)-18.3;
 */
export const LEVEL_PEAK_REGEX = /peak,\s*GstValueList:\(double\)([-\d.e+inf]+),\s*\(double\)([-\d.e+inf]+)/;

/**
 * Parse a single GStreamer level output line into L/R dB values.
 * Returns null for non-level lines or malformed data.
 * Clamps values to [-60, 0] range; -Infinity (silence) maps to -60.
 */
export function parseLevelMessage(line: string): { left: number; right: number } | null {
  const match = line.match(LEVEL_PEAK_REGEX);
  if (!match) return null;
  const left = parseFloat(match[1]!);
  const right = parseFloat(match[2]!);
  // Log out-of-range values at DEBUG level for diagnostics
  if (Number.isFinite(left) && (left < -60 || left > 0)) {
    logger.debug("Audio level out of display range", { context: { channel: "left", raw: left } });
  }
  if (Number.isFinite(right) && (right < -60 || right > 0)) {
    logger.debug("Audio level out of display range", { context: { channel: "right", raw: right } });
  }
  // Clamp to display range; -Infinity from GStreamer represents silence
  return {
    left: Number.isFinite(left) ? Math.max(-60, Math.min(0, left)) : -60,
    right: Number.isFinite(right) ? Math.max(-60, Math.min(0, right)) : -60,
  };
}

/**
 * Attach a line-buffered parser to a level pipeline's stdout.
 * Implements coalescing: if multiple level messages arrive in a single event loop
 * tick (due to event loop stalls under load), only the most recent reading is emitted.
 * This prevents broadcasting stale intermediate values when the loop catches up.
 */
export function attachLevelParser(childProcess: ChildProcess, onLevel: (levels: { left: number; right: number }) => void): void {
  if (!childProcess.stdout) return;
  const rl = createInterface({ input: childProcess.stdout });

  let latestLevels: { left: number; right: number } | null = null;
  let emitScheduled = false;

  rl.on("line", (line) => {
    const parsed = parseLevelMessage(line);
    if (parsed) {
      latestLevels = parsed; // Always overwrite — only latest matters
      if (!emitScheduled) {
        emitScheduled = true;
        queueMicrotask(() => {
          if (latestLevels) {
            onLevel(latestLevels);
            latestLevels = null;
          }
          emitScheduled = false;
        });
      }
    }
  });
}

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface PreviewSource {
  sourceId: string;
  ndiName: string;
  process: ChildProcess | null;
  audioProcess: ChildProcess | null;
  levelProcess: ChildProcess | null;
  levelRestartCount: number;
  levelRestartTimer: ReturnType<typeof setTimeout> | null;
  subscribers: Set<WebSocket>;
  graceTimeout: ReturnType<typeof setTimeout> | null;
  restartCount: number;
  restartResetTimer: ReturnType<typeof setTimeout> | null;
  available: boolean;
  withAudio: boolean;
}

export interface SpawnFn {
  (cmd: string, args: string[]): ChildProcess;
}

// ── Public API ───────────────────────────────────────────────────────────────

export class PreviewStreamManager {
  private wss: WebSocketServer;
  private sources = new Map<string, PreviewSource>();
  private encoder: GstEncoder = null;
  private gstreamerAvailable = false;
  private levelElementAvailable = false;
  private authService: AuthService;
  private spawnFn: SpawnFn;
  private signalCleanupRegistered = false;
  private destroyed = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(authService: AuthService, spawnFn?: SpawnFn) {
    this.authService = authService;
    this.spawnFn = spawnFn ?? ((cmd, args) => spawn(cmd, args));
    this.wss = new WebSocketServer({ noServer: true });
  }

  async initialize(): Promise<void> {
    this.gstreamerAvailable = checkGstreamerPath();
    if (!this.gstreamerAvailable) {
      logger.error("gst-launch-1.0 not found on PATH — preview streams unavailable");
      eventBus.emit(BUS_DEVICE_CAPABILITIES_UPDATED, {
        deviceId: "preview",
        capabilities: { deviceId: "preview", deviceType: "obs", features: { preview: false } },
      });
      return;
    }
    this.encoder = await probeEncoder(this.spawnFn);
    logger.info(`Preview encoder selected: ${this.encoder?.element ?? "x264enc ultrafast"}`, {
      context: { encoder: this.encoder?.element ?? "x264enc" },
    });

    // Check if the GStreamer `level` element is available for audio metering
    this.levelElementAvailable = await this.checkLevelElement();
    if (!this.levelElementAvailable) {
      logger.warn("GStreamer 'level' element not found — audio metering unavailable. Install gstreamer1.0-plugins-good.");
    }
    // Broadcast audio metering availability to frontends
    eventBus.emit(BUS_DEVICE_CAPABILITIES_UPDATED, {
      deviceId: "preview",
      capabilities: { deviceId: "preview", deviceType: "obs", features: { preview: true, audioMetering: this.levelElementAvailable } },
    });

    this.registerSignalHandlers();
    this.startPingInterval();
  }

  registerEndpoints(server: HttpServer): void {
    server.on("upgrade", (request, socket, head) => {
      const url = request.url ?? "";
      if (!url.startsWith("/preview/")) return;

      const cookies = parseCookieHeader(request.headers.cookie ?? "");
      const token = cookies["token"];
      if (!token) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      const result = this.authService.verifyToken(token);
      if (!result.success) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      const sourceId = this.parseSourceId(url);
      if (!sourceId) {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
        return;
      }

      if (this.getActiveStreams() >= MAX_PREVIEW_STREAMS && !this.sources.has(sourceId)) {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          ws.close(4503, "Max preview streams reached");
        });
        return;
      }

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.handleConnection(ws, sourceId);
      });
    });
  }

  setSourceAvailable(sourceId: string, available: boolean, ndiName: string): void {
    let source = this.sources.get(sourceId);
    if (!source) {
      source = {
        sourceId,
        ndiName,
        process: null,
        audioProcess: null,
        levelProcess: null,
        levelRestartCount: 0,
        levelRestartTimer: null,
        subscribers: new Set(),
        graceTimeout: null,
        restartCount: 0,
        restartResetTimer: null,
        available: false,
        withAudio: sourceId === "obs",
      };
      this.sources.set(sourceId, source);
    }
    source.available = available;
    source.ndiName = ndiName;

    if (available && source.subscribers.size > 0 && !source.process) {
      this.spawnPipeline(source);
    }
    if (!available && source.process) {
      this.killProcess(source);
    }
  }

  getActiveStreams(): number {
    let count = 0;
    for (const s of this.sources.values()) {
      if (s.process) count++;
    }
    return count;
  }

  getSubscriberCount(sourceId: string): number {
    return this.sources.get(sourceId)?.subscribers.size ?? 0;
  }

  isAvailable(): boolean {
    return this.gstreamerAvailable;
  }

  isLevelAvailable(): boolean {
    return this.levelElementAvailable;
  }

  getEncoder(): GstEncoder {
    return this.encoder;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.pingInterval) clearInterval(this.pingInterval);
    for (const source of this.sources.values()) {
      if (source.graceTimeout) clearTimeout(source.graceTimeout);
      if (source.restartResetTimer) clearTimeout(source.restartResetTimer);
      if (source.levelRestartTimer) clearTimeout(source.levelRestartTimer);
      this.killProcess(source);
      for (const ws of source.subscribers) {
        ws.close(1001, "Server shutting down");
      }
      source.subscribers.clear();
    }
    this.sources.clear();
    this.wss.close();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private parseSourceId(url: string): string | null {
    const match = url.match(/^\/preview\/(obs|camera\/([^/?]+))/);
    if (!match) return null;
    if (match[1] === "obs") return "obs";
    return `camera-${match[2]}`;
  }

  private handleConnection(ws: WebSocket, sourceId: string): void {
    let source = this.sources.get(sourceId);
    if (!source) {
      source = {
        sourceId,
        ndiName: "",
        process: null,
        audioProcess: null,
        levelProcess: null,
        levelRestartCount: 0,
        levelRestartTimer: null,
        subscribers: new Set(),
        graceTimeout: null,
        restartCount: 0,
        restartResetTimer: null,
        available: false,
        withAudio: sourceId === "obs",
      };
      this.sources.set(sourceId, source);
    }

    source.subscribers.add(ws);
    (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
    ws.on("pong", () => {
      (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
    });
    logger.info(`Preview [${source.sourceId}]: subscriber connected (total: ${source.subscribers.size})`);

    if (source.graceTimeout) {
      clearTimeout(source.graceTimeout);
      source.graceTimeout = null;
    }

    // Reset level pipeline retry counter on new subscriber — the NDI source
    // is likely available again (e.g., OBS was restarted) so metering should retry.
    if (source.withAudio && source.levelRestartCount >= LEVEL_MAX_RESTART_ATTEMPTS) {
      source.levelRestartCount = 0;
      // If the video pipeline is running but the level pipeline entered dormant,
      // attempt to re-spawn it now.
      if (source.process && !source.levelProcess && this.levelElementAvailable) {
        this.spawnLevelPipeline(source);
      }
    }

    if (source.available && !source.process && this.gstreamerAvailable) {
      this.spawnPipeline(source);
    }

    ws.on("close", () => {
      source!.subscribers.delete(ws);
      if (source!.subscribers.size === 0 && source!.process) {
        logger.info(`Preview [${source!.sourceId}]: last subscriber left, starting ${GRACE_PERIOD_MS}ms grace period`);
        source!.graceTimeout = setTimeout(() => {
          if (source!.subscribers.size === 0) {
            logger.info(`Preview [${source!.sourceId}]: grace period expired, killing pipeline`);
            this.killProcess(source!);
          }
        }, GRACE_PERIOD_MS);
      }
    });

    ws.on("error", () => {
      logger.debug(`Preview [${source!.sourceId}]: subscriber WebSocket error`);
      source!.subscribers.delete(ws);
    });
  }

  private spawnPipeline(source: PreviewSource): void {
    if (this.destroyed || !this.gstreamerAvailable) return;

    const args = buildMjpegArgs(source.ndiName);

    logger.info(`Preview spawning MJPEG pipeline for ${source.sourceId}`, { context: { args: args.join(" ") } });
    const proc = this.spawnFn("gst-launch-1.0", args);
    source.process = proc;

    // MJPEG: accumulate bytes until we find a complete JPEG (SOI→EOI), then send it
    let frameBuffer = Buffer.alloc(0);

    proc.stdout?.on("data", (chunk: Buffer) => {
      if (!source.restartResetTimer && source.restartCount > 0) {
        source.restartResetTimer = setTimeout(() => {
          source.restartCount = 0;
          source.restartResetTimer = null;
        }, RESTART_RESET_MS);
      }

      frameBuffer = Buffer.concat([frameBuffer, chunk]);

      // Extract all complete JPEG frames from buffer
      while (frameBuffer.length > 4) {
        // Find SOI marker (0xFFD8)
        const soiIdx = frameBuffer.indexOf(Buffer.from([0xff, 0xd8]));
        if (soiIdx < 0) {
          frameBuffer = Buffer.alloc(0);
          break;
        }
        if (soiIdx > 0) {
          frameBuffer = frameBuffer.subarray(soiIdx);
        }

        // Find EOI marker (0xFFD9) after SOI
        const eoiIdx = frameBuffer.indexOf(Buffer.from([0xff, 0xd9]), 2);
        if (eoiIdx < 0) break; // incomplete frame, wait for more data

        const frame = frameBuffer.subarray(0, eoiIdx + 2);
        frameBuffer = frameBuffer.subarray(eoiIdx + 2);

        // Prefix with type byte when source carries audio
        if (source.withAudio) {
          const prefixed = Buffer.allocUnsafe(1 + frame.length);
          prefixed[0] = PREVIEW_MSG_VIDEO;
          frame.copy(prefixed, 1);
          this.fanOut(source, prefixed);
        } else {
          this.fanOut(source, frame);
        }
      }
    });

    // Spawn separate audio pipeline for sources that need it
    if (source.withAudio) {
      this.spawnAudioPipeline(source);
      // Spawn level metering pipeline (measurement-only, does NOT count against MAX_PREVIEW_STREAMS)
      if (this.levelElementAvailable) {
        this.spawnLevelPipeline(source);
      }
    }

    proc.on("close", (code) => {
      logger.info(`Preview pipeline exited for ${source.sourceId} with code ${code}`);
      source.process = null;
      if (source.restartResetTimer) {
        clearTimeout(source.restartResetTimer);
        source.restartResetTimer = null;
      }
      if (this.destroyed) return;
      if (source.subscribers.size === 0) return;

      source.restartCount++;
      if (source.restartCount >= MAX_RESTART_ATTEMPTS) {
        logger.error(`Preview pipeline failed ${MAX_RESTART_ATTEMPTS} times for ${source.sourceId}, closing subscribers`);
        for (const ws of source.subscribers) {
          ws.close(1011, "Preview stream failed");
        }
        source.subscribers.clear();
        source.restartCount = 0;
        return;
      }

      logger.warn(
        `Preview pipeline exited (code ${code}) for ${source.sourceId}, restarting in ${RESTART_DELAY_MS}ms (attempt ${source.restartCount}/${MAX_RESTART_ATTEMPTS})`,
      );
      setTimeout(() => {
        if (!this.destroyed && source.available && source.subscribers.size > 0) {
          this.spawnPipeline(source);
        }
      }, RESTART_DELAY_MS);
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      logger.debug(`Preview pipeline stderr [${source.sourceId}]: ${chunk.toString().trim()}`);
    });

    proc.on("error", () => {
      source.process = null;
    });
  }

  private spawnAudioPipeline(source: PreviewSource): void {
    if (this.destroyed || !this.gstreamerAvailable) return;
    const args = buildAudioArgs(source.ndiName);
    logger.info(`Preview spawning audio pipeline for ${source.sourceId}`, { context: { args: args.join(" ") } });
    const audioProc = this.spawnFn("gst-launch-1.0", args);
    source.audioProcess = audioProc;

    // PCM audio comes as a continuous byte stream. Split into chunks based on configured duration.
    const bytesPerChunk = (PREVIEW_AUDIO_SAMPLE_RATE * PREVIEW_AUDIO_CHANNELS * 2 * PREVIEW_AUDIO_CHUNK_MS) / 1000;
    let audioBuffer = Buffer.alloc(0);

    audioProc.stdout?.on("data", (chunk: Buffer) => {
      audioBuffer = Buffer.concat([audioBuffer, chunk]);

      while (audioBuffer.length >= bytesPerChunk) {
        const audioChunk = audioBuffer.subarray(0, bytesPerChunk);
        audioBuffer = audioBuffer.subarray(bytesPerChunk);

        // Prefix with audio type byte
        const prefixed = Buffer.allocUnsafe(1 + audioChunk.length);
        prefixed[0] = PREVIEW_MSG_AUDIO;
        audioChunk.copy(prefixed, 1);
        this.fanOut(source, prefixed);
      }
    });

    audioProc.on("close", (code) => {
      logger.info(`Audio pipeline exited for ${source.sourceId} with code ${code}`);
      source.audioProcess = null;
      // Don't restart audio independently — it will restart with the video pipeline
    });

    audioProc.stderr?.on("data", (chunk: Buffer) => {
      logger.debug(`Audio pipeline stderr [${source.sourceId}]: ${chunk.toString().trim()}`);
    });

    audioProc.on("error", () => {
      source.audioProcess = null;
    });
  }

  /**
   * Spawn a GStreamer level pipeline for audio metering. This is a measurement-only
   * pipeline that uses the `level` element to compute per-channel peak amplitude and
   * emits results on the EventBus. Does NOT count against MAX_PREVIEW_STREAMS.
   */
  private spawnLevelPipeline(source: PreviewSource): void {
    if (this.destroyed || !this.gstreamerAvailable || !this.levelElementAvailable) return;
    if (source.levelProcess) return; // Already running

    const args = buildLevelArgs(source.ndiName);
    logger.info(`Preview spawning level pipeline for ${source.sourceId}`, { context: { args: args.join(" ") } });
    const levelProc = this.spawnFn("gst-launch-1.0", args);
    source.levelProcess = levelProc;

    // Attach the coalescing parser that emits to the EventBus
    attachLevelParser(levelProc, (levels) => {
      eventBus.emit(BUS_OBS_AUDIO_LEVELS, levels);
    });

    levelProc.on("close", (code) => {
      logger.info(`Level pipeline exited for ${source.sourceId} with code ${code}`);
      source.levelProcess = null;
      if (this.destroyed) return;
      // Only restart if the parent video pipeline is still running
      if (!source.process) return;

      source.levelRestartCount++;
      if (source.levelRestartCount >= LEVEL_MAX_RESTART_ATTEMPTS) {
        logger.error(`Level pipeline failed ${LEVEL_MAX_RESTART_ATTEMPTS} times for ${source.sourceId}, entering dormant state`);
        return;
      }

      logger.warn(
        `Level pipeline exited (code ${code}) for ${source.sourceId}, restarting in ${LEVEL_RESTART_DELAY_MS}ms (attempt ${source.levelRestartCount}/${LEVEL_MAX_RESTART_ATTEMPTS})`,
      );
      source.levelRestartTimer = setTimeout(() => {
        source.levelRestartTimer = null;
        if (!this.destroyed && source.process && !source.levelProcess) {
          this.spawnLevelPipeline(source);
        }
      }, LEVEL_RESTART_DELAY_MS);
    });

    levelProc.stderr?.on("data", (chunk: Buffer) => {
      logger.debug(`Level pipeline stderr [${source.sourceId}]: ${chunk.toString().trim()}`);
    });

    levelProc.on("error", () => {
      source.levelProcess = null;
    });
  }

  private killLevelPipeline(source: PreviewSource): void {
    if (source.levelRestartTimer) {
      clearTimeout(source.levelRestartTimer);
      source.levelRestartTimer = null;
    }
    if (source.levelProcess) {
      source.levelProcess.kill("SIGTERM");
      source.levelProcess = null;
    }
  }

  private async checkLevelElement(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const proc = this.spawnFn("gst-inspect-1.0", ["level"]);
      proc.on("close", (code) => resolve(code === 0));
      proc.on("error", () => resolve(false));
    });
  }

  private fanOut(source: PreviewSource, data: Buffer): void {
    for (const ws of source.subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  private killProcess(source: PreviewSource): void {
    if (source.process) {
      source.process.kill("SIGTERM");
      source.process = null;
    }
    if (source.audioProcess) {
      source.audioProcess.kill("SIGTERM");
      source.audioProcess = null;
    }
    this.killLevelPipeline(source);
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      for (const source of this.sources.values()) {
        for (const ws of source.subscribers) {
          if ((ws as WebSocket & { isAlive?: boolean }).isAlive === false) {
            source.subscribers.delete(ws);
            ws.terminate();
            continue;
          }
          (ws as WebSocket & { isAlive?: boolean }).isAlive = false;
          ws.ping();
        }
      }
    }, PING_INTERVAL_MS);
  }

  private registerSignalHandlers(): void {
    if (this.signalCleanupRegistered) return;
    this.signalCleanupRegistered = true;

    const cleanup = (): void => {
      for (const source of this.sources.values()) {
        this.killProcess(source);
      }
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  }
}

// ── Exported utilities ───────────────────────────────────────────────────────

export function buildMjpegArgs(ndiName: string): string[] {
  const { width, height } = MJPEG_RESOLUTION;

  const args = ["-q", "-e"];

  // ndisrc → decodebin → scale to 480p → rate limit → JPEG encode → stdout
  args.push("ndisrc", `ndi-name="${ndiName}"`, "do-timestamp=true", "!");
  args.push("decodebin", "!");
  args.push("queue", "max-size-buffers=1", "max-size-time=0", "max-size-bytes=0", "leaky=downstream", "!");
  args.push("videoconvert", "!");
  args.push("videoscale", "!", `video/x-raw,width=${width},height=${height}`, "!");
  args.push("videorate", "!", `video/x-raw,framerate=${MJPEG_FRAMERATE}/1`, "!");
  args.push("jpegenc", `quality=${MJPEG_QUALITY}`, "!");
  args.push("fdsink", "fd=1");

  return args;
}

export function buildAudioArgs(ndiName: string): string[] {
  const args = ["-q", "-e"];

  // ndisrc → decodebin → audio only → resample → raw PCM s16le → stdout
  args.push("ndisrc", `ndi-name="${ndiName}"`, "do-timestamp=true", "!");
  args.push("decodebin", "!");
  args.push("queue", "max-size-buffers=1", "max-size-time=0", "max-size-bytes=0", "leaky=downstream", "!");
  args.push("audioconvert", "!");
  args.push("audioresample", "!");
  args.push(`audio/x-raw,format=S16LE,rate=${PREVIEW_AUDIO_SAMPLE_RATE},channels=${PREVIEW_AUDIO_CHANNELS}`, "!");
  args.push("fdsink", "fd=1");

  return args;
}

export function buildLevelArgs(ndiName: string): string[] {
  // Level metering pipeline — measures stereo peak amplitude at 10Hz, outputs
  // structured bus messages to stdout via the -m flag. Does not produce audio output.
  const args = ["-m", "-q"];

  args.push("ndisrc", `ndi-name="${ndiName}"`, "do-timestamp=true", "!");
  args.push("decodebin", "!");
  args.push("audioconvert", "!");
  args.push("audio/x-raw,channels=2", "!");
  args.push("level", "interval=100000000", "post-messages=true", "!");
  args.push("fakesink");

  return args;
}

export async function probeEncoder(spawnFn: SpawnFn): Promise<GstEncoder> {
  const candidates: Array<{ probe: string; element: string; options: string; description: string }> = [
    {
      probe: "qsvh264enc",
      element: "qsvh264enc",
      options: "target-usage=7 gop-size=15 low-latency=true ref-frames=1",
      description: "Intel QSV (Quick Sync Video)",
    },
    { probe: "vaapih264enc", element: "vaapih264enc", options: "rate-control=cqp keyframe-period=15", description: "VA-API (Intel/AMD)" },
    { probe: "nvh264enc", element: "nvh264enc", options: "preset=low-latency gop-size=15", description: "NVIDIA NVENC" },
  ];

  const probeResults: string[] = [];

  for (const c of candidates) {
    const ok = await new Promise<boolean>((resolve) => {
      const proc = spawnFn("gst-inspect-1.0", [c.probe]);
      proc.on("close", (code) => resolve(code === 0));
      proc.on("error", () => resolve(false));
    });
    if (ok) {
      probeResults.push(`${c.probe} (${c.description}): ✓ available`);
      logger.info("Hardware encoder probe results", { context: { results: probeResults } });
      return { element: c.element, options: c.options };
    }
    probeResults.push(`${c.probe} (${c.description}): ✗ not found`);
  }

  logger.warn(
    "No hardware encoder found — falling back to software x264enc. Install gstreamer1.0-plugins-bad with Intel QSV support for hardware acceleration.",
    {
      context: { probeResults },
    },
  );
  return null;
}

export function checkGstreamerPath(): boolean {
  try {
    execSync("gst-launch-1.0 --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ── Cookie parsing ──────────────────────────────────────────────────────────

function parseCookieHeader(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    result[pair.substring(0, idx).trim()] = pair.substring(idx + 1).trim();
  }
  return result;
}
