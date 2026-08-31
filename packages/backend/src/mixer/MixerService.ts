/**
 * MixerService — state authority and lifecycle owner for all configured mixers.
 *
 * Loads `soundboard` devices, creates a driver per device via the model factory,
 * connects, and wires driver events to the EventBus (bus: → stc: pipeline). It
 * routes commands by mixerId, enforces capabilities server-side (defense in
 * depth alongside the driver), owns the per-mixer metering lifecycle
 * (ref-counted to widget presence), and performs connection-preserving
 * hot-reload (Req 9.7/9.8).
 *
 * The mixer is authoritative: the driver reconciles every command via read-back
 * and emits the mixer-reported value, which we broadcast. Live channel state is
 * NOT persisted — only device config and presets are (Req 11.1).
 *
 * CAPTURE-PATH HEALTH (Req 15.7): this service watches the mixer's OWN capture
 * path and raises a catastrophic modal via BUS_MIXER_CAPTURE_PATH_LOST when
 * recovery is impossible, auto-clearing via BUS_MIXER_CAPTURE_PATH_RESTORED.
 * AudioCaptureService is the single owner of capture-pipeline respawn. This does
 * NOT claim to guarantee the audio reaching the livestream (that path is
 * OBS→PipeWire→main-LR, out of scope — honest scoping avoids false confidence).
 */

import type { Database } from "better-sqlite3";
import type { MixerModel, MixerState, MixerCommand, MixerCapabilities, MixerChannelState, MixerFeature, MixerPresetPayload } from "@invisible-av-booth/shared";
import type { MixerControlInterface, MixerDriverConfig, ChannelMonitorSink } from "./MixerControlInterface.js";
import { createMixerDriver } from "./MixerControlInterface.js";
import type { AudioCaptureService, AudioConsumer } from "./AudioCaptureService.js";
import { eventBus } from "../eventBus/eventBus.js";
import { BUS_MIXER_STATE_CHANGED, BUS_MIXER_LEVELS, BUS_MIXER_DEVICE_CHANGED } from "../eventBus/types.js";
import { listMixerPresetSummaries } from "../routes/adminMixerPresetRoutes.js";
import { logger } from "../logger.js";

export type MixerDriverFactory = (model: MixerModel, config: MixerDriverConfig, capture: ChannelMonitorSink) => Promise<MixerControlInterface>;

interface MixerMetadata {
  model: MixerModel;
  channelCount: number;
  usbSlotMap?: Record<string, number>;
}

interface MixerInstance {
  mixerId: string;
  driver: MixerControlInterface;
  model: MixerModel;
  channelCount: number;
  host: string;
  port: number;
  features: MixerFeature[];
  /** per-mixer widget-presence ref count for the metering lifecycle. */
  presenceCount: number;
  unsubscribes: Array<() => void>;
}

const MIXER_FEATURES: MixerFeature[] = ["gain-control", "channel-metering", "channel-audio-capture"];

export class MixerService {
  private readonly instances = new Map<string, MixerInstance>();
  private readonly driverFactory: MixerDriverFactory;
  private destroyed = false;
  private deviceChangedHandler: ((payload: { action: "created" | "updated" | "deleted"; mixerId: string }) => void) | null = null;
  /** Runtime PipeWire capture availability (Req 4.7) — downgrades channel-audio-capture when false. */
  private captureAvailable = true;

  constructor(
    private readonly database: Database,
    private readonly capture: AudioCaptureService,
    driverFactory?: MixerDriverFactory,
  ) {
    this.driverFactory = driverFactory ?? createMixerDriver;
  }

  async initialize(): Promise<void> {
    // Runtime capture availability (Req 4.7 / 15.1): if PipeWire / pipewiresrc is
    // unavailable, channel-audio-capture is downgraded in the broadcast
    // capabilities so the gain modal falls back to the slider tier instead of
    // opening a monitor that never produces frames.
    this.captureAvailable = await this.capture.isAvailable();
    if (!this.captureAvailable) {
      logger.warn("Audio capture unavailable at runtime — channel-audio-capture will be downgraded", { context: {} });
    } else {
      // Warm the PipeWire node auto-discovery cache so the first gain-window open
      // targets the correct multichannel device without a per-spawn pw-dump.
      const discovered = await this.capture.discoverCaptureNode();
      if (discovered) {
        logger.info("Audio capture node discovered", { context: { nodeName: discovered.nodeName, deviceChannels: discovered.deviceChannels } });
      } else {
        logger.warn("No X Air multichannel capture node auto-discovered — set captureNodeName in device config if the gain window is unavailable", {
          context: {},
        });
      }
    }

    const rows = this.loadSoundboardRows();
    for (const row of rows) {
      await this.createInstance(row.id, row.host, row.port, row.metadata, row.features);
    }

    // Hot-reload subscription (Req 9.7).
    this.deviceChangedHandler = (payload): void => {
      void this.reloadMixer(payload.mixerId, payload.action);
    };
    eventBus.subscribe(BUS_MIXER_DEVICE_CHANGED, this.deviceChangedHandler);
    logger.info("MixerService initialized", { context: { mixerCount: this.instances.size } });
  }

