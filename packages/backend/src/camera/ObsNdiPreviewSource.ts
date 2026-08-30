/**
 * OBS NDI Preview Source.
 *
 * Reads `ndiOutputName` from OBS device metadata and registers it with
 * VideoPreviewManager. GStreamer handles NDI receive internally.
 */
import type { Database } from "better-sqlite3";
import type { VideoPreviewManager } from "../services/videoPreviewManager.js";
import { eventBus } from "../eventBus/eventBus.js";
import { BUS_DEVICE_CAPABILITIES_UPDATED, BUS_OBS_CONFIG_CHANGED } from "../eventBus/types.js";
import { logger } from "../logger.js";

const OBS_PREVIEW_SOURCE_ID = "obs";

export class ObsNdiPreviewSource {
  private database: Database;
  private previewManager: VideoPreviewManager;
  private ndiOutputName: string | null = null;

  constructor(database: Database, previewManager: VideoPreviewManager) {
    this.database = database;
    this.previewManager = previewManager;
  }

  async initialize(): Promise<void> {
    this.ndiOutputName = this.readNdiOutputName();
    eventBus.emit(BUS_DEVICE_CAPABILITIES_UPDATED, {
      deviceId: "obs-preview",
      capabilities: { deviceId: "obs-preview", deviceType: "obs", features: { ndiConfigured: !!this.ndiOutputName } },
    });
    if (!this.ndiOutputName) {
      logger.info("OBS NDI preview not configured — no ndiOutputName in OBS device metadata");
      return;
    }
    this.previewManager.setSourceAvailable(OBS_PREVIEW_SOURCE_ID, true, this.ndiOutputName);
    logger.info(`OBS NDI preview registered: "${this.ndiOutputName}"`);

    // Hot-reload: re-read NDI output name when OBS config changes
    eventBus.subscribe(BUS_OBS_CONFIG_CHANGED, () => this.reload());
  }

  getNdiOutputName(): string | null {
    return this.ndiOutputName;
  }

  /** Re-read OBS NDI config from database and update preview source. */
  private reload(): void {
    const newName = this.readNdiOutputName();
    if (newName === this.ndiOutputName) return; // no change

    // Tear down old source if name changed or was removed
    if (this.ndiOutputName) {
      this.previewManager.setSourceAvailable(OBS_PREVIEW_SOURCE_ID, false, "");
    }

    this.ndiOutputName = newName;
    eventBus.emit(BUS_DEVICE_CAPABILITIES_UPDATED, {
      deviceId: "obs-preview",
      capabilities: { deviceId: "obs-preview", deviceType: "obs", features: { ndiConfigured: !!this.ndiOutputName } },
    });

    if (this.ndiOutputName) {
      this.previewManager.setSourceAvailable(OBS_PREVIEW_SOURCE_ID, true, this.ndiOutputName);
      logger.info(`OBS NDI preview reloaded: "${this.ndiOutputName}"`);
    } else {
      logger.info("OBS NDI preview removed — ndiOutputName cleared");
    }
  }

  destroy(): void {
    this.previewManager.setSourceAvailable(OBS_PREVIEW_SOURCE_ID, false, "");
  }

  private readNdiOutputName(): string | null {
    const row = this.database.prepare("SELECT metadata FROM device_connections WHERE deviceType = 'obs' AND enabled = 1 LIMIT 1").get() as
      { metadata: string } | undefined;
    if (!row) return null;
    try {
      const meta = JSON.parse(row.metadata) as { ndiOutputName?: string };
      return meta.ndiOutputName || null;
    } catch {
      return null;
    }
  }
}
