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
import type { PlatformConfigDao } from "../platforms/platformConfigDao.js";
import type { RelayService } from "./relayService.js";
import type { ObsService } from "./obsService.js";
import type { SessionManifestService } from "./sessionManifestService.js";
import type { PlatformStatus, PlatformStreamState, PlatformHealthSummary, PlatformConfig, RelayState } from "../gateway/modules/platform/types.js";

// ── Valid state transitions per design doc ───────────────────────────────────

const VALID_TRANSITIONS: Record<PlatformStatus, readonly PlatformStatus[]> = {
  idle: ["starting"],
  starting: ["streaming", "error"],
  streaming: ["stopping", "no_source"],
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

interface PlatformEntry {
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
        this.transitionPlatform(id, "starting", "Creating broadcast…");
      }

      // Steps (a)+(b): create broadcasts in parallel
      const results = await Promise.allSettled(
        entries.map(async ([id, entry]): Promise<{ platformId: string; broadcast: BroadcastInfo }> => {
          const broadcast = await entry.client.createBroadcast(interpolatedStreamTitle, interpolatedDescription);
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
            entry.rtmpUrl = `${result.value.broadcast.streamUrl}/${result.value.broadcast.streamKey}`;
          }
        } else {
          const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
          this.transitionPlatform(id, "error", message);
        }
      }

      if (successful.length === 0) return;

      // Step (c): ensure OBS is streaming to relay (shared mutex, Property 22)
      const obsResult = await this.ensureObsStreamingToRelay();
      if (!obsResult.success) {
        for (const { platformId, broadcast } of successful) {
          this.endBroadcastBestEffort(platformId, broadcast.broadcastId);
          this.transitionPlatform(platformId, "error", "Could not start OBS stream");
        }
        return;
      }

      // Step (d): start forwarders
      for (const { platformId } of successful) {
        const entry = this.platforms.get(platformId);
        if (entry?.rtmpUrl) {
          this.relayService.startForwarder(platformId, entry.rtmpUrl);
        }
        this.transitionPlatform(platformId, "streaming");
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
        this.endBroadcastBestEffort(id, entry.broadcastId);
      }

      this.transitionPlatform(id, "starting", "Creating broadcast…");

      const { interpolatedStreamTitle, interpolatedDescription } = this.manifestService.getInterpolated();

      try {
        const broadcast = await entry.client.createBroadcast(interpolatedStreamTitle, interpolatedDescription);
        entry.broadcastId = broadcast.broadcastId;
        entry.rtmpUrl = `${broadcast.streamUrl}/${broadcast.streamKey}`;
      } catch (error: unknown) {
        this.transitionPlatform(id, "error", error instanceof Error ? error.message : String(error));
        return;
      }

      const obsResult = await this.ensureObsStreamingToRelay();
      if (!obsResult.success) {
        if (entry.broadcastId) this.endBroadcastBestEffort(id, entry.broadcastId);
        this.transitionPlatform(id, "error", "Could not start OBS stream");
        return;
      }

      if (entry.rtmpUrl) {
        this.relayService.startForwarder(id, entry.rtmpUrl);
      }
      this.transitionPlatform(id, "streaming");
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
        this.transitionPlatform(id, "stopping", "Stopping…");
      }

      await Promise.allSettled(active.map(([id, entry]) => this.stopSinglePlatform(id, entry)));

      this.stopHealthPolling();
      this.checkAllIdle();
    } finally {
      this.operationInProgress = false;
    }
  }

  async stopPlatform(platformType: string): Promise<void> {
    this.assertNotBusy();
    this.operationInProgress = true;
    try {
      const [id, entry] = this.findEntryByTypeOrThrow(platformType);
      this.transitionPlatform(id, "stopping", "Stopping…");
      await this.stopSinglePlatform(id, entry);
      this.checkAllIdle();
    } finally {
      this.operationInProgress = false;
    }
  }

  async validateTokensOnStartup(): Promise<void> {
    const configs = this.platformConfigDao.getAll().filter((c) => c.enabled);
    const summaries: PlatformHealthSummary[] = [];

    for (const config of configs) {
      const client = this.platformClients.get(config.platformType);
      if (!client) continue;

      let healthy = false;
      try {
        healthy = await client.validateToken();
      } catch {
        healthy = false;
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
  }

  destroy(): void {
    this.stopHealthPolling();
    eventBus.unsubscribe(BUS_FORWARDER_EXITED, this.handleForwarderExited);
    eventBus.unsubscribe(BUS_RELAY_STATE_CHANGED, this.handleRelayStateChanged);
  }

  // ── State machine ─────────────────────────────────────────────────────────

  private transitionPlatform(platformId: string, newStatus: PlatformStatus, statusMessage?: string): void {
    const entry = this.platforms.get(platformId);
    if (!entry) return;

    const current = entry.state.status;
    if (!VALID_TRANSITIONS[current].includes(newStatus)) {
      logger.warn(`Invalid platform state transition: ${current} → ${newStatus}`, { context: { platformId } });
      return;
    }

    entry.state = { status: newStatus, ...(statusMessage !== undefined ? { statusMessage } : {}) };

    logger.info(`Platform ${platformId}: ${current} → ${newStatus}`, { context: { platformId, statusMessage } });
    eventBus.emit(BUS_PLATFORM_STATE_CHANGED, { platformId, state: { ...entry.state } });
  }

  // ── OBS start mutex (Property 22) ─────────────────────────────────────────

  private ensureObsStreamingToRelay(): Promise<{ success: boolean }> {
    if (this.obsStartMutex) return this.obsStartMutex;

    this.obsStartMutex = (async (): Promise<{ success: boolean }> => {
      if (this.obsService.getState().streaming) return { success: true };

      const timeout = new Promise<{ success: false }>((resolve) => {
        setTimeout(() => resolve({ success: false }), OBS_START_TIMEOUT_MS);
      });
      const start = (async (): Promise<{ success: boolean }> => {
        const result = await this.obsService.startStream();
        return { success: result.success };
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
    this.transitionPlatform(platformId, "idle");
  }

  private endBroadcastBestEffort(platformId: string, broadcastId: string): void {
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
          this.transitionPlatform(platformId, "error", `${entry.config.label} stream recovery failed`);
        }
      } catch {
        this.transitionPlatform(platformId, "error", `${entry.config.label} stream recovery failed`);
      }
    }
  }

  private onRelayStateChanged(payload: RelayState): void {
    if (payload.running && !payload.obsConnected) {
      // OBS disconnected → No Source for streaming platforms
      for (const [id, entry] of this.platforms) {
        if (entry.state.status === "streaming") {
          this.transitionPlatform(id, "no_source", "No source — waiting for OBS…");
        }
      }
    } else if (payload.running && payload.obsConnected) {
      // OBS reconnected → recover no_source platforms
      for (const [id, entry] of this.platforms) {
        if (entry.state.status === "no_source") {
          this.transitionPlatform(id, "recovering", "Verifying stream…");
          void this.recoverPlatform(id, entry);
        }
      }
    }
  }

  private async recoverPlatform(platformId: string, entry: PlatformEntry): Promise<void> {
    if (!entry.broadcastId) {
      this.transitionPlatform(platformId, "error", "Recovery failed — no broadcast to verify");
      return;
    }

    // Respawn forwarder if needed
    if (this.relayService.isForwarderAlive && !this.relayService.isForwarderAlive(platformId) && entry.rtmpUrl) {
      this.relayService.startForwarder(platformId, entry.rtmpUrl);
    }

    try {
      const health = await entry.client.pollHealth();
      if (health.healthy) {
        this.transitionPlatform(platformId, "streaming");
      } else {
        this.transitionPlatform(platformId, "error", `${entry.config.label} stream recovery failed`);
      }
    } catch {
      this.transitionPlatform(platformId, "error", `${entry.config.label} stream recovery failed`);
    }
  }

  // ── OBS stop when all idle (Req 7.7, Property 28) ─────────────────────────

  private checkAllIdle(): void {
    const activeStates: readonly PlatformStatus[] = ["streaming", "starting", "stopping", "no_source", "recovering"];
    const anyActive = [...this.platforms.values()].some((e) => activeStates.includes(e.state.status));

    if (!anyActive) {
      if (this.obsService.getState().streaming) {
        void this.obsService.stopStream();
      }
      this.stopHealthPolling();
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private loadPlatforms(): void {
    const configs = this.platformConfigDao.getAll().filter((c) => c.enabled);
    for (const config of configs) {
      const client = this.platformClients.get(config.platformType);
      if (!client) continue;
      this.platforms.set(config.id, {
        config,
        client,
        state: { status: "idle" },
        broadcastId: undefined,
        rtmpUrl: undefined,
        healthFailureCount: 0,
      });
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
