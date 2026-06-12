import { describe, it, expect, vi, afterEach } from "vitest";
import Database from "better-sqlite3";
import { applySchema } from "../database/schema.js";
import { ObsNdiPreviewSource } from "./ObsNdiPreviewSource.js";
import type { PreviewStreamManager } from "../services/previewStreamManager.js";

vi.mock("./ndiLoader.js", () => ({
  getNdiModule: vi.fn(),
  isNdiAvailable: vi.fn().mockReturnValue(false),
}));

vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../eventBus/eventBus.js", () => ({
  eventBus: { emit: vi.fn(), subscribe: vi.fn() },
}));

import { isNdiAvailable, getNdiModule } from "./ndiLoader.js";
import { eventBus } from "../eventBus/eventBus.js";
const mockIsNdiAvailable = vi.mocked(isNdiAvailable);
const mockGetNdiModule = vi.mocked(getNdiModule);

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
        deviceId: "obs-preview",
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
    expect(eventBus.emit).toHaveBeenCalledWith(
      "bus:device:capabilities:updated",
      expect.objectContaining({
        capabilities: expect.objectContaining({ features: { ndiConfigured: false } }),
      }),
    );
  });

  it("emits ndiConfigured=true when ndiOutputName is set", async () => {
    const db = createDbWithObsDevice("MY-PC (OBS)");
    previewManager = createMockPreviewManager();
    mockIsNdiAvailable.mockReturnValue(false);
    source = new ObsNdiPreviewSource(db, previewManager);

    await source.initialize();
    expect(source.getNdiOutputName()).toBe("MY-PC (OBS)");
    expect(eventBus.emit).toHaveBeenCalledWith(
      "bus:device:capabilities:updated",
      expect.objectContaining({
        capabilities: expect.objectContaining({ features: { ndiConfigured: true } }),
      }),
    );
  });

  it("attempts connect when NDI is available and ndiOutputName configured", async () => {
    const db = createDbWithObsDevice("MY-PC (OBS)");
    previewManager = createMockPreviewManager();
    mockIsNdiAvailable.mockReturnValue(true);
    mockGetNdiModule.mockReturnValue({
      find: vi.fn().mockResolvedValue([]),
      COLOR_FORMAT_FASTEST: 0,
    });
    source = new ObsNdiPreviewSource(db, previewManager);

    await source.initialize();
    // Source not found -> marks unavailable
    expect(previewManager.setSourceAvailable).toHaveBeenCalledWith("obs", false, "pipe:0");
  });

  it("marks source available when NDI source is found", async () => {
    const db = createDbWithObsDevice("MY-PC (OBS)");
    previewManager = createMockPreviewManager();
    const mockReceiver = { video: vi.fn().mockRejectedValue(new Error("stopped")) };
    mockIsNdiAvailable.mockReturnValue(true);
    mockGetNdiModule.mockReturnValue({
      find: vi.fn().mockResolvedValue([{ name: "MY-PC (OBS)" }]),
      receive: vi.fn().mockResolvedValue(mockReceiver),
      COLOR_FORMAT_FASTEST: 0,
    });
    source = new ObsNdiPreviewSource(db, previewManager);

    await source.initialize();
    expect(previewManager.setSourceAvailable).toHaveBeenCalledWith("obs", true, "pipe:0");
    // Give time for the loop to hit the error and mark unavailable
    await new Promise((r) => setTimeout(r, 50));
  });

  it("destroy stops receive loop and marks source unavailable", async () => {
    const db = createDbWithObsDevice("MY-PC (OBS)");
    previewManager = createMockPreviewManager();
    mockIsNdiAvailable.mockReturnValue(false);
    source = new ObsNdiPreviewSource(db, previewManager);
    await source.initialize();

    source.destroy();
    expect(previewManager.setSourceAvailable).toHaveBeenCalledWith("obs", false, "pipe:0");
  });
});
