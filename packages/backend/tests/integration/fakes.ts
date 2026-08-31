/**
 * Fake services for integration tests.
 *
 * Each fake records calls and supports enqueueable responses so tests can
 * configure multi-step scenarios (e.g., first call succeeds, second fails).
 */
import { vi } from "vitest";
import type { StreamingPlatformClient, BroadcastInfo, PlatformHealth, TokenInfo } from "../../src/platforms/platformClient.js";
import type { NmsFactory, NmsInstance, SpawnFn } from "../../src/services/relayService.js";
import { EventEmitter } from "events";

// ── FakePlatformClient ───────────────────────────────────────────────────────

export class FakePlatformClient implements StreamingPlatformClient {
  readonly calls: { method: string; args: unknown[] }[] = [];
  private responses = new Map<string, unknown[]>();

  /** Enqueue a response (value or Error) for the next call to `method`. */
  enqueue(method: keyof StreamingPlatformClient, response: unknown): this {
    if (!this.responses.has(method)) this.responses.set(method, []);
    this.responses.get(method)!.push(response);
    return this;
  }

  private dequeue(method: string, fallback: unknown): unknown {
    const queue = this.responses.get(method);
    if (!queue || queue.length === 0) return fallback;
    return queue.shift()!;
  }

  private async call<T>(method: string, args: unknown[], fallback: T): Promise<T> {
    this.calls.push({ method, args });
    const result = this.dequeue(method, fallback);
    if (result instanceof Error) throw result;
    if (result instanceof Promise) return result as Promise<T>;
    return result as T;
  }

  async createBroadcast(title: string, description: string, privacy?: string): Promise<BroadcastInfo> {
    return this.call("createBroadcast", [title, description, privacy], {
      broadcastId: "fake-broadcast-1",
      rtmpUrl: "rtmp://fake/live/stream",
      streamUrl: "rtmp://fake/live",
      streamKey: "stream",
    });
  }

  async endBroadcast(broadcastId: string): Promise<void> {
    await this.call("endBroadcast", [broadcastId], undefined);
  }

  async getBroadcastStatus(broadcastId: string): Promise<string> {
    return this.call("getBroadcastStatus", [broadcastId], "live");
  }

  async pollHealth(): Promise<PlatformHealth> {
    return this.call("pollHealth", [], { healthy: true, streamHealth: "good" });
  }

  async refreshToken(): Promise<TokenInfo> {
    return this.call("refreshToken", [], { accessToken: "refreshed-token" });
  }

  async validateToken(): Promise<boolean> {
    return this.call("validateToken", [], true);
  }

  reset(): void {
    this.calls.length = 0;
    this.responses.clear();
  }
}

// ── Fake OBS WebSocket ───────────────────────────────────────────────────────

type EventHandler = (...args: unknown[]) => void;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createFakeObs() {
  const handlers: Record<string, EventHandler[]> = {};
  let recording = false;
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    removeAllListeners: vi.fn().mockImplementation((event?: string) => {
      if (event) delete handlers[event];
      else Object.keys(handlers).forEach((k) => delete handlers[k]);
    }),
    call: vi.fn().mockImplementation((method: string) => {
      if (method === "StartRecord") {
        recording = true;
        return Promise.resolve({});
      }
      if (method === "StopRecord") {
        recording = false;
        return Promise.resolve({});
      }
      if (method === "GetStreamStatus") return Promise.resolve({ outputActive: false });
      if (method === "GetRecordStatus") return Promise.resolve({ outputActive: recording });
      if (method === "GetStreamServiceSettings") return Promise.resolve({ streamServiceSettings: { server: "rtmp://localhost:1935/live" } });
      return Promise.resolve({});
    }),
    on: vi.fn().mockImplementation((event: string, handler: EventHandler) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event]!.push(handler);
    }),
    off: vi.fn(),
    /** Simulate an OBS event (e.g., StreamStateChanged). */
    emit(event: string, ...args: unknown[]) {
      handlers[event]?.forEach((h) => h(...args));
    },
  };
}

export type FakeObs = ReturnType<typeof createFakeObs>;

// ── Fake NMS / Spawn ─────────────────────────────────────────────────────────

export interface FakeNmsInstance extends NmsInstance {
  /** Simulate OBS connecting to the relay */
  simulatePublish(streamPath?: string): void;
  /** Simulate OBS disconnecting from the relay */
  simulateUnpublish(streamPath?: string): void;
}

