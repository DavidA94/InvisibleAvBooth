import { type Server as HttpServer } from "http";
import { type ChildProcess, spawn, execSync } from "child_process";
import { WebSocketServer, WebSocket } from "ws";
import type { AuthService } from "./authService.js";
import { logger } from "../logger.js";
import { eventBus } from "../eventBus/eventBus.js";
import { BUS_DEVICE_CAPABILITIES_UPDATED } from "../eventBus/types.js";

// ── Constants ────────────────────────────────────────────────────────────────

export const PREVIEW_RESOLUTION = { width: 1280, height: 720 };
export const MAX_PREVIEW_STREAMS = 4;
export const GRACE_PERIOD_MS = 3000;
export const MAX_RESTART_ATTEMPTS = 3;
export const RESTART_DELAY_MS = 2000;

export type HardwareEncoder = "h264_vaapi" | "h264_qsv" | "h264_nvenc" | null;

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface PreviewSource {
  sourceId: string;
  inputUrl: string;
  ffmpegProcess: ChildProcess | null;
  subscribers: Set<WebSocket>;
  initSegment: Buffer | null;
  graceTimeout: ReturnType<typeof setTimeout> | null;
  restartCount: number;
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
  private encoder: HardwareEncoder = null;
  private ffmpegAvailable = false;
  private authService: AuthService;
  private spawnFn: SpawnFn;
  private signalCleanupRegistered = false;
  private destroyed = false;

  constructor(authService: AuthService, spawnFn?: SpawnFn) {
    this.authService = authService;
    this.spawnFn = spawnFn ?? ((cmd, args) => spawn(cmd, args));
    this.wss = new WebSocketServer({ noServer: true });
  }

  async initialize(): Promise<void> {
    this.ffmpegAvailable = checkFfmpegPath();
    if (!this.ffmpegAvailable) {
      logger.error("FFmpeg not found on PATH — preview streams unavailable");
      eventBus.emit(BUS_DEVICE_CAPABILITIES_UPDATED, {
        deviceId: "preview",
        capabilities: { deviceId: "preview", deviceType: "obs", features: { preview: false } },
      });
      return;
    }
    this.encoder = await probeEncoder(this.spawnFn);
    logger.info(`Preview encoder selected: ${this.encoder ?? "libx264 ultrafast"}`, {
      context: { encoder: this.encoder ?? "libx264" },
    });
    this.registerSignalHandlers();
  }

  registerEndpoints(server: HttpServer): void {
    server.on("upgrade", (req, socket, head) => {
      const url = req.url ?? "";
      if (!url.startsWith("/preview/")) return; // let Socket.io handle

      // Auth via cookie
      const cookies = parseCookieHeader(req.headers.cookie ?? "");
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

      // Determine sourceId from URL
      const sourceId = this.parseSourceId(url);
      if (!sourceId) {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
        return;
      }

      // Check max streams
      if (this.getActiveStreams() >= MAX_PREVIEW_STREAMS && !this.sources.has(sourceId)) {
        this.wss.handleUpgrade(req, socket, head, (ws) => {
          ws.close(4503, "Max preview streams reached");
        });
        return;
      }

      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.handleConnection(ws, sourceId);
      });
    });
  }

  setSourceAvailable(sourceId: string, available: boolean, inputUrl: string): void {
    let source = this.sources.get(sourceId);
    if (!source) {
      source = {
        sourceId,
        inputUrl,
        ffmpegProcess: null,
        subscribers: new Set(),
        initSegment: null,
        graceTimeout: null,
        restartCount: 0,
        available: false,
        withAudio: sourceId === "obs",
      };
      this.sources.set(sourceId, source);
    }
    source.available = available;
    source.inputUrl = inputUrl;

    if (available && source.subscribers.size > 0 && !source.ffmpegProcess) {
      this.spawnFfmpeg(source);
    }
    if (!available && source.ffmpegProcess) {
      this.killFfmpeg(source);
    }
  }

  getActiveStreams(): number {
    let count = 0;
    for (const s of this.sources.values()) {
      if (s.ffmpegProcess) count++;
    }
    return count;
  }

  getSubscriberCount(sourceId: string): number {
    return this.sources.get(sourceId)?.subscribers.size ?? 0;
  }

  isAvailable(): boolean {
    return this.ffmpegAvailable;
  }

  getEncoder(): HardwareEncoder {
    return this.encoder;
  }

  destroy(): void {
    this.destroyed = true;
    for (const source of this.sources.values()) {
      if (source.graceTimeout) clearTimeout(source.graceTimeout);
      this.killFfmpeg(source);
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
    // /preview/obs → "obs"
    // /preview/camera/:id → "camera-{id}"
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
        inputUrl: "",
        ffmpegProcess: null,
        subscribers: new Set(),
        initSegment: null,
        graceTimeout: null,
        restartCount: 0,
        available: false,
        withAudio: sourceId === "obs",
      };
      this.sources.set(sourceId, source);
    }

    source.subscribers.add(ws);

    // Cancel grace period if active
    if (source.graceTimeout) {
      clearTimeout(source.graceTimeout);
      source.graceTimeout = null;
    }

    // Send cached init segment
    if (source.initSegment && ws.readyState === WebSocket.OPEN) {
      ws.send(source.initSegment);
    }

    // Lazy spawn if source available and no process
    if (source.available && !source.ffmpegProcess && this.ffmpegAvailable) {
      this.spawnFfmpeg(source);
    }

    ws.on("close", () => {
      source!.subscribers.delete(ws);
      if (source!.subscribers.size === 0 && source!.ffmpegProcess) {
        // Start grace period
        source!.graceTimeout = setTimeout(() => {
          if (source!.subscribers.size === 0) {
            this.killFfmpeg(source!);
            source!.initSegment = null;
          }
        }, GRACE_PERIOD_MS);
      }
    });

    ws.on("error", () => {
      source!.subscribers.delete(ws);
    });
  }

  private spawnFfmpeg(source: PreviewSource): void {
    if (this.destroyed || !this.ffmpegAvailable) return;
    const args = buildFfmpegArgs(source.inputUrl, this.encoder, source.withAudio);
    const proc = this.spawnFn("ffmpeg", args);
    source.ffmpegProcess = proc;
    source.initSegment = null;

    let initBuffer = Buffer.alloc(0);
    let initDone = false;

    proc.stdout?.on("data", (chunk: Buffer) => {
      if (!initDone) {
        initBuffer = Buffer.concat([initBuffer, chunk]);
        // Detect end of init segment (moov box)
        const moovIdx = findBox(initBuffer, "moov");
        if (moovIdx >= 0) {
          const moovEnd = moovIdx + readBoxSize(initBuffer, moovIdx);
          if (moovEnd <= initBuffer.length) {
            source.initSegment = initBuffer.subarray(0, moovEnd);
            initDone = true;
            // Send init + remainder to all subscribers
            for (const ws of source.subscribers) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(source.initSegment);
              }
            }
            const remainder = initBuffer.subarray(moovEnd);
            if (remainder.length > 0) {
              this.fanOut(source, remainder);
            }
          }
        }
      } else {
        this.fanOut(source, chunk);
      }
    });

    proc.on("close", (code) => {
      source.ffmpegProcess = null;
      if (this.destroyed) return;
      if (source.subscribers.size === 0) return;

      // Failure handling
      source.restartCount++;
      if (source.restartCount >= MAX_RESTART_ATTEMPTS) {
        logger.error(`Preview FFmpeg failed ${MAX_RESTART_ATTEMPTS} times for ${source.sourceId}, closing subscribers`);
        for (const ws of source.subscribers) {
          ws.close(1011, "Preview stream failed");
        }
        source.subscribers.clear();
        source.restartCount = 0;
        return;
      }

      logger.warn(
        `Preview FFmpeg exited (code ${code}) for ${source.sourceId}, restarting in ${RESTART_DELAY_MS}ms (attempt ${source.restartCount}/${MAX_RESTART_ATTEMPTS})`,
      );
      setTimeout(() => {
        if (!this.destroyed && source.available && source.subscribers.size > 0) {
          this.spawnFfmpeg(source);
        }
      }, RESTART_DELAY_MS);
    });

    proc.stderr?.on("data", () => {
      // Suppress FFmpeg stderr noise
    });

    proc.on("error", () => {
      source.ffmpegProcess = null;
    });
  }

  private fanOut(source: PreviewSource, data: Buffer): void {
    for (const ws of source.subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  private killFfmpeg(source: PreviewSource): void {
    if (source.ffmpegProcess) {
      source.ffmpegProcess.kill("SIGTERM");
      source.ffmpegProcess = null;
    }
  }

  private registerSignalHandlers(): void {
    if (this.signalCleanupRegistered) return;
    this.signalCleanupRegistered = true;

    const cleanup = (): void => {
      for (const source of this.sources.values()) {
        this.killFfmpeg(source);
      }
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  }
}

// ── Exported utilities ───────────────────────────────────────────────────────

export function buildFfmpegArgs(input: string, encoder: HardwareEncoder, withAudio: boolean): string[] {
  const base = ["-i", input, "-vf", `scale=${PREVIEW_RESOLUTION.width}:${PREVIEW_RESOLUTION.height}`, "-r", "30", "-g", "30"];
  const audioArgs = withAudio ? ["-c:a", "aac", "-b:a", "64k"] : ["-an"];
  const codecArgs = encoder ? ["-c:v", encoder] : ["-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency"];
  return [...base, ...audioArgs, ...codecArgs, "-f", "mp4", "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-frag_duration", "100000", "pipe:1"];
}

export async function probeEncoder(spawnFn: SpawnFn): Promise<HardwareEncoder> {
  try {
    const proc = spawnFn("ffmpeg", ["-encoders", "-hide_banner"]);
    const output = await new Promise<string>((resolve) => {
      let data = "";
      proc.stdout?.on("data", (chunk: Buffer) => {
        data += chunk.toString();
      });
      proc.on("close", () => resolve(data));
      proc.on("error", () => resolve(""));
    });
    const priority: HardwareEncoder[] = ["h264_vaapi", "h264_qsv", "h264_nvenc"];
    for (const enc of priority) {
      if (output.includes(enc!)) return enc;
    }
  } catch {
    // Fall through to software
  }
  return null;
}

export function checkFfmpegPath(): boolean {
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ── MP4 box helpers ──────────────────────────────────────────────────────────

function findBox(buf: Buffer, type: string): number {
  const typeBytes = Buffer.from(type, "ascii");
  for (let i = 0; i <= buf.length - 8; i++) {
    if (buf[i + 4] === typeBytes[0] && buf[i + 5] === typeBytes[1] && buf[i + 6] === typeBytes[2] && buf[i + 7] === typeBytes[3]) {
      return i;
    }
  }
  return -1;
}

function readBoxSize(buf: Buffer, offset: number): number {
  return buf.readUInt32BE(offset);
}

function parseCookieHeader(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    result[pair.substring(0, idx).trim()] = pair.substring(idx + 1).trim();
  }
  return result;
}
