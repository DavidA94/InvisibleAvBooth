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

export type GstEncoder = { element: string; options: string } | null;

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface PreviewSource {
  sourceId: string;
  ndiName: string;
  process: ChildProcess | null;
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
  private encoder: GstEncoder = null;
  private gstreamerAvailable = false;
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
    this.registerSignalHandlers();
  }

  registerEndpoints(server: HttpServer): void {
    server.on("upgrade", (req, socket, head) => {
      const url = req.url ?? "";
      if (!url.startsWith("/preview/")) return;

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

      const sourceId = this.parseSourceId(url);
      if (!sourceId) {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
        return;
      }

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

  setSourceAvailable(sourceId: string, available: boolean, ndiName: string): void {
    let source = this.sources.get(sourceId);
    if (!source) {
      source = {
        sourceId,
        ndiName,
        process: null,
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

  getEncoder(): GstEncoder {
    return this.encoder;
  }

  destroy(): void {
    this.destroyed = true;
    for (const source of this.sources.values()) {
      if (source.graceTimeout) clearTimeout(source.graceTimeout);
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
    logger.info(`Preview [${source.sourceId}]: subscriber connected (total: ${source.subscribers.size})`);

    if (source.graceTimeout) {
      clearTimeout(source.graceTimeout);
      source.graceTimeout = null;
    }

    if (source.initSegment && ws.readyState === WebSocket.OPEN) {
      ws.send(source.initSegment);
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
            source!.initSegment = null;
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
    const args = buildGstreamerArgs(source.ndiName, this.encoder, source.withAudio);
    logger.info(`Preview spawning pipeline for ${source.sourceId}`, { context: { args: args.join(" ") } });
    const proc = this.spawnFn("gst-launch-1.0", args);
    source.process = proc;
    source.initSegment = null;

    let initBuffer = Buffer.alloc(0);
    let initDone = false;

    proc.stdout?.on("data", (chunk: Buffer) => {
      if (!initDone) {
        initBuffer = Buffer.concat([initBuffer, chunk]);
        const moovIdx = findBox(initBuffer, "moov");
        if (moovIdx >= 0) {
          const moovEnd = moovIdx + readBoxSize(initBuffer, moovIdx);
          if (moovEnd <= initBuffer.length) {
            source.initSegment = initBuffer.subarray(0, moovEnd);
            initDone = true;
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
      logger.info(`Preview pipeline exited for ${source.sourceId} with code ${code}`);
      source.process = null;
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

export function buildGstreamerArgs(ndiName: string, encoder: GstEncoder, withAudio: boolean): string[] {
  const { width, height } = PREVIEW_RESOLUTION;
  const enc = encoder ?? { element: "x264enc", options: "tune=zerolatency speed-preset=ultrafast key-int-max=15" };

  const args = ["-q", "-e"];

  // ndisrc → decodebin (handles dynamic pads from NDI)
  args.push("ndisrc", `ndi-name="${ndiName}"`, "do-timestamp=true", "!");
  args.push("decodebin", "name=dec");

  // Video branch: decode → drop/scale/rate to 15fps 720p → encode → mux
  args.push("dec.", "!");
  args.push("queue", "max-size-buffers=1", "max-size-time=0", "max-size-bytes=0", "leaky=downstream", "!");
  args.push("videoconvert", "!");
  args.push("videoscale", "!", `video/x-raw,width=${width},height=${height}`, "!");
  args.push("videorate", "!", "video/x-raw,framerate=15/1", "!");
  args.push(...enc.element.split(" "), ...enc.options.split(" "), "!");
  args.push("h264parse", "!", "mux.");

  // Audio branch (if enabled)
  if (withAudio) {
    args.push("dec.", "!");
    args.push("queue", "max-size-buffers=1", "max-size-time=0", "max-size-bytes=0", "leaky=downstream", "!");
    args.push("audioconvert", "!");
    args.push("avenc_aac", "bitrate=64000", "!", "mux.");
  }

  // Mux → stdout (fragment per keyframe for lowest latency)
  args.push("mp4mux", "name=mux", "fragment-duration=66", "streamable=true", "!");
  args.push("fdsink", "fd=1");

  return args;
}

export async function probeEncoder(spawnFn: SpawnFn): Promise<GstEncoder> {
  const candidates: Array<{ probe: string; element: string; options: string }> = [
    { probe: "qsvh264enc", element: "qsvh264enc", options: "target-usage=7 key-int-max=15" },
    { probe: "vaapih264enc", element: "vaapih264enc", options: "rate-control=cqp key-int-max=15" },
    { probe: "nvh264enc", element: "nvh264enc", options: "preset=low-latency gop-size=15" },
  ];

  for (const c of candidates) {
    const ok = await new Promise<boolean>((resolve) => {
      const proc = spawnFn("gst-inspect-1.0", [c.probe]);
      proc.on("close", (code) => resolve(code === 0));
      proc.on("error", () => resolve(false));
    });
    if (ok) return { element: c.element, options: c.options };
  }
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