export function createFakeNms(): FakeNmsInstance {
  const handlers: Record<string, Array<(id: string, streamPath: string, args: object) => void>> = {};
  return {
    run: vi.fn(),
    stop: vi.fn(),
    on: vi.fn().mockImplementation((event: string, handler: (id: string, streamPath: string, args: object) => void) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event]!.push(handler);
    }),
    simulatePublish(streamPath = "/live/stream") {
      handlers["prePublish"]?.forEach((h) => h("fake-session", streamPath, {}));
      handlers["postPublish"]?.forEach((h) => h("fake-session", streamPath, {}));
    },
    simulateUnpublish(streamPath = "/live/stream") {
      handlers["donePublish"]?.forEach((h) => h("fake-session", streamPath, {}));
    },
  };
}

export function createFakeNmsFactory(): NmsFactory {
  const instance = createFakeNms();
  return Object.assign(() => instance, { instance });
}

export function createFakeSpawn(): SpawnFn {
  return vi.fn().mockImplementation((cmd: string, args: string[]) => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter | null;
      stderr: EventEmitter | null;
      stdin: null;
      kill: ReturnType<typeof vi.fn>;
      pid: number;
    };
    child.stderr = new EventEmitter() as EventEmitter;
    child.stdin = null;
    child.pid = Math.floor(Math.random() * 100000);
    child.kill = vi.fn().mockImplementation(() => {
      setTimeout(() => child.emit("close", 0), 0);
    });

    // gst-launch-1.0 pipeline spawns get a real stdout emitter so data can flow
    if (cmd === "gst-launch-1.0" && args?.[0] !== "--version") {
      child.stdout = new EventEmitter() as EventEmitter;
      // readline's createInterface requires resume() and setEncoding() on the input stream
      (child.stdout as EventEmitter & { resume?: () => void; setEncoding?: () => void }).resume = () => {};
      (child.stdout as EventEmitter & { resume?: () => void; setEncoding?: () => void }).setEncoding = () => {};
      // Don't auto-close — pipeline stays alive until killed
    } else {
      child.stdout = null;
      // gst-launch-1.0 --version check should close immediately with success
      if (args?.[0] === "--version") {
        setTimeout(() => child.emit("close", 0), 0);
      }
    }

    // ffmpeg -version check should close immediately with success
    if (cmd === "ffmpeg" && args?.[0] === "-version") {
      setTimeout(() => child.emit("close", 0), 0);
    }
    // gst-inspect-1.0 probes — "level" succeeds (audio metering), all others fail (no HW encoder in tests)
    if (cmd === "gst-inspect-1.0") {
      const element = args?.[0];
      setTimeout(() => child.emit("close", element === "level" ? 0 : 1), 0);
    }
    return child;
  });
}

// ── Fake AudioCaptureService ─────────────────────────────────────────────────
//
// A no-op capture that records subscriptions and can push EnvelopePairs on
// demand. Reports availability via a settable flag so tests exercise both the
// capable and downgraded paths without hardware.

import type { AudioCaptureService, AudioConsumer } from "../../src/mixer/AudioCaptureService.js";
import type { AudioPreviewManager } from "../../src/services/audioPreviewManager.js";
import type { EnvelopePair } from "@invisible-av-booth/shared";

export interface FakeAudioCapture {
  service: AudioCaptureService;
  consumers: AudioConsumer[];
  setAvailable: (value: boolean) => void;
  pushEnvelope: (channel: number, pair: EnvelopePair) => void;
}

export function createFakeAudioCapture(): FakeAudioCapture {
  const consumers: AudioConsumer[] = [];
  let available = true;

  const service = {
    isAvailable: async () => available,
    discoverCaptureNode: async () => (available ? { nodeName: "fake-node", deviceChannels: 18 } : null),
    subscribe(consumer: AudioConsumer) {
      consumers.push(consumer);
      return () => {
        const index = consumers.indexOf(consumer);
        if (index >= 0) consumers.splice(index, 1);
      };
    },
    getActiveChannelCount: () => consumers.length,
    destroy: vi.fn(),
  } as unknown as AudioCaptureService;

  return {
    service,
    consumers,
    setAvailable: (value: boolean) => {
      available = value;
    },
    pushEnvelope: (channel: number, pair: EnvelopePair) => {
      // onEnvelope now receives a BURST of pairs; deliver this one as a 1-element burst.
      for (const consumer of consumers) {
        if (consumer.channels.includes(channel)) consumer.onEnvelope(channel, [pair]);
      }
    },
  };
}

