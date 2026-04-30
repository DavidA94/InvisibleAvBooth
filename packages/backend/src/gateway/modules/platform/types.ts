import type {
  BUS_PLATFORM_STATE_CHANGED,
  BUS_PLATFORM_HEALTH_UPDATED,
  BUS_PLATFORM_READINESS_CHANGED,
  BUS_RELAY_STATE_CHANGED,
  BUS_FORWARDER_EXITED,
} from "../../../eventBus/types.js";

// ── Platform state machine ───────────────────────────────────────────────────

export type PlatformStatus = "idle" | "starting" | "streaming" | "stopping" | "error" | "no_source" | "recovering";

export interface PlatformStreamState {
  status: PlatformStatus;
  statusMessage?: string;
  broadcastId?: string;
  rtmpUrl?: string;
}

export type PlatformHealth = "good" | "ok" | "bad" | "noData";

// Relay state as reported by RelayService.getRelayState()
export interface RelayState {
  running: boolean;
  obsConnected: boolean;
}

export interface PlatformHealthSummary {
  platformType: "youtube" | "facebook";
  label: string;
  healthy: boolean;
  privacy?: "public" | "unlisted" | "private";
}

// ── Platform config (decoded from DB row) ────────────────────────────────────

export interface PlatformConfig {
  id: string;
  platformType: "youtube" | "facebook";
  label: string;
  enabled: boolean;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ── EventMap slices — merged into root EventMap in eventBus.ts ───────────────

export interface PlatformEventMap {
  [BUS_PLATFORM_STATE_CHANGED]: { platformId: string; state: PlatformStreamState };
  [BUS_PLATFORM_HEALTH_UPDATED]: { platformId: string; health: PlatformHealth };
  [BUS_PLATFORM_READINESS_CHANGED]: { platforms: PlatformHealthSummary[] };
}

export interface RelayEventMap {
  [BUS_RELAY_STATE_CHANGED]: RelayState;
  [BUS_FORWARDER_EXITED]: { platformId: string; code: number | null; lastStderr: string[] };
}
