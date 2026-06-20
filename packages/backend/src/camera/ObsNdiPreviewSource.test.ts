import { describe, it, expect, vi, afterEach } from "vitest";
import Database from "better-sqlite3";
import { applySchema } from "../database/schema.js";
import { ObsNdiPreviewSource } from "./ObsNdiPreviewSource.js";
import type { PreviewStreamManager } from "../services/previewStreamManager.js";

vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../eventBus/eventBus.js", () => ({
  eventBus: { emit: vi.fn(), subscribe: vi.fn() },
}));

import { eventBus } from "../eventBus/eventBus.js";

function createMockPreviewManager(): PreviewStreamManager {
  return { setSourceAvailable: vi.fn() } as unknown as PreviewStreamManager;
}

function createDbWithObsDevice(ndiOutputName?: string): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  const metadata = ndiOutputName ? JSON.stringify({ ndiOutputName }) : "{}";
  db.prepare(
    "INSERT INTO device_connections (id, deviceType, label, host, port, metadata, features, enabled, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run("obs-1", "obs", "Main OBS", "10.0.0.1", 4455, metadata, "{}", 1, new Date().toISOString());
  return db;
}

describe("ObsNdiPreviewSource", () => {
  let source: ObsNdiPreviewSource;
  let previewManager: PreviewStreamManager;

  afterEach(() => {
    source?.destroy();
  });

  it("does nothing when no OBS device exists", async () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    applySchema(db);
    previewManager = createMockPreviewManager();
    source = new ObsNdiPreviewSource(db, previewManager);

    await source.initialize();
    expect(source.getNdiOutputName()).toBeNull();
    expect(previewManager.setSourceAvailable).not.toHaveBeenCalled();
    expect(eventBus.emit).toHaveBeenCalledWith(
      "bus:device:capabilities:updated",
      expect.objectContaining({
        capabilities: expect.objectContaining({ features: { ndiConfigured: false } }),
      }),
    );
  });

  it("does nothing when OBS device has no ndiOutputName", async () => {
    const db = createDbWithObsDevice();
    previewManager = createMockPreviewManager();
    source = new ObsNdiPreviewSource(db, previewManager);

    await source.initialize();
    expect(source.getNdiOutputName()).toBeNull();
    expect(previewManager.setSourceAvailable).not.toHaveBeenCalled();
  });

  it("registers source when ndiOutputName is configured", async () => {
    const db = createDbWithObsDevice("MY-PC (OBS)");
    previewManager = createMockPreviewManager();
    source = new ObsNdiPreviewSource(db, previewManager);

    await source.initialize();
    expect(source.getNdiOutputName()).toBe("MY-PC (OBS)");
    expect(previewManager.setSourceAvailable).toHaveBeenCalledWith("obs", true, "MY-PC (OBS)");
    expect(eventBus.emit).toHaveBeenCalledWith(
      "bus:device:capabilities:updated",
      expect.objectContaining({
        capabilities: expect.objectContaining({ features: { ndiConfigured: true } }),
      }),
    );
  });

  it("destroy marks source unavailable", async () => {
    const db = createDbWithObsDevice("MY-PC (OBS)");
    previewManager = createMockPreviewManager();
    source = new ObsNdiPreviewSource(db, previewManager);
    await source.initialize();

    source.destroy();
    expect(previewManager.setSourceAvailable).toHaveBeenCalledWith("obs", false, "");
  });
});
