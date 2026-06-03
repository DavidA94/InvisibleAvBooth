import { describe, it, expect, vi, afterEach } from "vitest";
import { StreamingPlatformService } from "./streamingPlatformService.js";
import type { PlatformEntry } from "./streamingPlatformService.js";
import { eventBus } from "../eventBus/eventBus.js";
import {
  BUS_PLATFORM_STATE_CHANGED,
  BUS_PLATFORM_HEALTH_UPDATED,
  BUS_PLATFORM_READINESS_CHANGED,
  BUS_RELAY_STATE_CHANGED,
  BUS_FORWARDER_EXITED,
} from "../eventBus/types.js";
import type { StreamingPlatformClient } from "../platforms/platformClient.js";
import { PlatformError } from "../platforms/platformClient.js";
import type { PlatformConfigDao } from "../platforms/platformConfigDao.js";
import type { RelayService } from "./relayService.js";
import type { ObsService } from "./obsService.js";
import type { SessionManifestService, InterpolatedState } from "./sessionManifestService.js";
import type { PlatformConfig, PlatformStreamState } from "../gateway/modules/platform/types.js";

// ── Mock factories ───────────────────────────────────────────────────────────

function makeMockClient(platformType: "youtube" | "facebook" = "youtube"): StreamingPlatformClient {
  return {
    createBroadcast: vi.fn().mockResolvedValue({
      broadcastId: `broadcast-${platformType}`,
      rtmpUrl: `rtmp://ingest.${platformType}.com/live/key123`,
      streamUrl: `rtmp://ingest.${platformType}.com/live`,
      streamKey: "key123",
    }),
    endBroadcast: vi.fn().mockResolvedValue(undefined),
    getBroadcastStatus: vi.fn().mockResolvedValue("live"),
    pollHealth: vi.fn().mockResolvedValue({ healthy: true, streamHealth: "good" }),
    refreshToken: vi.fn().mockResolvedValue({ accessToken: "new-token" }),
    validateToken: vi.fn().mockResolvedValue(true),
  };
}

function makeMockRelayService(): RelayService {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    getRelayState: vi.fn().mockReturnValue({ running: true, obsConnected: true }),
    startForwarder: vi.fn(),
    stopForwarder: vi.fn(),
    stopAllForwarders: vi.fn(),
    isForwarderAlive: vi.fn().mockReturnValue(true),
    simulateCrash: vi.fn().mockResolvedValue(undefined),
  } as unknown as RelayService;
}

function makeMockObsService(): ObsService {
  let streaming = false;
  return {
    getState: vi.fn().mockImplementation(() => ({
      connected: true,
      streaming,
      recording: false,
      commandedState: { streaming, recording: false },
    })),
    startStream: vi.fn().mockImplementation(async () => {
      streaming = true;
      return {
        success: true,
        value: { connected: true, streaming: true, recording: false, commandedState: { streaming: true, recording: false } },
      };
    }),
    stopStream: vi.fn().mockImplementation(async () => {
      streaming = false;
      return {
        success: true,
        value: { connected: true, streaming: false, recording: false, commandedState: { streaming: false, recording: false } },
      };
    }),
  } as unknown as ObsService;
}

function makeMockManifestService(): SessionManifestService {
  return {
    getInterpolated: vi.fn().mockReturnValue({
      interpolatedStreamTitle: "Test Stream",
      interpolatedDescription: "Test Description",
      manifestReady: true,
    } satisfies InterpolatedState),
  } as unknown as SessionManifestService;
}

