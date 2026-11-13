import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { applySchema } from "../database/schema.js";
import { MixerService } from "./MixerService.js";
import type { MixerDriverFactory } from "./MixerService.js";
import type { MixerControlInterface, MixerDriverConfig } from "./MixerControlInterface.js";
import { eventBus } from "../eventBus/eventBus.js";
import { BUS_MIXER_DEVICE_CHANGED, BUS_MIXER_STATE_CHANGED } from "../eventBus/types.js";
import type { MixerChannelState } from "@invisible-av-booth/shared";

vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/** A minimal fake driver capturing calls, produced by a factory we can inspect. */
function makeFakeDriver(
  config: MixerDriverConfig,
): MixerControlInterface & { metering: boolean; connectCount: number; stateListeners: Array<(state: MixerChannelState) => void> } {
  const driver = {
    metering: false,
    connectCount: 0,
    stateListeners: [] as Array<(state: MixerChannelState) => void>,
    connect: vi.fn(async () => {
      driver.connectCount++;
      return true;
    }),
    disconnect: vi.fn(),
    isConnected: () => true,
    getCapabilities: () => ({ features: [...config.features], gainRange: { minDb: -12, maxDb: 60 } }),
    setFeatures: vi.fn(),
    setFader: vi.fn(async () => {}),
    setMute: vi.fn(async () => {}),
    setGain: vi.fn(async () => {}),
    getChannelState: () => null,
    getAllChannelStates: () => [],
    capturePreset: vi.fn(async () => ({ "/ch/01/mix/fader": 0.5 })),
    activatePreset: vi.fn(async () => ({ unconfirmedChannels: [] })),
    onMeterUpdate: () => () => {},
    setMeteringEnabled: vi.fn((enabled: boolean) => {
      driver.metering = enabled;
    }),
    onStateChange: (listener: (state: MixerChannelState) => void) => {
      driver.stateListeners.push(listener);
      return () => {};
    },
    onLiveness: () => () => {},
  };
  return driver;
}

function insertMixer(
  database: DatabaseType,
  id: string,
  opts?: { channelCount?: number; model?: string; features?: Record<string, boolean>; enabled?: number },
): void {
  database
    .prepare("INSERT INTO device_connections (id, deviceType, label, host, port, metadata, features, enabled, createdAt) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(
      id,
      "soundboard",
      "Mixer",
      "127.0.0.1",
      10024,
      JSON.stringify({ model: opts?.model ?? "behringer-xair", channelCount: opts?.channelCount ?? 4 }),
      JSON.stringify(opts?.features ?? { "gain-control": true }),
      opts?.enabled ?? 1,
      new Date().toISOString(),
    );
}

