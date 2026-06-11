/**
 * OBS NDI Preview Source.
 *
 * Reads `ndiOutputName` from OBS device metadata, connects a grandiose
 * receiver to OBS's NDI output (via DistroAV plugin), and pipes raw frames
 * through NdiFramePipe → FFmpeg → PreviewStreamManager.
 */
import type { Database } from "better-sqlite3";
import type { PreviewStreamManager } from "../services/previewStreamManager.js";
import { NdiFramePipe } from "./ndiFramePipe.js";
import { getNdiModule, isNdiAvailable } from "./ndiLoader.js";
import { logger } from "../logger.js";

const OBS_PREVIEW_SOURCE_ID = "obs";
const RECONNECT_DELAY_MS = 5000;

export class ObsNdiPreviewSource {
  private database: Database;
  private previewManager: PreviewStreamManager;
  private framePipe = new NdiFramePipe();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private receiver: any = null;
  private running = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private ndiOutputName: string | null = null;

  constructor(database: Database, previewManager: PreviewStreamManager) {
    this.database = database;
    this.previewManager = previewManager;
  }

  /** Initialize — read OBS device config and start receiving if configured. */
  async initialize(): Promise<void> {
    this.ndiOutputName = this.readNdiOutputName();
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
      const meta = JSON.parse(row.metadata) as { ndiOutputName?: string };
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
      const sources = await ndi.find({ showLocalSources: true });
      const source = sources.find((s: { name: string }) => s.name === this.ndiOutputName);
      if (!source) {
        logger.warn(`OBS NDI source "${this.ndiOutputName}" not found — DistroAV may not be enabled`);
        this.previewManager.setSourceAvailable(OBS_PREVIEW_SOURCE_ID, false, "pipe:0");
        this.scheduleReconnect();
        return;
      }

      this.receiver = await ndi.receive({ source, colorFormat: ndi.COLOR_FORMAT_FASTEST });
      this.running = true;
      this.previewManager.setSourceAvailable(OBS_PREVIEW_SOURCE_ID, true, "pipe:0");
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
      while (this.running && this.receiver) {
        try {
          const frame = await this.receiver.video(1000); // 1s timeout
          if (frame && frame.data) {
            this.framePipe.pushFrame(frame);
          }
        } catch {
          if (this.running) {
            logger.warn("OBS NDI receive error — source may have disconnected");
            this.previewManager.setSourceAvailable(OBS_PREVIEW_SOURCE_ID, false, "pipe:0");
            this.receiver = null;
            this.scheduleReconnect();
            return;
          }
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