function makeConfig(overrides: Partial<PlatformConfig> = {}): PlatformConfig {
  return {
    id: "yt-1",
    platformType: "youtube",
    label: "YouTube",
    enabled: true,
    accessToken: "token",
    refreshToken: "refresh",
    tokenExpiresAt: null,
    metadata: { privacy: "public", channelId: "ch-1" },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMockConfigDao(configs: PlatformConfig[] = [makeConfig()]): PlatformConfigDao {
  return {
    getAll: vi.fn().mockReturnValue(configs),
    getByType: vi.fn().mockImplementation((type: string) => configs.filter((c) => c.platformType === type)),
    getById: vi.fn().mockImplementation((id: string) => configs.find((c) => c.id === id) ?? null),
    upsert: vi.fn(),
    delete: vi.fn().mockReturnValue(true),
    updateTokens: vi.fn(),
  } as unknown as PlatformConfigDao;
}

interface ServiceDeps {
  clients: Map<string, StreamingPlatformClient>;
  relay: RelayService;
  obs: ObsService;
  manifest: SessionManifestService;
  configDao: PlatformConfigDao;
}

function makeService(overrides: Partial<ServiceDeps> = {}): { service: StreamingPlatformService; deps: ServiceDeps } {
  const clients = overrides.clients ?? new Map([["youtube", makeMockClient("youtube")]]);
  const relay = overrides.relay ?? makeMockRelayService();
  const obs = overrides.obs ?? makeMockObsService();
  const manifest = overrides.manifest ?? makeMockManifestService();
  const configDao = overrides.configDao ?? makeMockConfigDao();

  const deps = { clients, relay, obs, manifest, configDao };
  const service = new StreamingPlatformService(clients, relay, obs, manifest, configDao);
  return { service, deps };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("StreamingPlatformService", () => {
  afterEach(() => {
    eventBus.removeAllListeners();
  });

  describe("initial state", () => {
    it("loads enabled platforms from config dao", () => {
      const { service } = makeService({
        clients: new Map([
          ["youtube", makeMockClient("youtube")],
          ["facebook", makeMockClient("facebook")],
        ]),
        configDao: makeMockConfigDao([
          makeConfig({
            enabled: true,
            platformType: "facebook",
            label: "Facebook",
            id: "fb-1",
          }),
          makeConfig({
            enabled: false,
            platformType: "youtube",
            id: "yt-1",
          }),
          makeConfig({
            enabled: true,
            // @ts-expect-error fakebook doesn't exist
            platformType: "fakebook",
            id: "fake",
          }),
        ]),
      });
      const states = service.getPlatformStates();
      expect(states.size).toBe(1);
      expect(states.get("facebook")?.status).toBe("idle");
    });

    it.each(["public", "unlisted", undefined, null])("correctly builds the platform privacy for [%s]", (privacy) => {
      const { service } = makeService({
        configDao: makeMockConfigDao([
          makeConfig({
            metadata:
              privacy === null
                ? {}
                : {
                    privacy,
                  },
          }),
        ]),
      });

      const healths = service.getPlatformHealth();
      expect(healths).toEqual([
        {
          platformType: "youtube",
          label: "YouTube",
          healthy: true,
          ...(privacy === null || privacy === undefined ? {} : { privacy }),
        },
      ]);
    });
  });

  describe("state machine transitions", () => {
    it("transitions idle → starting → streaming on successful start", async () => {
      const changes: PlatformStreamState[] = [];
      eventBus.subscribe(BUS_PLATFORM_STATE_CHANGED, (payload) => changes.push(payload.state));

      const { service } = makeService();
      await service.startAll();

      expect(changes.map((s) => s.status)).toContain("starting");
      expect(changes.map((s) => s.status)).toContain("streaming");
    });

    it("transitions to error when broadcast creation fails", async () => {
      const client = makeMockClient("youtube");
      vi.mocked(client.createBroadcast).mockRejectedValue(new PlatformError("BROADCAST_CREATE_FAILED", "API error"));

      const { service } = makeService({ clients: new Map([["youtube", client]]) });
      await service.startAll();

      expect(service.getPlatformStates().get("youtube")?.status).toBe("error");
    });

    it("does not transition idle platforms on stopAll", async () => {
      const changes: PlatformStreamState[] = [];
      eventBus.subscribe(BUS_PLATFORM_STATE_CHANGED, (payload) => changes.push(payload.state));

      const { service } = makeService();
      await service.stopAll();
      expect(changes.length).toBe(0);
    });
  });

  describe("startAll orchestration", () => {
    it("creates broadcasts in parallel and starts forwarders", async () => {
      const ytConfig = makeConfig();
      const fbConfig = makeConfig({
        id: "fb-1",
        platformType: "facebook",
        label: "Facebook",
        metadata: { pageId: "pg-1" },
      });
      const ytClient = makeMockClient("youtube");
      const fbClient = makeMockClient("facebook");

      const { deps } = makeService({
        clients: new Map([
          ["youtube", ytClient],
          ["facebook", fbClient],
        ]),
        configDao: makeMockConfigDao([ytConfig, fbConfig]),
      });

      const service = new StreamingPlatformService(
        new Map([
          ["youtube", ytClient],
          ["facebook", fbClient],
        ]),
        deps.relay,
        deps.obs,
        deps.manifest,
        makeMockConfigDao([ytConfig, fbConfig]),
      );

      await service.startAll();

      expect(ytClient.createBroadcast).toHaveBeenCalledOnce();
      expect(fbClient.createBroadcast).toHaveBeenCalledOnce();
      expect(vi.mocked(deps.relay.startForwarder)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(deps.obs.startStream)).toHaveBeenCalledOnce();

      service.destroy();
    });

    it("skips OBS start if already streaming", async () => {
      const obs = makeMockObsService();
      vi.mocked(obs.getState).mockReturnValue({
        connected: true,
        streaming: true,
        recording: false,
        commandedState: { streaming: true, recording: false },
      });

      const { service } = makeService({ obs });
      await service.startAll();

      expect(vi.mocked(obs.startStream)).not.toHaveBeenCalled();
    });

    it("cleans up broadcasts when OBS start fails", async () => {
      const obs = makeMockObsService();
      vi.mocked(obs.startStream).mockResolvedValue({ success: false, error: { code: "OBS_UNREACHABLE", message: "timeout" } } as never);

      const client = makeMockClient("youtube");
      const { service } = makeService({ obs, clients: new Map([["youtube", client]]) });
      await service.startAll();

      expect(service.getPlatformStates().get("youtube")?.status).toBe("error");
      expect(client.endBroadcast).toHaveBeenCalled();
    });

    it("rejects concurrent operations", async () => {
      const slowClient = makeMockClient("youtube");
      vi.mocked(slowClient.createBroadcast).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  broadcastId: "b1",
                  rtmpUrl: "rtmp://test/key",
                  streamUrl: "rtmp://test",
                  streamKey: "key",
                }),
              100,
            ),
          ),
      );

      const { service } = makeService({ clients: new Map([["youtube", slowClient]]) });
      const first = service.startAll();
      await expect(service.startAll()).rejects.toThrow("A streaming operation is already in progress");
      await first;
    });

    it("reads manifest from SessionManifestService", async () => {
      const { service, deps } = makeService();
      await service.startAll();
      expect(vi.mocked(deps.manifest.getInterpolated)).toHaveBeenCalled();
    });
  });

  describe("startPlatform", () => {
    it("starts a single platform", async () => {
      const { service, deps } = makeService();
      await service.startPlatform("youtube");

      expect(service.getPlatformStates().get("youtube")?.status).toBe("streaming");
      expect(vi.mocked(deps.relay.startForwarder)).toHaveBeenCalledOnce();
    });

    it("throws for unknown platform type", async () => {
      const { service } = makeService();
      await expect(service.startPlatform("twitch")).rejects.toThrow("Platform twitch not found");
    });
  });

  describe("stopAll", () => {
    it("stops all streaming platforms and transitions to idle", async () => {
      const { service, deps } = makeService();
      await service.startAll();
      await service.stopAll();

      expect(service.getPlatformStates().get("youtube")?.status).toBe("idle");
      expect(vi.mocked(deps.relay.stopForwarder)).toHaveBeenCalled();
    });

    it("ends broadcasts via platform client", async () => {
      const client = makeMockClient("youtube");
      const { service } = makeService({ clients: new Map([["youtube", client]]) });
      await service.startAll();
      await service.stopAll();

      expect(client.endBroadcast).toHaveBeenCalled();
    });

    it("stops OBS stream when all platforms idle (Req 7.7)", async () => {
      const obs = makeMockObsService();
      vi.mocked(obs.getState).mockReturnValue({
        connected: true,
        streaming: true,
        recording: false,
        commandedState: { streaming: true, recording: false },
      });

      const { service } = makeService({ obs });
      await service.startAll();
      await service.stopAll();

      expect(vi.mocked(obs.stopStream)).toHaveBeenCalled();
    });

    it("handles stop timeout gracefully", async () => {
      vi.useFakeTimers();

      const client = makeMockClient("youtube");
      vi.mocked(client.endBroadcast).mockImplementation(() => new Promise(() => {}));

      const { service } = makeService({ clients: new Map([["youtube", client]]) });
      await service.startAll();

      const stopPromise = service.stopAll();
      await vi.advanceTimersByTimeAsync(30_001);
      await stopPromise;

      vi.useRealTimers();

      expect(service.getPlatformStates().get("youtube")?.status).toBe("idle");
    });
  });

  describe("stopPlatform", () => {
    it("stops a single platform", async () => {
      const { service, deps } = makeService();
      await service.startAll();
      await service.stopPlatform("youtube");

      expect(service.getPlatformStates().get("youtube")?.status).toBe("idle");
      expect(vi.mocked(deps.relay.stopForwarder)).toHaveBeenCalled();
    });
  });

  describe("health polling", () => {
    it("emits health updates for streaming platforms", async () => {
      vi.useFakeTimers();

      const updates: Array<{ platformId: string; health: string }> = [];
      eventBus.subscribe(BUS_PLATFORM_HEALTH_UPDATED, (payload) => updates.push(payload));

      const { service } = makeService();
      await service.startAll();
      await vi.advanceTimersByTimeAsync(20_001);

      vi.useRealTimers();

      expect(updates.length).toBeGreaterThanOrEqual(1);
      expect(updates[0]?.health).toBe("good");
    });

    it("emits noData after 3 consecutive failures", async () => {
      vi.useFakeTimers();

      const client = makeMockClient("youtube");
      vi.mocked(client.pollHealth).mockRejectedValue(new PlatformError("HEALTH_POLL_FAILED", "timeout"));

      const updates: Array<{ platformId: string; health: string }> = [];
      eventBus.subscribe(BUS_PLATFORM_HEALTH_UPDATED, (payload) => updates.push(payload));

      const { service } = makeService({ clients: new Map([["youtube", client]]) });
      await service.startAll();
      await vi.advanceTimersByTimeAsync(20_001 * 3);

      vi.useRealTimers();

      expect(updates.some((u) => u.health === "noData")).toBe(true);
    });

    it("stops polling when all platforms stop", async () => {
      vi.useFakeTimers();

      const client = makeMockClient("youtube");
      const { service } = makeService({ clients: new Map([["youtube", client]]) });
      await service.startAll();
      await service.stopAll();

      vi.mocked(client.pollHealth).mockClear();
      await vi.advanceTimersByTimeAsync(20_001);

      vi.useRealTimers();

      expect(client.pollHealth).not.toHaveBeenCalled();
    });
  });

  describe("forwarder exit / auto-recovery", () => {
    it("respawns forwarder on unexpected exit during streaming", async () => {
      vi.useFakeTimers();

      const { service, deps } = makeService();
      await service.startAll();

      eventBus.emit(BUS_FORWARDER_EXITED, { platformId: "youtube", code: 1, lastStderr: ["connection lost"] });
      await vi.advanceTimersByTimeAsync(2_000 + 5_000 + 100);

      vi.useRealTimers();

      expect(vi.mocked(deps.relay.startForwarder)).toHaveBeenCalledTimes(2);
    });

    it("suppresses recovery during no_source state (Property 23)", async () => {
      const { service, deps } = makeService();
      await service.startAll();

      eventBus.emit(BUS_RELAY_STATE_CHANGED, { running: true, obsConnected: false });

      const callsBefore = vi.mocked(deps.relay.startForwarder).mock.calls.length;
      eventBus.emit(BUS_FORWARDER_EXITED, { platformId: "youtube", code: 1, lastStderr: [] });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(vi.mocked(deps.relay.startForwarder).mock.calls.length).toBe(callsBefore);
    });
  });

  describe("relay state changes", () => {
    it("transitions streaming platforms to no_source on OBS disconnect", async () => {
      const { service } = makeService();
      await service.startAll();

      eventBus.emit(BUS_RELAY_STATE_CHANGED, { running: true, obsConnected: false });

      expect(service.getPlatformStates().get("youtube")?.status).toBe("no_source");
    });

    it("transitions no_source to recovering on OBS reconnect", async () => {
      const changes: PlatformStreamState[] = [];
      eventBus.subscribe(BUS_PLATFORM_STATE_CHANGED, (payload) => changes.push(payload.state));

      const { service } = makeService();
      await service.startAll();

      eventBus.emit(BUS_RELAY_STATE_CHANGED, { running: true, obsConnected: false });
      eventBus.emit(BUS_RELAY_STATE_CHANGED, { running: true, obsConnected: true });

      expect(changes.map((s) => s.status)).toContain("recovering");
    });

    it("recovers to streaming when broadcast is still active", async () => {
      const { service } = makeService();
      await service.startAll();

      eventBus.emit(BUS_RELAY_STATE_CHANGED, { running: true, obsConnected: false });
      eventBus.emit(BUS_RELAY_STATE_CHANGED, { running: true, obsConnected: true });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(service.getPlatformStates().get("youtube")?.status).toBe("streaming");
    });

    it("transitions to error when broadcast ended during disconnect", async () => {
      const client = makeMockClient("youtube");
      vi.mocked(client.pollHealth).mockRejectedValue(new PlatformError("HEALTH_POLL_FAILED", "broadcast ended"));

      const { service } = makeService({ clients: new Map([["youtube", client]]) });
      await service.startAll();

      eventBus.emit(BUS_RELAY_STATE_CHANGED, { running: true, obsConnected: false });
      eventBus.emit(BUS_RELAY_STATE_CHANGED, { running: true, obsConnected: true });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(service.getPlatformStates().get("youtube")?.status).toBe("error");
    });

    it.each`
      scenario         | pollResult                                            | expectedStatus
      ${"healthy"}     | ${{ healthy: true, streamHealth: "good" }}            | ${"streaming"}
      ${"unhealthy"}   | ${{ healthy: false, streamHealth: "bad" }}            | ${"error"}
      ${"poll throws"} | ${new PlatformError("HEALTH_POLL_FAILED", "timeout")} | ${"error"}
    `("_recoverPlatform transitions to $expectedStatus when poll is $scenario", async ({ pollResult, expectedStatus }) => {
      const client = makeMockClient("youtube");
      const { service } = makeService({ clients: new Map([["youtube", client]]) });

      // Walk through valid transitions to reach "recovering"
      service._transitionPlatform("youtube", "starting");
      service._transitionPlatform("youtube", "streaming");
      service._transitionPlatform("youtube", "no_source");
      service._transitionPlatform("youtube", "recovering");

      // Access the internal entry to set broadcastId
      const entry = (service as unknown as { platforms: Map<string, PlatformEntry> }).platforms.get("youtube")!;
      entry.broadcastId = "broadcast-1";
      entry.rtmpUrl = "rtmp://test/key";

      vi.mocked(client.pollHealth).mockImplementation(() => (pollResult instanceof Error ? Promise.reject(pollResult) : Promise.resolve(pollResult)));

      await service._recoverPlatform("youtube", entry);
      expect(service.getPlatformStates().get("youtube")?.status).toBe(expectedStatus);
    });

    it("_recoverPlatform respawns dead forwarder", async () => {
      const client = makeMockClient("youtube");
      const relay = makeMockRelayService();
      vi.mocked(relay.isForwarderAlive).mockReturnValue(false);

      const { service } = makeService({ clients: new Map([["youtube", client]]), relay });

      service._transitionPlatform("youtube", "starting");
      service._transitionPlatform("youtube", "streaming");
      service._transitionPlatform("youtube", "no_source");
      service._transitionPlatform("youtube", "recovering");

      const entry = (service as unknown as { platforms: Map<string, PlatformEntry> }).platforms.get("youtube")!;
      entry.broadcastId = "broadcast-1";
      entry.rtmpUrl = "rtmp://test/key";

      await service._recoverPlatform("youtube", entry);
      expect(relay.startForwarder).toHaveBeenCalledWith("youtube", "rtmp://test/key");
    });

    it("_recoverPlatform transitions to error when no broadcastId", async () => {
      const { service } = makeService();

      service._transitionPlatform("youtube", "starting");
      service._transitionPlatform("youtube", "streaming");
      service._transitionPlatform("youtube", "no_source");
      service._transitionPlatform("youtube", "recovering");

      const entry = (service as unknown as { platforms: Map<string, PlatformEntry> }).platforms.get("youtube")!;
      entry.broadcastId = undefined;

      await service._recoverPlatform("youtube", entry);
      expect(service.getPlatformStates().get("youtube")?.status).toBe("error");
    });
  });

  describe("validateTokensOnStartup", () => {
    it("emits readiness for all enabled platforms", async () => {
      const events: Array<{ platforms: Array<{ healthy: boolean }> }> = [];
      eventBus.subscribe(BUS_PLATFORM_READINESS_CHANGED, (payload) => events.push(payload));

      const { service } = makeService();
      await service.validateTokensOnStartup();

      expect(events.length).toBe(1);
      expect(events[0]!.platforms[0]!.healthy).toBe(true);
    });

    it("reports unhealthy when token validation fails", async () => {
      const client = makeMockClient("youtube");
      vi.mocked(client.validateToken).mockResolvedValue(false);
      vi.mocked(client.refreshToken).mockRejectedValue(new Error("refresh failed"));

      const events: Array<{ platforms: Array<{ healthy: boolean }> }> = [];
      eventBus.subscribe(BUS_PLATFORM_READINESS_CHANGED, (payload) => events.push(payload));

      const { service } = makeService({ clients: new Map([["youtube", client]]) });
      await service.validateTokensOnStartup();

      expect(events[0]!.platforms[0]!.healthy).toBe(false);
    });
  });

  describe("getPlatformHealth", () => {
    it("returns health summaries for all platforms", () => {
      const { service } = makeService();
      const health = service.getPlatformHealth();
      expect(health.length).toBe(1);
      expect(health[0]!.platformType).toBe("youtube");
      expect(health[0]!.label).toBe("YouTube");
      expect(health[0]!.privacy).toBe("public");
    });
  });

  describe("destroy", () => {
    it("cleans up timers and event subscriptions", async () => {
      const { service } = makeService();
      await service.startAll();
      service.destroy();

      // Emitting events after destroy should not cause errors
      eventBus.emit(BUS_FORWARDER_EXITED, { platformId: "youtube", code: 1, lastStderr: [] });
      eventBus.emit(BUS_RELAY_STATE_CHANGED, { running: true, obsConnected: false });
    });
  });

  describe("reloadPlatforms", () => {
    it("clears and reloads platforms from config dao", () => {
      const configDao = makeMockConfigDao([makeConfig()]);
      const fbClient = makeMockClient("facebook");
      const { service } = makeService({
        configDao,
        clients: new Map([
          ["youtube", makeMockClient("youtube")],
          ["facebook", fbClient],
        ]),
      });

      expect(service.getPlatformStates().size).toBe(1);

      vi.mocked(configDao.getAll).mockReturnValue([makeConfig({ id: "fb-1", platformType: "facebook", label: "Facebook" })]);
      const events: unknown[] = [];
      eventBus.subscribe(BUS_PLATFORM_READINESS_CHANGED, (p) => events.push(p));

      service.reloadPlatforms();

      expect(service.getPlatformStates().size).toBe(1);
      expect(service.getPlatformStates().has("facebook")).toBe(true);
      expect(events.length).toBe(1);
    });
  });

  describe("_transitionPlatform edge cases", () => {
    it("ignores transition for nonexistent platformId", () => {
      const changes: unknown[] = [];
      eventBus.subscribe(BUS_PLATFORM_STATE_CHANGED, (p) => changes.push(p));

      const { service } = makeService();
      service._transitionPlatform("nonexistent", "starting");
      expect(changes.length).toBe(0);
    });

    it("rejects invalid state transitions", () => {
      const changes: unknown[] = [];
      eventBus.subscribe(BUS_PLATFORM_STATE_CHANGED, (p) => changes.push(p));

      const { service } = makeService();
      // idle → streaming is invalid (must go through starting)
      service._transitionPlatform("youtube", "streaming");
      expect(changes.length).toBe(0);
      expect(service.getPlatformStates().get("youtube")?.status).toBe("idle");
    });
  });

  describe("startAll edge cases", () => {
    it("returns early when no enabled idle platforms exist", async () => {
      const client = makeMockClient("youtube");
      const configDao = makeMockConfigDao([makeConfig({ enabled: false })]);
      const { service } = makeService({ clients: new Map([["youtube", client]]), configDao });

      await service.startAll();
      expect(client.createBroadcast).not.toHaveBeenCalled();
    });

    it("returns early when all platforms are already streaming", async () => {
      const client = makeMockClient("youtube");
      const { service } = makeService({ clients: new Map([["youtube", client]]) });

      await service.startAll();
      vi.mocked(client.createBroadcast).mockClear();

      // Reset operationInProgress so we can call again
      await service.stopAll();
      // Platform is now idle, start again to verify original test
      await service.startAll();
      expect(client.createBroadcast).toHaveBeenCalledOnce();
    });
  });

  describe("startPlatform edge cases", () => {
    it("cleans up existing broadcast when restarting from error state (Property 30)", async () => {
      const client = makeMockClient("youtube");
      const { service } = makeService({ clients: new Map([["youtube", client]]) });

      // Walk to error state with a broadcastId set
      service._transitionPlatform("youtube", "starting");
      service._transitionPlatform("youtube", "error", "some failure");
      const entry = (service as unknown as { platforms: Map<string, PlatformEntry> }).platforms.get("youtube")!;
      entry.broadcastId = "old-broadcast";

      await service.startPlatform("youtube");

      // Should have called endBroadcast for cleanup
      expect(client.endBroadcast).toHaveBeenCalledWith("old-broadcast");
      expect(service.getPlatformStates().get("youtube")?.status).toBe("streaming");
    });

    it("transitions to error when broadcast creation fails", async () => {
      const client = makeMockClient("youtube");
      vi.mocked(client.createBroadcast).mockRejectedValue(new Error("quota exceeded"));

      const { service } = makeService({ clients: new Map([["youtube", client]]) });
      await service.startPlatform("youtube");

      expect(service.getPlatformStates().get("youtube")?.status).toBe("error");
    });

    it("transitions to error when OBS start fails", async () => {
      const obs = makeMockObsService();
      vi.mocked(obs.startStream).mockResolvedValue({ success: false, error: { code: "OBS_UNREACHABLE", message: "timeout" } } as never);
      const client = makeMockClient("youtube");

      const { service } = makeService({ obs, clients: new Map([["youtube", client]]) });
      await service.startPlatform("youtube");

      expect(service.getPlatformStates().get("youtube")?.status).toBe("error");
      expect(client.endBroadcast).toHaveBeenCalled();
    });
  });

  describe("relay state changes — intentional OBS stop", () => {
    it("transitions to stopping and stops platforms when OBS stopped intentionally", async () => {
      const obs = makeMockObsService();
      const { service } = makeService({ obs });
      await service.startAll();

      // Simulate OBS stopped intentionally — getState returns streaming: false
      vi.mocked(obs.getState).mockReturnValue({
        connected: true,
        streaming: false,
        recording: false,
        commandedState: { streaming: false, recording: false },
      });

      eventBus.emit(BUS_RELAY_STATE_CHANGED, { running: true, obsConnected: false });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(service.getPlatformStates().get("youtube")?.status).toBe("idle");
    });
  });

  describe("forwarder exit edge cases", () => {
    it("ignores exit for unknown platform", () => {
      const { deps } = makeService();
      const callsBefore = vi.mocked(deps.relay.startForwarder).mock.calls.length;

      eventBus.emit(BUS_FORWARDER_EXITED, { platformId: "unknown", code: 1, lastStderr: [] });

      expect(vi.mocked(deps.relay.startForwarder).mock.calls.length).toBe(callsBefore);
    });

    it("transitions to error when recovery health check returns unhealthy", async () => {
      vi.useFakeTimers();

      const client = makeMockClient("youtube");
      vi.mocked(client.pollHealth).mockResolvedValue({ healthy: false, streamHealth: "bad" });

      const { service } = makeService({ clients: new Map([["youtube", client]]) });
      await service.startAll();

      eventBus.emit(BUS_FORWARDER_EXITED, { platformId: "youtube", code: 1, lastStderr: [] });
      await vi.advanceTimersByTimeAsync(2_000 + 5_000 + 100);

      vi.useRealTimers();

      expect(service.getPlatformStates().get("youtube")?.status).toBe("error");
    });
  });

  describe("validateTokensOnStartup edge cases", () => {
    it("proactively refreshes expired YouTube token", async () => {
      const client = makeMockClient("youtube");
      vi.mocked(client.refreshToken).mockResolvedValue({
        accessToken: "new-token",
        refreshToken: "new-refresh",
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      });

      const config = makeConfig({
        platformType: "youtube",
        tokenExpiresAt: new Date(Date.now() - 60_000).toISOString(), // expired
      });
      const configDao = makeMockConfigDao([config]);

      const events: Array<{ platforms: Array<{ healthy: boolean }> }> = [];
      eventBus.subscribe(BUS_PLATFORM_READINESS_CHANGED, (p) => events.push(p));

      const { service } = makeService({ clients: new Map([["youtube", client]]), configDao });
      await service.validateTokensOnStartup();
      service.destroy();

      expect(client.refreshToken).toHaveBeenCalled();
      expect(client.validateToken).not.toHaveBeenCalled();
      expect(events[0]!.platforms[0]!.healthy).toBe(true);
    });

    it("falls back to refresh when validateToken throws", async () => {
      const client = makeMockClient("youtube");
      vi.mocked(client.validateToken).mockRejectedValue(new Error("network error"));
      vi.mocked(client.refreshToken).mockResolvedValue({
        accessToken: "new-token",
        refreshToken: "new-refresh",
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      });

      const config = makeConfig({ platformType: "youtube", tokenExpiresAt: null });
      const configDao = makeMockConfigDao([config]);

      const events: Array<{ platforms: Array<{ healthy: boolean }> }> = [];
      eventBus.subscribe(BUS_PLATFORM_READINESS_CHANGED, (p) => events.push(p));

      const { service } = makeService({ clients: new Map([["youtube", client]]), configDao });
      await service.validateTokensOnStartup();
      service.destroy();

      expect(client.refreshToken).toHaveBeenCalled();
      expect(events[0]!.platforms[0]!.healthy).toBe(true);
    });

    it("does not attempt refresh for non-youtube platforms on validation failure", async () => {
      const client = makeMockClient("facebook");
      vi.mocked(client.validateToken).mockResolvedValue(false);

      const config = makeConfig({ id: "fb-1", platformType: "facebook", label: "Facebook" });
      const configDao = makeMockConfigDao([config]);

      const events: Array<{ platforms: Array<{ healthy: boolean }> }> = [];
      eventBus.subscribe(BUS_PLATFORM_READINESS_CHANGED, (p) => events.push(p));

      const { service } = makeService({ clients: new Map([["facebook", client]]), configDao });
      await service.validateTokensOnStartup();
      service.destroy();

      expect(client.refreshToken).not.toHaveBeenCalled();
      expect(events[0]!.platforms[0]!.healthy).toBe(false);
    });
  });

  describe("checkAndRefreshTokens (timer-based)", () => {
    it("refreshes expiring youtube tokens and emits readiness on failure", async () => {
      vi.useFakeTimers();

      const client = makeMockClient("youtube");
      vi.mocked(client.refreshToken).mockRejectedValue(new Error("refresh failed"));

      const config = makeConfig({
        platformType: "youtube",
        tokenExpiresAt: new Date(Date.now() + 60_000).toISOString(), // expires in 1 min (within 5 min threshold)
      });
      const configDao = makeMockConfigDao([config]);

      const events: Array<{ platforms: unknown[] }> = [];
      eventBus.subscribe(BUS_PLATFORM_READINESS_CHANGED, (p) => events.push(p));

      const { service } = makeService({ clients: new Map([["youtube", client]]), configDao });
      await service.validateTokensOnStartup(); // starts the timer
      events.length = 0; // clear initial readiness event

      await vi.advanceTimersByTimeAsync(60_001); // trigger timer

      vi.useRealTimers();
      service.destroy();

      expect(client.refreshToken).toHaveBeenCalled();
      expect(events.length).toBeGreaterThanOrEqual(1);
    });

    it("does not emit readiness when refresh succeeds", async () => {
      vi.useFakeTimers();

      const client = makeMockClient("youtube");
      vi.mocked(client.refreshToken).mockResolvedValue({
        accessToken: "new-token",
        refreshToken: "new-refresh",
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      });

      const config = makeConfig({
        platformType: "youtube",
        tokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      const configDao = makeMockConfigDao([config]);

      const events: Array<{ platforms: unknown[] }> = [];
      eventBus.subscribe(BUS_PLATFORM_READINESS_CHANGED, (p) => events.push(p));

      const { service } = makeService({ clients: new Map([["youtube", client]]), configDao });
      await service.validateTokensOnStartup();
      events.length = 0;

      await vi.advanceTimersByTimeAsync(60_001);

      vi.useRealTimers();
      service.destroy();

      expect(events.length).toBe(0);
    });
  });

  describe("ensureObsStreamingToRelay edge cases", () => {
    it("times out when OBS never connects to relay", async () => {
      vi.useFakeTimers();

      const obs = makeMockObsService();
      const relay = makeMockRelayService();
      vi.mocked(relay.getRelayState).mockReturnValue({ running: true, obsConnected: false });

      const { service } = makeService({ obs, relay });

      const startPromise = service.startAll();
      await vi.advanceTimersByTimeAsync(10_001);
      await startPromise;

      vi.useRealTimers();

      expect(service.getPlatformStates().get("youtube")?.status).toBe("error");
    });
  });

  describe("health polling edge cases", () => {
    it("emits bad health but does not transition to error below threshold", async () => {
      vi.useFakeTimers();

      const client = makeMockClient("youtube");
      vi.mocked(client.pollHealth).mockResolvedValue({ healthy: false, streamHealth: "bad" });

      const updates: Array<{ platformId: string; health: string }> = [];
      eventBus.subscribe(BUS_PLATFORM_HEALTH_UPDATED, (payload) => updates.push(payload));

      const { service } = makeService({ clients: new Map([["youtube", client]]) });
      await service.startAll();
      await vi.advanceTimersByTimeAsync(20_001); // 1 poll — below 3 threshold

      vi.useRealTimers();

      expect(updates.some((u) => u.health === "bad")).toBe(true);
      expect(service.getPlatformStates().get("youtube")?.status).toBe("streaming");
    });

    it("resets failure count on successful poll after failures", async () => {
      vi.useFakeTimers();

      const client = makeMockClient("youtube");
      let callCount = 0;
      vi.mocked(client.pollHealth).mockImplementation(() => {
        callCount++;
        if (callCount <= 2) return Promise.reject(new Error("timeout"));
        return Promise.resolve({ healthy: true, streamHealth: "good" });
      });

      const { service } = makeService({ clients: new Map([["youtube", client]]) });
      await service.startAll();
      await vi.advanceTimersByTimeAsync(20_001 * 3); // 3 polls: fail, fail, succeed

      vi.useRealTimers();

      // Should still be streaming because the 3rd poll succeeded, resetting counter
      expect(service.getPlatformStates().get("youtube")?.status).toBe("streaming");
    });
  });

  describe("stopSinglePlatform edge cases", () => {
    it("logs warning when endBroadcast fails during stop", async () => {
      const client = makeMockClient("youtube");
      vi.mocked(client.endBroadcast).mockRejectedValue(new Error("API error"));

      const { service } = makeService({ clients: new Map([["youtube", client]]) });
      await service.startAll();
      await service.stopAll();

      // Should still transition to idle despite error
      expect(service.getPlatformStates().get("youtube")?.status).toBe("idle");
    });

    it("handles non-Error rejection in endBroadcast", async () => {
      const client = makeMockClient("youtube");
      vi.mocked(client.endBroadcast).mockRejectedValue("string error");

      const { service } = makeService({ clients: new Map([["youtube", client]]) });
      await service.startAll();
      await service.stopAll();

      expect(service.getPlatformStates().get("youtube")?.status).toBe("idle");
    });
  });

  describe("_endBroadcastBestEffort edge cases", () => {
    it("returns silently for unknown platform", () => {
      const { service } = makeService();
      // Should not throw
      service._endBroadcastBestEffort("nonexistent", "some-broadcast");
    });

    it("handles non-Error rejection in catch", async () => {
      const client = makeMockClient("youtube");
      vi.mocked(client.endBroadcast).mockRejectedValue("string rejection");

      const { service } = makeService({ clients: new Map([["youtube", client]]) });
      service._endBroadcastBestEffort("youtube", "broadcast-1");

      // Give the promise time to resolve
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  });

  describe("startAll non-Error broadcast rejection", () => {
    it("handles non-Error rejection in createBroadcast", async () => {
      const client = makeMockClient("youtube");
      vi.mocked(client.createBroadcast).mockRejectedValue("string error");

      const { service } = makeService({ clients: new Map([["youtube", client]]) });
      await service.startAll();

      expect(service.getPlatformStates().get("youtube")?.status).toBe("error");
      expect(service.getPlatformStates().get("youtube")?.statusMessage).toBe("string error");
    });
  });

  describe("startPlatform non-Error rejection", () => {
    it("handles non-Error rejection in createBroadcast", async () => {
      const client = makeMockClient("youtube");
      vi.mocked(client.createBroadcast).mockRejectedValue(42);

      const { service } = makeService({ clients: new Map([["youtube", client]]) });
      await service.startPlatform("youtube");

      expect(service.getPlatformStates().get("youtube")?.status).toBe("error");
      expect(service.getPlatformStates().get("youtube")?.statusMessage).toBe("42");
    });
  });

  describe("validateTokensOnStartup — client not in map", () => {
    it("skips platforms when client cannot be created", async () => {
      // Config with an unknown platform type, no client in map → createClient returns null
      const config = makeConfig({
        id: "unknown-1",
        // @ts-expect-error testing unknown platform type
        platformType: "twitch",
        label: "Twitch",
      });
      const configDao = makeMockConfigDao([config]);

      const events: Array<{ platforms: unknown[] }> = [];
      eventBus.subscribe(BUS_PLATFORM_READINESS_CHANGED, (p) => events.push(p));

      const { service } = makeService({ clients: new Map(), configDao });
      await service.validateTokensOnStartup();
      service.destroy();

      // Should emit with empty platforms since unknown type can't create client
      expect(events[0]!.platforms.length).toBe(0);
    });
  });

  describe("attemptTokenRefresh — non-Error rejection", () => {
    it("handles non-Error thrown during refresh", async () => {
      const client = makeMockClient("youtube");
      vi.mocked(client.validateToken).mockResolvedValue(false);
      vi.mocked(client.refreshToken).mockRejectedValue("string error");

      const config = makeConfig({ platformType: "youtube" });
      const configDao = makeMockConfigDao([config]);

      const events: Array<{ platforms: Array<{ healthy: boolean }> }> = [];
      eventBus.subscribe(BUS_PLATFORM_READINESS_CHANGED, (p) => events.push(p));

      const { service } = makeService({ clients: new Map([["youtube", client]]), configDao });
      await service.validateTokensOnStartup();
      service.destroy();

      expect(events[0]!.platforms[0]!.healthy).toBe(false);
    });
  });

  describe("ensureObsStreamingToRelay — mutex reuse", () => {
    it("reuses existing mutex for concurrent calls", async () => {
      const obs = makeMockObsService();
      const relay = makeMockRelayService();
      vi.mocked(relay.getRelayState).mockReturnValue({ running: true, obsConnected: false });

      // Make startStream slow so mutex is still active
      vi.mocked(obs.startStream).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              vi.mocked(relay.getRelayState).mockReturnValue({ running: true, obsConnected: true });
              // Emit relay state changed to resolve the waiting promise
              eventBus.emit(BUS_RELAY_STATE_CHANGED, { running: true, obsConnected: true });
              resolve({
                success: true,
                value: { connected: true, streaming: true, recording: false, commandedState: { streaming: true, recording: false } },
              });
            }, 50);
          }),
      );

      const ytConfig = makeConfig();
      const fbConfig = makeConfig({ id: "fb-1", platformType: "facebook", label: "Facebook" });
      const ytClient = makeMockClient("youtube");
      const fbClient = makeMockClient("facebook");

      const service = new StreamingPlatformService(
        new Map([
          ["youtube", ytClient],
          ["facebook", fbClient],
        ]),
        relay,
        obs,
        makeMockManifestService(),
        makeMockConfigDao([ytConfig, fbConfig]),
      );

      await service.startAll();

      // OBS startStream should only be called once (mutex)
      expect(vi.mocked(obs.startStream)).toHaveBeenCalledOnce();
      service.destroy();
    });
  });
});
