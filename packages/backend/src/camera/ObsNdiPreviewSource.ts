/**
 * OBS NDI Preview Source.
 *
 * Reads `ndiOutputName` from OBS device metadata, connects a grandiose
 * receiver to OBS's NDI output (via DistroAV plugin), and pipes raw frames
 * through NdiFramePipe → FFmpeg → PreviewStreamManager.
 */
import type { Database } from "better-sqlite3";
import type { PreviewStreamManager } from "../services/previewStreamManager.js";
import { NdiFramePipe, buildNdiInputArgs } from "./ndiFramePipe.js";
import { getNdiModule, isNdiAvailable, loadNdi } from "./ndiLoader.js";
import { findNdiSourceByName } from "./ndiFinder.js";
import { eventBus } from "../eventBus/eventBus.js";
import { BUS_DEVICE_CAPABILITIES_UPDATED } from "../eventBus/types.js";
import { logger } from "../logger.js";

const OBS_PREVIEW_SOURCE_ID = "obs";
const RECONNECT_DELAY_MS = 5000;

export class ObsNdiPreviewSource {
  private database: Database;
  private previewManager: PreviewStreamManager;
  private framePipe = new NdiFramePipe("obs");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private receiver: any = null;
  private running = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private ndiOutputName: string | null = null;
  private ndiExtraIPs: string | null = null;

  constructor(database: Database, previewManager: PreviewStreamManager) {
    this.database = database;
    this.previewManager = previewManager;
  }

  /** Initialize — read OBS device config and start receiving if configured. */
  async initialize(): Promise<void> {
    await loadNdi();
    this.ndiOutputName = this.readNdiOutputName();
    eventBus.emit(BUS_DEVICE_CAPABILITIES_UPDATED, {
      deviceId: "obs-preview",
      capabilities: { deviceId: "obs-preview", deviceType: "obs", features: { ndiConfigured: !!this.ndiOutputName } },
    });
    if (!this.ndiOutputName) {
      logger.info("OBS NDI preview not configured — no ndiOutputName in OBS device metadata");
      return;
    }
    if (!isNdiAvailable()) {
      logger.warn("OBS NDI preview unavailable — NDI SDK not loaded");
      return;
    }
    await this.connect();
  }

  /** Get the configured NDI output name (null if not configured). */
  getNdiOutputName(): string | null {
    return this.ndiOutputName;
  }

  destroy(): void {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.receiver = null;
    this.framePipe.destroy();
    this.previewManager.setSourceAvailable(OBS_PREVIEW_SOURCE_ID, false, "pipe:0");
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private readNdiOutputName(): string | null {
    const row = this.database.prepare("SELECT metadata FROM device_connections WHERE deviceType = 'obs' AND enabled = 1 LIMIT 1").get() as
      | { metadata: string }
      | undefined;
    if (!row) return null;
    try {
      const meta = JSON.parse(row.metadata) as { ndiOutputName?: string; ndiExtraIPs?: string };
      this.ndiExtraIPs = meta.ndiExtraIPs || null;
      return meta.ndiOutputName || null;
    } catch {
      return null;
    }
  }

  private async connect(): Promise<void> {
    if (!this.ndiOutputName || !isNdiAvailable()) return;

    const ndi = getNdiModule();
    if (!ndi) return;

    try {
      const mod = ndi.default ?? ndi;
      const source = await findNdiSourceByName(this.ndiOutputName, this.ndiExtraIPs, 1);
      if (!source) {
        logger.warn(`OBS NDI source "${this.ndiOutputName}" not found — DistroAV may not be enabled`);
        this.previewManager.setSourceAvailable(OBS_PREVIEW_SOURCE_ID, false, "pipe:0");
        this.scheduleReconnect();
        return;
      }

      this.receiver = await mod.receive({ source, colorFormat: mod.COLOR_FORMAT_FASTEST ?? 100 });
      this.running = true;
      logger.info(`Connected to OBS NDI output: "${this.ndiOutputName}"`);
      this.receiveLoop();
    } catch (err) {
      logger.error(`Failed to connect to OBS NDI source "${this.ndiOutputName}"`, { context: { error: String(err) } });
      this.previewManager.setSourceAvailable(OBS_PREVIEW_SOURCE_ID, false, "pipe:0");
      this.scheduleReconnect();
    }
  }

  private receiveLoop(): void {
    if (!this.running || !this.receiver) return;

    const poll = async (): Promise<void> => {
      let formatDetected = false;
      while (this.running && this.receiver) {
        try {
          // Use .data() to consume both video and audio frames — keeps NDI sender happy
          const frame = await this.receiver.data(5000);
          if (!frame) continue;

          // Only pipe video frames to FFmpeg
          if (frame.type === "video" && frame.data) {
            if (!formatDetected) {
              formatDetected = true;
              this.framePipe.pushFrame(frame);
              const format = this.framePipe.getFormat();
              if (format) {
                const inputArgs = buildNdiInputArgs(format);
                this.previewManager.setSourceAvailable(
                  OBS_PREVIEW_SOURCE_ID,
                  true,
                  "pipe:0",
                  (stdin) => this.framePipe.attach(stdin as import("stream").Writable),
                  inputArgs,
                );
              }
            } else {
              this.framePipe.pushFrame(frame);
            }
          }
          // Audio frames are consumed (keeping NDI flowing) but not piped yet
          // TODO: Add audio piping via separate mechanism
        } catch (err) {
          if (!this.running) return;
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("timeout") || msg.includes("Timeout")) continue;
          logger.warn("OBS NDI receive error — source may have disconnected", { context: { error: msg } });
          this.framePipe.detach();
          this.previewManager.setSourceAvailable(OBS_PREVIEW_SOURCE_ID, false, "pipe:0");
          this.receiver = null;
          this.scheduleReconnect();
          return;
        }
      }
    };
    poll();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.ndiOutputName) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY_MS);
  }
}