// ── Fake AudioPreviewManager ──────────────────────────────────────────────────
//
// A no-op audio preview manager for wiring buildApp without a real WebSocket
// server. handleUpgrade/destroy are inert.

export function createFakeAudioPreviewManager(): AudioPreviewManager {
  return {
    handleUpgrade: vi.fn(),
    destroy: vi.fn(),
  } as unknown as AudioPreviewManager;
}

// ── Fake Mixer driver ─────────────────────────────────────────────────────────
//
// A fake MixerControlInterface injected via buildApp's mixerDriverFactory. It
// records commands, exposes queryable stateful values (seedable to DIFFER from
// the commanded value to prove mixer-authority, Req 11.2), can simulate an
// unsolicited external push (physical console / app), and can emit meter levels.
// No OSC, no UDP, no hardware.

import type { MixerControlInterface, MixerDriverConfig, ChannelMonitorSink } from "../../src/mixer/MixerControlInterface.js";
import type { MixerModel, MixerCapabilities, MixerChannelState, MixerChannelLevel, MixerPresetPayload } from "@invisible-av-booth/shared";
import { faderFloatToDb } from "@invisible-av-booth/shared";

export interface FakeMixerDriver extends MixerControlInterface {
  /** Recorded set commands for assertions. */
  commands: Array<{ op: "fader" | "mute" | "gain"; channel: number; value: number | boolean }>;
  /** Seed the value the "mixer" reports on read-back so it can differ from commanded. */
  seedFader: (channel: number, value: number) => void;
  seedMute: (channel: number, muted: boolean) => void;
  seedGain: (channel: number, gainDb: number) => void;
  /** Simulate an unsolicited external change (physical console / Behringer app). */
  pushExternal: (channel: number, change: Partial<Pick<MixerChannelState, "fader" | "muted" | "gainDb" | "name">>) => void;
  /** Emit a fake meter frame. */
  pushMeters: (levels: MixerChannelLevel[]) => void;
  meteringEnabled: () => boolean;
}

export interface FakeMixerRegistry {
  factory: (model: MixerModel, config: MixerDriverConfig, capture: ChannelMonitorSink) => Promise<MixerControlInterface>;
  /** Get the fake driver for a mixerId after initialize(). */
  get: (mixerId: string) => FakeMixerDriver | undefined;
}

