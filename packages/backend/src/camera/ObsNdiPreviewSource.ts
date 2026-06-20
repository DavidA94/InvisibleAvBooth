/**
 * OBS NDI Preview Source.
 *
 * Reads `ndiOutputName` from OBS device metadata and registers it with
 * PreviewStreamManager. GStreamer handles NDI receive internally.
 */
import type { Database } from "better-sqlite3";
import type { PreviewStreamManager } from "../services/previewStreamManager.js";
import { eventBus } from "../eventBus/eventBus.js";
import { BUS_DEVICE_CAPABILITIES_UPDATED } from "../eventBus/types.js";
import { logger } from "../logger.js";

const OBS_PREVIEW_SOURCE_ID = "obs";

export class ObsNdiPreviewSource {
  private database: Database;
  private previewManager: PreviewStreamManager;
  private ndiOutputName: string | null = null;

  constructor(database: Database, previewManager: PreviewStreamManager) {
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
  }

  getNdiOutputName(): string | null {
    return this.ndiOutputName;
  }

  destroy(): void {
    this.previewManager.setSourceAvailable(OBS_PREVIEW_SOURCE_ID, false, "");
  }

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
}
