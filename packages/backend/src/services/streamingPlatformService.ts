/**
 * StreamingPlatformService — orchestrator for multi-platform streaming.
 *
 * Manages the platform state machine, broadcast lifecycle, health polling,
 * and token management. All platform API calls and OBS stream control flow
 * through this service.
 *
 * Dependencies are injected via constructor for testability.
 */
import {
  BUS_PLATFORM_STATE_CHANGED,
  BUS_PLATFORM_HEALTH_UPDATED,
  BUS_PLATFORM_READINESS_CHANGED,
  BUS_FORWARDER_EXITED,
  BUS_RELAY_STATE_CHANGED,
} from "../eventBus/types.js";
import { eventBus } from "../eventBus/eventBus.js";
import { logger } from "../logger.js";
import type { StreamingPlatformClient, BroadcastInfo } from "../platforms/platformClient.js";
import { YouTubeClient } from "../platforms/youtubeClient.js";
import { FacebookClient } from "../platforms/facebookClient.js";
import type { PlatformConfigDao } from "../platforms/platformConfigDao.js";
import type { RelayService } from "./relayService.js";
import type { ObsService } from "./obsService.js";
import type { SessionManifestService } from "./sessionManifestService.js";
import type { PlatformStatus, PlatformStreamState, PlatformHealthSummary, PlatformConfig, RelayState } from "../gateway/modules/platform/types.js";

// ── Valid state transitions per design doc ───────────────────────────────────

const VALID_TRANSITIONS: Record<PlatformStatus, readonly PlatformStatus[]> = {
  idle: ["starting"],
  starting: ["streaming", "error"],
  streaming: ["stopping", "no_source", "error"],
  stopping: ["idle"],
  no_source: ["recovering", "error"],
  recovering: ["streaming", "error"],
  error: ["starting"],
};

const STOP_TIMEOUT_MS = 30_000;
const OBS_START_TIMEOUT_MS = 10_000;
const HEALTH_POLL_INTERVAL_MS = 20_000;
const RECOVERY_WAIT_MS = 2_000;
const RECOVERY_VERIFY_MS = 5_000;
const HEALTH_FAILURE_THRESHOLD = 3;

export interface PlatformEntry {
  config: PlatformConfig;
  client: StreamingPlatformClient;
  state: PlatformStreamState;
  broadcastId: string | undefined;
  rtmpUrl: string | undefined;
  healthFailureCount: number;
}

export class StreamingPlatformService {
  private readonly platforms = new Map<string, PlatformEntry>();
  private operationInProgress = false;
  private healthPollTimer: ReturnType<typeof setInterval> | null = null;
  private tokenRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private obsStartMutex: Promise<{ success: boolean }> | null = null;

  private readonly handleForwarderExited: (payload: { platformId: string; code: number | null; lastStderr: string[] }) => void;
  private readonly handleRelayStateChanged: (payload: RelayState) => void;