/** Build a registry whose factory produces fake drivers, keyed by mixerId. */
export function createFakeMixer(): FakeMixerRegistry {
  const drivers = new Map<string, FakeMixerDriver>();

  const factory = async (_model: MixerModel, config: MixerDriverConfig, capture: ChannelMonitorSink): Promise<MixerControlInterface> => {
    const channels = new Map<number, MixerChannelState>();
    for (let channel = 1; channel <= config.channelCount; channel++) {
      channels.set(channel, { channel, name: `Ch ${channel}`, fader: 0, faderDb: -Infinity, muted: false, gainDb: -12 });
    }
    const seeded = { fader: new Map<number, number>(), mute: new Map<number, boolean>(), gain: new Map<number, number>() };
    const stateListeners = new Set<(s: MixerChannelState) => void>();
    const meterListeners = new Set<(l: MixerChannelLevel[]) => void>();
    const livenessListeners = new Set<() => void>();
    let connected = false;
    let metering = false;

    const emitState = (channel: number): void => {
      const state = channels.get(channel);
      if (!state) return;
      for (const listener of stateListeners) listener({ ...state });
      for (const listener of livenessListeners) listener();
    };

    const capabilities: MixerCapabilities = { features: [...config.features], gainRange: { minDb: -12, maxDb: 60 } };

    const driver: FakeMixerDriver = {
      commands: [],
      seedFader: (channel, value) => seeded.fader.set(channel, value),
      seedMute: (channel, muted) => seeded.mute.set(channel, muted),
      seedGain: (channel, gainDb) => seeded.gain.set(channel, gainDb),
      pushExternal: (channel, change) => {
        const state = channels.get(channel);
        if (!state) return;
        if (change.fader !== undefined) {
          state.fader = change.fader;
          state.faderDb = faderFloatToDb(change.fader);
        }
        if (change.muted !== undefined) state.muted = change.muted;
        if (change.gainDb !== undefined) state.gainDb = change.gainDb;
        if (change.name !== undefined) state.name = change.name;
        emitState(channel);
      },
      pushMeters: (levels) => {
        for (const listener of meterListeners) listener(levels);
      },
      meteringEnabled: () => metering,

      connect: async () => {
        connected = true;
        return true;
      },
      disconnect: () => {
        connected = false;
      },
      isConnected: () => connected,
      getCapabilities: () => ({ features: [...capabilities.features], gainRange: { ...capabilities.gainRange } }),

      setFader: async (channel, level) => {
        driver.commands.push({ op: "fader", channel, value: level });
        const reported = seeded.fader.get(channel) ?? level; // mixer is authoritative
        const state = channels.get(channel);
        if (state) {
          state.fader = reported;
          state.faderDb = faderFloatToDb(reported);
          emitState(channel);
        }
      },
      setMute: async (channel, muted) => {
        driver.commands.push({ op: "mute", channel, value: muted });
        const reported = seeded.mute.has(channel) ? seeded.mute.get(channel)! : muted;
        const state = channels.get(channel);
        if (state) {
          state.muted = reported;
          emitState(channel);
        }
      },
      setGain: async (channel, gainDb) => {
        if (!capabilities.features.includes("gain-control")) return; // capability enforcement
        driver.commands.push({ op: "gain", channel, value: gainDb });
        const reported = seeded.gain.get(channel) ?? gainDb;
        const state = channels.get(channel);
        if (state) {
          state.gainDb = reported;
          emitState(channel);
        }
      },
      getChannelState: (channel) => {
        const state = channels.get(channel);
        return state ? { ...state } : null;
      },
      getAllChannelStates: () => Array.from(channels.values()).map((s) => ({ ...s })),
      capturePreset: async () => {
        const payload: MixerPresetPayload = {};
        for (const [channel, state] of channels) {
          payload[`/ch/${String(channel).padStart(2, "0")}/mix/fader`] = state.fader;
          payload[`/ch/${String(channel).padStart(2, "0")}/mix/on`] = state.muted ? 0 : 1;
          if (capabilities.features.includes("gain-control")) payload[`/headamp/${String(channel - 1).padStart(3, "0")}/gain`] = state.gainDb;
        }
        return payload;
      },
      activatePreset: async (payload) => {
        for (const [address, value] of Object.entries(payload)) {
          const faderMatch = /^\/ch\/(\d+)\/mix\/fader$/.exec(address);
          if (faderMatch && typeof value === "number") {
            driver.commands.push({ op: "fader", channel: Number(faderMatch[1]), value });
            const state = channels.get(Number(faderMatch[1]));
            if (state) {
              state.fader = value;
              state.faderDb = faderFloatToDb(value);
            }
          }
          const onMatch = /^\/ch\/(\d+)\/mix\/on$/.exec(address);
          if (onMatch && typeof value === "number") {
            driver.commands.push({ op: "mute", channel: Number(onMatch[1]), value: value === 0 });
            const state = channels.get(Number(onMatch[1]));
            if (state) state.muted = value === 0;
          }
          const gainMatch = /^\/headamp\/(\d+)\/gain$/.exec(address);
          if (gainMatch && typeof value === "number") {
            driver.commands.push({ op: "gain", channel: Number(gainMatch[1]) + 1, value });
            const state = channels.get(Number(gainMatch[1]) + 1);
            if (state) state.gainDb = value;
          }
        }
      },
      onMeterUpdate: (listener) => {
        meterListeners.add(listener);
        return () => meterListeners.delete(listener);
      },
      setMeteringEnabled: (enabled) => {
        metering = enabled;
      },
      onStateChange: (listener) => {
        stateListeners.add(listener);
        return () => stateListeners.delete(listener);
      },
      onLiveness: (listener) => {
        livenessListeners.add(listener);
        return () => livenessListeners.delete(listener);
      },
      startChannelMonitor: (channel) => {
        capture.startChannelMonitor(config.mixerId, channel);
      },
      stopChannelMonitor: (channel) => {
        capture.stopChannelMonitor(config.mixerId, channel);
      },
    };

    drivers.set(config.mixerId, driver);
    return driver;
  };

  return { factory, get: (mixerId) => drivers.get(mixerId) };
}