describe("MixerService", () => {
  let database: DatabaseType;
  let factory: MixerDriverFactory;
  let drivers: Map<string, ReturnType<typeof makeFakeDriver>>;
  let service: MixerService;

  beforeEach(() => {
    database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    applySchema(database);
    drivers = new Map();
    factory = async (_model, config) => {
      const driver = makeFakeDriver(config);
      drivers.set(config.mixerId, driver);
      return driver;
    };
    service = new MixerService(database, factory);
  });

  afterEach(() => {
    service.destroy();
    eventBus.removeAllListeners();
    database.close();
  });

  it("initialize loads enabled soundboard devices and connects each", async () => {
    insertMixer(database, "m1");
    insertMixer(database, "m2");
    await service.initialize();
    expect(service.getAllMixerStates()).toHaveLength(2);
    expect(drivers.get("m1")!.connectCount).toBe(1);
  });

  it("skips disabled devices", async () => {
    insertMixer(database, "m1", { enabled: 0 });
    await service.initialize();
    expect(service.getAllMixerStates()).toHaveLength(0);
  });

  it("skips devices with an invalid model or channel count", async () => {
    insertMixer(database, "bad1", { model: "x32" });
    insertMixer(database, "bad2", { channelCount: 0 });
    await service.initialize();
    expect(service.getAllMixerStates()).toHaveLength(0);
  });

  it("getMixerState returns null for an unknown mixer", async () => {
    await service.initialize();
    expect(service.getMixerState("nope")).toBeNull();
  });

  it("passes the opt-in usb-trim-follows-gain feature through to the driver", async () => {
    insertMixer(database, "m1", { features: { "gain-control": true, "usb-trim-follows-gain": true } });
    await service.initialize();
    expect(service.getMixerState("m1")?.capabilities.features).toContain("usb-trim-follows-gain");
  });

  it("setChannel routes each field to the driver and enforces gain capability", async () => {
    insertMixer(database, "m1", { features: { "gain-control": false } });
    await service.initialize();
    await service.setChannel("m1", { mixerId: "m1", channel: 1, fader: 0.5, muted: true, gainDb: 10 });
    const driver = drivers.get("m1")!;
    expect(driver.setFader).toHaveBeenCalledWith(1, 0.5);
    expect(driver.setMute).toHaveBeenCalledWith(1, true);
    expect(driver.setGain).not.toHaveBeenCalled(); // gain-control disabled
  });

  it("coalesces a burst of driver state changes into ONE state broadcast", async () => {
    insertMixer(database, "m1");
    await service.initialize();
    await Promise.resolve(); // flush the connect-time broadcast
    const broadcasts: unknown[] = [];
    eventBus.subscribe(BUS_MIXER_STATE_CHANGED, (payload) => broadcasts.push(payload));
    const channel = { channel: 1, name: "Ch 1", fader: 0.5, faderDb: -10, muted: false, gainDb: 0 };
    for (const listener of drivers.get("m1")!.stateListeners) {
      for (let i = 0; i < 20; i++) listener(channel);
    }
    await Promise.resolve();
    expect(broadcasts).toHaveLength(1);
  });

  it("setChannel is a no-op for an unknown mixer", async () => {
    await service.initialize();
    await expect(service.setChannel("nope", { mixerId: "nope", channel: 1, fader: 0.5 })).resolves.toBeUndefined();
  });

  it("activatePreset loads the payload and writes it to the driver", async () => {
    insertMixer(database, "m1");
    await service.initialize();
    database
      .prepare("INSERT INTO mixer_presets (id, mixerId, name, sortOrder, payload, createdAt) VALUES (?,?,?,?,?,?)")
      .run("p1", "m1", "Test", 0, JSON.stringify({ "/ch/01/mix/fader": 0.8 }), new Date().toISOString());
    const result = await service.activatePreset("m1", "p1");
    expect(result.ok).toBe(true);
    expect(drivers.get("m1")!.activatePreset).toHaveBeenCalledWith({ "/ch/01/mix/fader": 0.8 });
  });

  it("activatePreset returns an error for unknown mixer or preset", async () => {
    insertMixer(database, "m1");
    await service.initialize();
    expect((await service.activatePreset("nope", "p1")).ok).toBe(false);
    expect((await service.activatePreset("m1", "nope")).ok).toBe(false);
  });

  it("activatePreset reports failure (with channels) when the driver cannot confirm", async () => {
    insertMixer(database, "m1");
    await service.initialize();
    database
      .prepare("INSERT INTO mixer_presets (id, mixerId, name, sortOrder, payload, createdAt) VALUES (?,?,?,?,?,?)")
      .run("p1", "m1", "Test", 0, JSON.stringify({ "/ch/01/mix/fader": 0.8 }), new Date().toISOString());
    drivers.get("m1")!.activatePreset = vi.fn(async () => ({ unconfirmedChannels: [1, 3] }));
    const result = await service.activatePreset("m1", "p1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.unconfirmedChannels).toEqual([1, 3]);
      expect(result.error).toMatch(/1, 3/);
    }
  });

  it("capturePreset delegates to the driver; throws for unknown mixer", async () => {
    insertMixer(database, "m1");
    await service.initialize();
    expect(await service.capturePreset("m1")).toEqual({ "/ch/01/mix/fader": 0.5 });
    await expect(service.capturePreset("nope")).rejects.toThrow(/not found/);
  });

  it("setWidgetPresence ref-counts metering per mixer", async () => {
    insertMixer(database, "m1");
    await service.initialize();
    const driver = drivers.get("m1")!;
    service.setWidgetPresence("m1", true);
    service.setWidgetPresence("m1", true); // second widget — still one enable
    expect(driver.metering).toBe(true);
    service.setWidgetPresence("m1", false);
    expect(driver.metering).toBe(true); // one still present
    service.setWidgetPresence("m1", false);
    expect(driver.metering).toBe(false);
    // Extra decrement is clamped (no negative).
    service.setWidgetPresence("m1", false);
    expect(driver.metering).toBe(false);
  });

  describe("hot-reload", () => {
    it("creates a new instance on a 'created' bus event", async () => {
      await service.initialize();
      insertMixer(database, "m1");
      eventBus.emit(BUS_MIXER_DEVICE_CHANGED, { action: "created", mixerId: "m1" });
      await new Promise((r) => setTimeout(r, 10));
      expect(service.getMixerState("m1")).not.toBeNull();
    });

    it("removes an instance on a 'deleted' bus event", async () => {
      insertMixer(database, "m1");
      await service.initialize();
      database.prepare("DELETE FROM device_connections WHERE id = ?").run("m1");
      await service.reloadMixer("m1", "deleted");
      expect(service.getMixerState("m1")).toBeNull();
    });

    it("preserves the driver instance on a feature-only edit (connection alive)", async () => {
      insertMixer(database, "m1");
      await service.initialize();
      const before = drivers.get("m1")!;
      database.prepare("UPDATE device_connections SET features = ? WHERE id = ?").run(JSON.stringify({ "gain-control": false }), "m1");
      await service.reloadMixer("m1", "updated");
      expect(drivers.get("m1")).toBe(before); // same object → not reconnected
      expect(before.disconnect).not.toHaveBeenCalled();
      // …and the DRIVER is told, so the toggle takes effect without a restart.
      expect(before.setFeatures).toHaveBeenCalledWith([]);
    });

    it("reconnects (new driver) when host changes", async () => {
      insertMixer(database, "m1");
      await service.initialize();
      const before = drivers.get("m1")!;
      database.prepare("UPDATE device_connections SET host = ? WHERE id = ?").run("10.0.0.9", "m1");
      await service.reloadMixer("m1", "updated");
      expect(before.disconnect).toHaveBeenCalled();
      expect(drivers.get("m1")).not.toBe(before);
    });

    it("treats a reload of a now-missing device as removal", async () => {
      insertMixer(database, "m1");
      await service.initialize();
      database.prepare("DELETE FROM device_connections WHERE id = ?").run("m1");
      await service.reloadMixer("m1", "updated");
      expect(service.getMixerState("m1")).toBeNull();
    });
  });
});