  constructor(
    private readonly platformClients: Map<string, StreamingPlatformClient>,
    private readonly relayService: RelayService,
    private readonly obsService: ObsService,
    private readonly manifestService: SessionManifestService,
    private readonly platformConfigDao: PlatformConfigDao,
  ) {
    this.handleForwarderExited = (payload) => {
      if (payload.lastStderr.length > 0) {
        logger.warn(`FFmpeg stderr for ${payload.platformId}`, { context: { lastLines: payload.lastStderr.slice(-5) } });
      }
      void this.onForwarderExited(payload.platformId);
    };
    this.handleRelayStateChanged = (payload) => {
      this.onRelayStateChanged(payload);
    };

    eventBus.subscribe(BUS_FORWARDER_EXITED, this.handleForwarderExited);
    eventBus.subscribe(BUS_RELAY_STATE_CHANGED, this.handleRelayStateChanged);

    this.loadPlatforms();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  getPlatformStates(): Map<string, PlatformStreamState> {
    const result = new Map<string, PlatformStreamState>();
    for (const [id, entry] of this.platforms) {
      result.set(id, { ...entry.state });
    }
    return result;
  }

  getPlatformHealth(): PlatformHealthSummary[] {
    return [...this.platforms.values()].map((entry) => {
      const privacy = entry.config.metadata["privacy"];
      return {
        platformType: entry.config.platformType,
        label: entry.config.label,
        healthy: entry.state.status !== "error",
        ...(typeof privacy === "string" ? { privacy: privacy as "public" | "unlisted" | "private" } : {}),
      };
    });
  }

  async startAll(): Promise<void> {
    this.assertNotBusy();
    this.operationInProgress = true;
    try {
      const { interpolatedStreamTitle, interpolatedDescription } = this.manifestService.getInterpolated();
      const entries = [...this.platforms.entries()].filter(([, e]) => e.config.enabled && e.state.status === "idle");
      if (entries.length === 0) return;

      for (const [id] of entries) {
        this._transitionPlatform(id, "starting", "Creating broadcast…");
      }

      // Steps (a)+(b): create broadcasts in parallel
      const results = await Promise.allSettled(
        entries.map(async ([id, entry]): Promise<{ platformId: string; broadcast: BroadcastInfo }> => {
          const privacy = typeof entry.config.metadata["privacy"] === "string" ? entry.config.metadata["privacy"] : undefined;
          const broadcast = await entry.client.createBroadcast(interpolatedStreamTitle, interpolatedDescription, privacy);
          return { platformId: id, broadcast };
        }),
      );

      const successful: Array<{ platformId: string; broadcast: BroadcastInfo }> = [];
      for (let i = 0; i < results.length; i++) {
        const result = results[i]!;
        const [id] = entries[i]!;
        if (result.status === "fulfilled") {
          successful.push(result.value);
          const entry = this.platforms.get(id);
          if (entry) {
            entry.broadcastId = result.value.broadcast.broadcastId;
            entry.rtmpUrl = result.value.broadcast.rtmpUrl;
          }
        } else {
          const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
          this._transitionPlatform(id, "error", message);
        }
      }

      if (successful.length === 0) return;

      // Step (c): ensure OBS is streaming to relay (shared mutex, Property 22)
      const obsResult = await this.ensureObsStreamingToRelay();
      if (!obsResult.success) {
        for (const { platformId, broadcast } of successful) {
          this._endBroadcastBestEffort(platformId, broadcast.broadcastId);
          this._transitionPlatform(platformId, "error", "Could not start OBS stream");
        }
        return;
      }

      // Step (d): start forwarders
      for (const { platformId } of successful) {
        const entry = this.platforms.get(platformId);
        if (entry?.rtmpUrl) {
          this.relayService.startForwarder(platformId, entry.rtmpUrl);
        }
        this._transitionPlatform(platformId, "streaming");
      }

      this.startHealthPolling();
    } finally {
      this.operationInProgress = false;
      this.obsStartMutex = null;
    }
  }

  async startPlatform(platformType: string): Promise<void> {
    this.assertNotBusy();
    this.operationInProgress = true;
    try {
      const [id, entry] = this.findEntryByTypeOrThrow(platformType);

      // Best-effort cleanup if restarting from error (Property 30)
      if (entry.state.status === "error" && entry.broadcastId) {
        this._endBroadcastBestEffort(id, entry.broadcastId);
      }

      this._transitionPlatform(id, "starting", "Creating broadcast…");

      const { interpolatedStreamTitle, interpolatedDescription } = this.manifestService.getInterpolated();

      try {
        const privacy = typeof entry.config.metadata["privacy"] === "string" ? entry.config.metadata["privacy"] : undefined;
        const broadcast = await entry.client.createBroadcast(interpolatedStreamTitle, interpolatedDescription, privacy);
        entry.broadcastId = broadcast.broadcastId;
        entry.rtmpUrl = broadcast.rtmpUrl;
      } catch (error: unknown) {
        this._transitionPlatform(id, "error", error instanceof Error ? error.message : String(error));
        return;
      }

      const obsResult = await this.ensureObsStreamingToRelay();
      if (!obsResult.success) {
        if (entry.broadcastId) this._endBroadcastBestEffort(id, entry.broadcastId);
        this._transitionPlatform(id, "error", "Could not start OBS stream");
        return;
      }

      if (entry.rtmpUrl) {
        this.relayService.startForwarder(id, entry.rtmpUrl);
      }
      this._transitionPlatform(id, "streaming");
      this.startHealthPolling();
    } finally {
      this.operationInProgress = false;
      this.obsStartMutex = null;
    }
  }

  async stopAll(): Promise<void> {
    this.assertNotBusy();
    this.operationInProgress = true;
    try {
      const active = [...this.platforms.entries()].filter(
        ([, e]) => e.state.status === "streaming" || e.state.status === "no_source" || e.state.status === "recovering",
      );

      for (const [id] of active) {
        this._transitionPlatform(id, "stopping", "Stopping…");
      }

      await Promise.allSettled(active.map(([id, entry]) => this.stopSinglePlatform(id, entry)));

      this.stopHealthPolling();
      await this.checkAllIdle();
    } finally {
      this.operationInProgress = false;
    }
  }

  async stopPlatform(platformType: string): Promise<void> {
    this.assertNotBusy();
    this.operationInProgress = true;
    try {
      const [id, entry] = this.findEntryByTypeOrThrow(platformType);
      this._transitionPlatform(id, "stopping", "Stopping…");
      await this.stopSinglePlatform(id, entry);
      await this.checkAllIdle();
    } finally {
      this.operationInProgress = false;
    }
  }

  async validateTokensOnStartup(): Promise<void> {
    const configs = this.platformConfigDao.getAll().filter((c) => c.enabled);
    const summaries: PlatformHealthSummary[] = [];

    for (const config of configs) {
      const client = this.platformClients.get(config.platformType) ?? this.createClient(config);
      if (!client) continue;

      let healthy = false;

      // For YouTube: refresh proactively if token is expired or within 5 minutes of expiry
      if (config.platformType === "youtube" && this.isTokenExpiredOrExpiring(config.tokenExpiresAt)) {
        healthy = await this.attemptTokenRefresh(config, client);
      } else {
        try {
          healthy = await client.validateToken();
        } catch {
          healthy = false;
        }

        // If validation failed, try refreshing (token may have just expired)
        if (!healthy && config.platformType === "youtube") {
          healthy = await this.attemptTokenRefresh(config, client);
        }
      }

      if (!healthy) {
        logger.warn(`Token validation failed for ${config.label}`, {
          context: { platformType: config.platformType },
        });
      }

      const privacy = config.metadata["privacy"];
      summaries.push({
        platformType: config.platformType,
        label: config.label,
        healthy,
        ...(typeof privacy === "string" ? { privacy: privacy as "public" | "unlisted" | "private" } : {}),
      });
    }

    eventBus.emit(BUS_PLATFORM_READINESS_CHANGED, { platforms: summaries });

    // Start background timer to check token expiry every 60 seconds
    this.startTokenRefreshTimer();
  }

  destroy(): void {
    this.stopHealthPolling();
    this.stopTokenRefreshTimer();
    eventBus.unsubscribe(BUS_FORWARDER_EXITED, this.handleForwarderExited);
    eventBus.unsubscribe(BUS_RELAY_STATE_CHANGED, this.handleRelayStateChanged);
  }

  // ── Token refresh ─────────────────────────────────────────────────────────

  private isTokenExpiredOrExpiring(tokenExpiresAt: string | null): boolean {
    if (!tokenExpiresAt) return false;
    const expiresAt = new Date(tokenExpiresAt).getTime();
    const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;
    return expiresAt <= fiveMinutesFromNow;
  }

  private async attemptTokenRefresh(config: PlatformConfig, client: StreamingPlatformClient): Promise<boolean> {
    try {
      const tokenInfo = await client.refreshToken();
      this.platformConfigDao.updateTokens(config.id, tokenInfo.accessToken, tokenInfo.refreshToken, tokenInfo.expiresAt);
      logger.info(`Token refreshed for ${config.label}`);
      return true;
    } catch (err) {
      logger.warn(`Token refresh failed for ${config.label}`, {
        context: { error: err instanceof Error ? err.message : String(err) },
      });
      return false;
    }
  }

  private startTokenRefreshTimer(): void {
    if (this.tokenRefreshTimer) return;
    this.tokenRefreshTimer = setInterval(() => {
      void this.checkAndRefreshTokens();
    }, 60_000);
  }

  private stopTokenRefreshTimer(): void {
    if (this.tokenRefreshTimer) {
      clearInterval(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }
  }

  private async checkAndRefreshTokens(): Promise<void> {
    const configs = this.platformConfigDao.getAll().filter((c) => c.enabled && c.platformType === "youtube");
    for (const config of configs) {
      if (this.isTokenExpiredOrExpiring(config.tokenExpiresAt)) {
        const client = this.platformClients.get(config.platformType) ?? this.createClient(config);
        if (!client) continue;
        const success = await this.attemptTokenRefresh(config, client);
        if (!success) {
          eventBus.emit(BUS_PLATFORM_READINESS_CHANGED, {
            platforms: this.getPlatformHealth(),
          });
        }
      }
    }
  }

  // ── State machine ─────────────────────────────────────────────────────────

  _transitionPlatform(platformId: string, newStatus: PlatformStatus, statusMessage?: string): void {
    const entry = this.platforms.get(platformId);
    if (!entry) return;

    const current = entry.state.status;
    if (!VALID_TRANSITIONS[current].includes(newStatus)) {
      logger.warn(`Invalid platform state transition: ${current} → ${newStatus}`, { context: { platformId } });
      return;
    }

    entry.state = { status: newStatus, ...(statusMessage !== undefined ? { statusMessage } : {}) };

    logger.info(`Platform ${platformId}: ${current} → ${newStatus}`, { context: { platformId, statusMessage } });
    eventBus.emit(BUS_PLATFORM_STATE_CHANGED, { platformId, platformType: entry.config.platformType, state: { ...entry.state } });
  }

  // ── OBS start mutex (Property 22) ─────────────────────────────────────────

  private ensureObsStreamingToRelay(): Promise<{ success: boolean }> {
    if (this.obsStartMutex) return this.obsStartMutex;

    this.obsStartMutex = (async (): Promise<{ success: boolean }> => {
      // Already streaming and connected to relay — no work needed
      if (this.obsService.getState().streaming && this.relayService.getRelayState().obsConnected) {
        return { success: true };
      }

      const timeout = new Promise<{ success: false }>((resolve) => {
        setTimeout(() => resolve({ success: false }), OBS_START_TIMEOUT_MS);
      });

      const start = (async (): Promise<{ success: boolean }> => {
        // Start OBS stream (idempotent — OBS ignores if already streaming)
        const result = await this.obsService.startStream();
        if (!result.success) return { success: false };

        // Wait for OBS to actually connect to the relay
        if (this.relayService.getRelayState().obsConnected) return { success: true };

        return new Promise<{ success: boolean }>((resolve) => {
          const handler = (state: RelayState): void => {
            if (state.obsConnected) {
              eventBus.unsubscribe(BUS_RELAY_STATE_CHANGED, handler);
              resolve({ success: true });
            }
          };
          eventBus.subscribe(BUS_RELAY_STATE_CHANGED, handler);
        });
      })();

      return Promise.race([start, timeout]);
    })();

    return this.obsStartMutex;
  }

  // ── Stop helpers ───────────────────────────────────────────────────────────

  private async stopSinglePlatform(platformId: string, entry: PlatformEntry): Promise<void> {
    const work = async (): Promise<void> => {
      this.relayService.stopForwarder(platformId);
      if (entry.broadcastId) {
        try {
          await entry.client.endBroadcast(entry.broadcastId);
        } catch (error: unknown) {
          logger.warn(`Failed to end broadcast for ${entry.config.label}`, {
            context: { platformId, error: error instanceof Error ? error.message : String(error) },
          });
        }
        entry.broadcastId = undefined;
        entry.rtmpUrl = undefined;
      }
    };

    const timeout = new Promise<void>((resolve) => {
      setTimeout(() => {
        logger.warn(`Stop timed out for ${platformId} after ${STOP_TIMEOUT_MS}ms`);
        resolve();
      }, STOP_TIMEOUT_MS);
    });

    await Promise.race([work(), timeout]);
    this._transitionPlatform(platformId, "idle");
  }

  _endBroadcastBestEffort(platformId: string, broadcastId: string): void {
    const entry = this.platforms.get(platformId);
    if (!entry) return;
    void entry.client.endBroadcast(broadcastId).catch((error: unknown) => {
      logger.warn(`Best-effort broadcast cleanup failed for ${platformId}`, {
        context: { broadcastId, error: error instanceof Error ? error.message : String(error) },
      });
    });
  }

  // ── Health polling ─────────────────────────────────────────────────────────

  private startHealthPolling(): void {
    if (this.healthPollTimer) return;
    this.healthPollTimer = setInterval(() => {
      void this.pollHealth();
    }, HEALTH_POLL_INTERVAL_MS);
  }

  private stopHealthPolling(): void {
    if (this.healthPollTimer) {
      clearInterval(this.healthPollTimer);
      this.healthPollTimer = null;
    }
  }

  private async pollHealth(): Promise<void> {
    for (const [id, entry] of this.platforms) {
      if (entry.state.status !== "streaming") continue;

      try {
        const health = await entry.client.pollHealth();
        entry.healthFailureCount = 0;
        const mapped = health.healthy ? ("good" as const) : ("bad" as const);
        eventBus.emit(BUS_PLATFORM_HEALTH_UPDATED, { platformId: id, health: mapped });
      } catch {
        entry.healthFailureCount++;
        if (entry.healthFailureCount >= HEALTH_FAILURE_THRESHOLD) {
          eventBus.emit(BUS_PLATFORM_HEALTH_UPDATED, { platformId: id, health: "noData" });
        }
      }
    }
  }

  // ── EventBus handlers ─────────────────────────────────────────────────────

  private async onForwarderExited(platformId: string): Promise<void> {
    const entry = this.platforms.get(platformId);
    if (!entry) return;

    // Auto-recovery suppressed during No Source (Property 23)
    if (entry.state.status === "no_source") return;

    if (entry.state.status === "streaming") {
      logger.warn(`FFmpeg exited for ${platformId}, attempting recovery`);

      await new Promise((resolve) => setTimeout(resolve, RECOVERY_WAIT_MS));

      if (entry.rtmpUrl) {
        this.relayService.startForwarder(platformId, entry.rtmpUrl);
      }

      await new Promise((resolve) => setTimeout(resolve, RECOVERY_VERIFY_MS));

      try {
        const health = await entry.client.pollHealth();
        if (!health.healthy) {
          this._transitionPlatform(platformId, "error", `${entry.config.label} stream recovery failed`);
        }
      } catch {
        this._transitionPlatform(platformId, "error", `${entry.config.label} stream recovery failed`);
      }
    }
  }

  private onRelayStateChanged(payload: RelayState): void {
    if (payload.running && !payload.obsConnected) {
      // OBS disconnected → No Source for streaming platforms
      for (const [id, entry] of this.platforms) {
        if (entry.state.status === "streaming") {
          this._transitionPlatform(id, "no_source", "No source — waiting for OBS…");
        }
      }
    } else if (payload.running && payload.obsConnected) {
      // OBS reconnected → recover no_source platforms
      for (const [id, entry] of this.platforms) {
        if (entry.state.status === "no_source") {
          this._transitionPlatform(id, "recovering", "Verifying stream…");
          void this._recoverPlatform(id, entry);
        }
      }
    }
  }

  async _recoverPlatform(platformId: string, entry: PlatformEntry): Promise<void> {
    if (!entry.broadcastId) {
      this._transitionPlatform(platformId, "error", "Recovery failed — no broadcast to verify");
      return;
    }

    // Respawn forwarder if needed
    if (this.relayService.isForwarderAlive && !this.relayService.isForwarderAlive(platformId) && entry.rtmpUrl) {
      this.relayService.startForwarder(platformId, entry.rtmpUrl);
    }

    try {
      const health = await entry.client.pollHealth();
      if (health.healthy) {
        this._transitionPlatform(platformId, "streaming");
      } else {
        this._transitionPlatform(platformId, "error", `${entry.config.label} stream recovery failed`);
      }
    } catch {
      this._transitionPlatform(platformId, "error", `${entry.config.label} stream recovery failed`);
    }
  }

  // ── OBS stop when all idle (Req 7.7, Property 28) ─────────────────────────

  private async checkAllIdle(): Promise<void> {
    const activeStates: readonly PlatformStatus[] = ["streaming", "starting", "stopping", "no_source", "recovering"];
    const anyActive = [...this.platforms.values()].some((e) => activeStates.includes(e.state.status));

    if (!anyActive) {
      if (this.obsService.getState().streaming) {
        await this.obsService.stopStream();
      }
      this.stopHealthPolling();
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private loadPlatforms(): void {
    const configs = this.platformConfigDao.getAll().filter((c) => c.enabled);
    for (const config of configs) {
      const client = this.platformClients.get(config.platformType) ?? this.createClient(config);
      if (!client) continue;
      this.platforms.set(config.platformType, {
        config,
        client,
        state: { status: "idle" },
        broadcastId: undefined,
        rtmpUrl: undefined,
        healthFailureCount: 0,
      });
    }
  }

  private createClient(config: PlatformConfig): StreamingPlatformClient | null {
    switch (config.platformType) {
      case "youtube":
        return new YouTubeClient(config);
      case "facebook":
        return new FacebookClient(config);
      default:
        return null;
    }
  }

  private assertNotBusy(): void {
    if (this.operationInProgress) {
      throw new Error("A streaming operation is already in progress");
    }
  }

  private findEntryByTypeOrThrow(platformType: string): [string, PlatformEntry] {
    for (const [id, entry] of this.platforms) {
      if (entry.config.platformType === platformType) return [id, entry];
    }
    throw new Error(`Platform ${platformType} not found`);
  }
}