  // ── Instance construction ────────────────────────────────────────────────────

  private loadSoundboardRows(): Array<{ id: string; host: string; port: number; metadata: MixerMetadata; features: MixerFeature[] }> {
    const rows = this.database
      .prepare("SELECT id, host, port, metadata, features FROM device_connections WHERE deviceType = 'soundboard' AND enabled = 1")
      .all() as Array<{
      id: string;
      host: string;
      port: number;
      metadata: string;
      features: string;
    }>;
    const result: Array<{ id: string; host: string; port: number; metadata: MixerMetadata; features: MixerFeature[] }> = [];
    for (const row of rows) {
      const parsed = this.parseConfig(row.metadata, row.features);
      if (!parsed) continue;
      result.push({ id: row.id, host: row.host, port: row.port, metadata: parsed.metadata, features: parsed.features });
    }
    return result;
  }

  /** Parse a soundboard row's metadata + features columns into typed config. */
  private parseConfig(metadataJson: string, featuresJson: string): { metadata: MixerMetadata; features: MixerFeature[] } | null {
    try {
      const metadataRaw = JSON.parse(metadataJson) as { model?: string; channelCount?: number | string; usbSlotMap?: Record<string, number> };
      const featuresRaw = JSON.parse(featuresJson) as Record<string, boolean>;
      const channelCount = typeof metadataRaw.channelCount === "string" ? Number(metadataRaw.channelCount) : metadataRaw.channelCount;
      if (metadataRaw.model !== "behringer-xair" || typeof channelCount !== "number" || channelCount <= 0) return null;
      const metadata: MixerMetadata = { model: "behringer-xair", channelCount };
      if (metadataRaw.usbSlotMap) metadata.usbSlotMap = metadataRaw.usbSlotMap;
      const features = MIXER_FEATURES.filter((feature) => featuresRaw[feature] === true);
      return { metadata, features };
    } catch {
      return null;
    }
  }

  private async createInstance(mixerId: string, host: string, port: number, metadata: MixerMetadata, features: MixerFeature[]): Promise<void> {
    const config: MixerDriverConfig = { mixerId, host, port, channelCount: metadata.channelCount, features };
    const monitorSink = this.buildMonitorSink(mixerId);
    const driver = await this.driverFactory(metadata.model, config, monitorSink);

    const instance: MixerInstance = {
      mixerId,
      driver,
      model: metadata.model,
      channelCount: metadata.channelCount,
      host,
      port,
      features,
      presenceCount: 0,
      unsubscribes: [],
    };

    // Wire driver events to the bus (bus: → stc: pipeline).
    instance.unsubscribes.push(
      driver.onStateChange((channel: MixerChannelState) => {
        void channel;
        this.broadcastState(mixerId);
      }),
    );
    instance.unsubscribes.push(
      driver.onMeterUpdate((levels) => {
        eventBus.emit(BUS_MIXER_LEVELS, { mixerId, levels });
      }),
    );
    instance.unsubscribes.push(driver.onLiveness(() => this.broadcastState(mixerId)));

    this.instances.set(mixerId, instance);
    await driver.connect();
    this.broadcastState(mixerId);
  }

  /**
   * Adapt AudioCaptureService.subscribe into the driver's ChannelMonitorSink.
   * In practice the gain-window monitor runs via the /preview/mixer WS endpoint
   * (which subscribes to AudioCaptureService directly), so driver.startChannelMonitor
   * is a secondary path — but the driver still needs a sink to delegate to.
   */
  private buildMonitorSink(mixerId: string): ChannelMonitorSink {
    const active = new Map<number, () => void>();
    return {
      startChannelMonitor: (id: string, channel: number): void => {
        if (active.has(channel)) return;
        const consumer: AudioConsumer = { id: `mixer-driver-${id}-${channel}`, channels: [channel], onEnvelope: () => {} };
        const unsubscribe = this.capture.subscribe(consumer, id);
        active.set(channel, unsubscribe);
      },
      stopChannelMonitor: (_id: string, channel: number): void => {
        active.get(channel)?.();
        active.delete(channel);
      },
    };
  }

  // ── State ────────────────────────────────────────────────────────────────────

  getMixerState(mixerId: string): MixerState | null {
    const instance = this.instances.get(mixerId);
    if (!instance) return null;
    return this.buildState(instance);
  }

  getAllMixerStates(): MixerState[] {
    return Array.from(this.instances.values()).map((instance) => this.buildState(instance));
  }

  private buildState(instance: MixerInstance): MixerState {
    const raw: MixerCapabilities = instance.driver.getCapabilities();
    // Runtime downgrade (Req 4.7): strip channel-audio-capture when PipeWire is
    // unavailable, so the frontend picks the slider tier rather than opening a
    // dead monitor. Admin intent (the stored feature) is preserved in the DB.
    const features = this.captureAvailable ? raw.features : raw.features.filter((feature) => feature !== "channel-audio-capture");
    const capabilities: MixerCapabilities = { features, gainRange: raw.gainRange };
    return {
      mixerId: instance.mixerId,
      connected: instance.driver.isConnected(),
      model: instance.model,
      channelCount: instance.channelCount,
      capabilities,
      channels: instance.driver.getAllChannelStates(),
      presets: listMixerPresetSummaries(this.database, instance.mixerId),
    };
  }

