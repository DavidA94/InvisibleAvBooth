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
      if (method === "GetStreamServiceSettings") return Promise.resolve({ streamServiceSettings: { server: "rtmp://localhost:1935/live/stream" } });
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

export function createFakeNms(): NmsInstance {
  return { run: vi.fn(), stop: vi.fn(), on: vi.fn() };
}

export function createFakeNmsFactory(): NmsFactory {
  return () => createFakeNms();
}

export function createFakeSpawn(): SpawnFn {
  return vi.fn().mockImplementation(() => {
    const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter | null; kill: ReturnType<typeof vi.fn> };
    child.stderr = new EventEmitter() as EventEmitter;
    child.kill = vi.fn();
    // Simulate successful ffmpeg -version
    setTimeout(() => child.emit("close", 0), 0);
    return child;
  });
}
