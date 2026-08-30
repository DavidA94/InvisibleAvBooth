import { describe, it, expect, vi, afterEach } from "vitest";
import Database from "better-sqlite3";
import { applySchema } from "../database/schema.js";
import { ObsNdiPreviewSource } from "./ObsNdiPreviewSource.js";
import type { VideoPreviewManager } from "../services/videoPreviewManager.js";

vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../eventBus/eventBus.js", () => ({
  eventBus: { emit: vi.fn(), subscribe: vi.fn() },
}));

import { eventBus } from "../eventBus/eventBus.js";

function createMockPreviewManager(): VideoPreviewManager {
  return { setSourceAvailable: vi.fn() } as unknown as VideoPreviewManager;
}

function createDbWithObsDevice(ndiOutputName?: string): Database.Database {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  applySchema(database);
  const metadata = ndiOutputName ? JSON.stringify({ ndiOutputName }) : "{}";
  database
    .prepare("INSERT INTO device_connections (id, deviceType, label, host, port, metadata, features, enabled, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run("obs-1", "obs", "Main OBS", "10.0.0.1", 4455, metadata, "{}", 1, new Date().toISOString());
  return database;
}

describe("ObsNdiPreviewSource", () => {
  let source: ObsNdiPreviewSource;
  let previewManager: VideoPreviewManager;

  afterEach(() => {
    source?.destroy();
    vi.clearAllMocks();
  });

  it("does nothing when no OBS device exists", async () => {
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    applySchema(database);
    previewManager = createMockPreviewManager();
    source = new ObsNdiPreviewSource(database, previewManager);

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
    const database = createDbWithObsDevice();
    previewManager = createMockPreviewManager();
    source = new ObsNdiPreviewSource(database, previewManager);

    await source.initialize();
    expect(source.getNdiOutputName()).toBeNull();
    expect(previewManager.setSourceAvailable).not.toHaveBeenCalled();
  });

  it("registers source when ndiOutputName is configured", async () => {
    const database = createDbWithObsDevice("MY-PC (OBS)");
    previewManager = createMockPreviewManager();
    source = new ObsNdiPreviewSource(database, previewManager);

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
    const database = createDbWithObsDevice("MY-PC (OBS)");
    previewManager = createMockPreviewManager();
    source = new ObsNdiPreviewSource(database, previewManager);
    await source.initialize();

    source.destroy();
    expect(previewManager.setSourceAvailable).toHaveBeenCalledWith("obs", false, "");
  });

  it("reload updates source when ndiOutputName changes", async () => {
    const database = createDbWithObsDevice("OLD-NAME");
    previewManager = createMockPreviewManager();
    source = new ObsNdiPreviewSource(database, previewManager);
    await source.initialize();

    // Capture the subscriber callback for BUS_OBS_CONFIG_CHANGED
    const subscribeMock = vi.mocked(eventBus.subscribe);
    const reloadCb = subscribeMock.mock.calls.find((call) => call[0] === "bus:obs:config:changed")?.[1] as (() => void) | undefined;
    expect(reloadCb).toBeDefined();

    // Update DB with new name
    database.prepare("UPDATE device_connections SET metadata = ? WHERE id = 'obs-1'").run(JSON.stringify({ ndiOutputName: "NEW-NAME" }));
    reloadCb!();

    expect(source.getNdiOutputName()).toBe("NEW-NAME");
    expect(previewManager.setSourceAvailable).toHaveBeenCalledWith("obs", false, "");
    expect(previewManager.setSourceAvailable).toHaveBeenCalledWith("obs", true, "NEW-NAME");
  });

  it("reload removes source when ndiOutputName cleared", async () => {
    const database = createDbWithObsDevice("MY-PC");
    previewManager = createMockPreviewManager();
    source = new ObsNdiPreviewSource(database, previewManager);
    await source.initialize();

    const subscribeMock = vi.mocked(eventBus.subscribe);
    const reloadCb = subscribeMock.mock.calls.find((call) => call[0] === "bus:obs:config:changed")?.[1] as (() => void) | undefined;

    // Clear ndiOutputName
    database.prepare("UPDATE device_connections SET metadata = '{}' WHERE id = 'obs-1'").run();
    reloadCb!();

    expect(source.getNdiOutputName()).toBeNull();
    expect(previewManager.setSourceAvailable).toHaveBeenCalledWith("obs", false, "");
  });

  it("reload does nothing when name unchanged", async () => {
    const database = createDbWithObsDevice("MY-PC");
    previewManager = createMockPreviewManager();
    source = new ObsNdiPreviewSource(database, previewManager);
    await source.initialize();

    vi.mocked(previewManager.setSourceAvailable).mockClear();
    const subscribeCalls = vi.mocked(eventBus.subscribe).mock.calls;
    const reloadCb = subscribeCalls.find(([event]) => event === "bus:obs:config:changed")?.[1] as () => void;

    // Don't change the DB — just trigger reload
    reloadCb();
    // setSourceAvailable should not be called again since name is the same
    expect(previewManager.setSourceAvailable).not.toHaveBeenCalled();
  });
});