  private broadcastState(mixerId: string): void {
    const instance = this.instances.get(mixerId);
    if (!instance) return;
    eventBus.emit(BUS_MIXER_STATE_CHANGED, { mixerId, state: this.buildState(instance) });
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  async setChannel(mixerId: string, command: MixerCommand): Promise<void> {
    const instance = this.instances.get(mixerId);
    if (!instance) return;
    // Each present field is a separate OSC write + independent read-back (driver enforces too).
    if (command.fader !== undefined) await instance.driver.setFader(command.channel, command.fader);
    if (command.muted !== undefined) await instance.driver.setMute(command.channel, command.muted);
    if (command.gainDb !== undefined) {
      if (!instance.features.includes("gain-control")) {
        logger.warn("Ignoring gain command — device lacks gain-control", { context: { mixerId, channel: command.channel } });
      } else {
        await instance.driver.setGain(command.channel, command.gainDb);
      }
    }
  }

  async activatePreset(mixerId: string, presetId: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const instance = this.instances.get(mixerId);
    if (!instance) return { ok: false, error: "Mixer not found" };
    const row = this.database.prepare("SELECT payload FROM mixer_presets WHERE id = ? AND mixerId = ?").get(presetId, mixerId) as
      { payload: string } | undefined;
    if (!row) return { ok: false, error: "Preset not found" };
    try {
      const payload = JSON.parse(row.payload) as MixerPresetPayload;
      await instance.driver.activatePreset(payload);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  /** Snapshot the current board for admin preset authoring (throws if unconfirmed). */
  async capturePreset(mixerId: string): Promise<MixerPresetPayload> {
    const instance = this.instances.get(mixerId);
    if (!instance) throw new Error("Mixer not found");
    return instance.driver.capturePreset();
  }

  // ── Metering lifecycle (Req 12.4) ────────────────────────────────────────────

  /** Per-mixer ref-counted widget presence → metering enable/disable. */
  setWidgetPresence(mixerId: string, present: boolean): void {
    const instance = this.instances.get(mixerId);
    if (!instance) return;
    if (present) {
      instance.presenceCount++;
      if (instance.presenceCount === 1) instance.driver.setMeteringEnabled(true);
    } else {
      instance.presenceCount = Math.max(0, instance.presenceCount - 1);
      if (instance.presenceCount === 0) instance.driver.setMeteringEnabled(false);
    }
  }

  startChannelMonitor(mixerId: string, channel: number): void {
    this.instances.get(mixerId)?.driver.startChannelMonitor(channel);
  }

  stopChannelMonitor(mixerId: string, channel: number): void {
    this.instances.get(mixerId)?.driver.stopChannelMonitor(channel);
  }

  // ── Hot-reload (Req 9.7/9.8) ─────────────────────────────────────────────────

  async reloadMixer(mixerId: string, action: "created" | "updated" | "deleted"): Promise<void> {
    if (this.destroyed) return;

    if (action === "deleted") {
      this.teardownInstance(mixerId);
      return;
    }

    const row = this.database
      .prepare("SELECT host, port, metadata, features FROM device_connections WHERE id = ? AND deviceType = 'soundboard' AND enabled = 1")
      .get(mixerId) as { host: string; port: number; metadata: string; features: string } | undefined;
    if (!row) {
      // Device gone or disabled — treat as removal.
      this.teardownInstance(mixerId);
      return;
    }
    const parsed = this.parseConfig(row.metadata, row.features);
    if (!parsed) {
      this.teardownInstance(mixerId);
      return;
    }

    const existing = this.instances.get(mixerId);
    if (!existing) {
      await this.createInstance(mixerId, row.host, row.port, parsed.metadata, parsed.features);
      return;
    }

    // Connection-preserving reload (Req 9.8): only host/port/model changes reconnect.
    const connectionChanged = existing.host !== row.host || existing.port !== row.port || existing.model !== parsed.metadata.model;
    if (connectionChanged) {
      this.teardownInstance(mixerId);
      await this.createInstance(mixerId, row.host, row.port, parsed.metadata, parsed.features);
      return;
    }

    // Only non-connection fields changed — update in place, keep OSC connection
    // and /xremote/meters subscriptions alive (do not interrupt live monitoring).
    existing.features = parsed.features;
    existing.channelCount = parsed.metadata.channelCount;
    this.broadcastState(mixerId);
  }

  private teardownInstance(mixerId: string): void {
    const instance = this.instances.get(mixerId);
    if (!instance) return;
    for (const unsubscribe of instance.unsubscribes) unsubscribe();
    instance.driver.disconnect();
    this.instances.delete(mixerId);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.deviceChangedHandler) {
      eventBus.unsubscribe(BUS_MIXER_DEVICE_CHANGED, this.deviceChangedHandler);
      this.deviceChangedHandler = null;
    }
    for (const mixerId of Array.from(this.instances.keys())) {
      this.teardownInstance(mixerId);
    }
  }
}
