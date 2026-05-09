/**
 * Facebook Live Video API client.
 *
 * Uses the Graph API via native fetch() to manage live videos on a Facebook Page.
 * Each instance is bound to a single Page access token from PlatformConfig.
 */
import { logger } from "../logger.js";
import type { StreamingPlatformClient, BroadcastInfo, PlatformHealthDetails, PlatformConfig, TokenInfo } from "./platformClient.js";
import { PlatformError } from "./platformClient.js";

const GRAPH_API_BASE = "https://graph.facebook.com/v25.0";

export class FacebookClient implements StreamingPlatformClient {
  private readonly targetId: string;
  private readonly accessToken: string;
  private readonly targetType: "page" | "user";
  private currentVideoId: string | null = null;

  constructor(config: PlatformConfig) {
    const metadata = config.metadata as { pageId?: string; userId?: string; targetType?: string };
    this.targetType = metadata.targetType === "user" ? "user" : "page";
    if (this.targetType === "page") {
      if (!metadata.pageId) throw new PlatformError("PAGE_INACCESSIBLE", "Facebook config missing pageId in metadata");
      this.targetId = metadata.pageId;
    } else {
      if (!metadata.userId) throw new PlatformError("PAGE_INACCESSIBLE", "Facebook config missing userId in metadata");
      this.targetId = metadata.userId;
    }
    this.accessToken = config.accessToken;
  }

  async createBroadcast(title: string, description: string, privacy?: string): Promise<BroadcastInfo> {
    try {
      const params: Record<string, string> = {
        title,
        description,
        status: "LIVE_NOW",
        access_token: this.accessToken,
      };
      // User profiles require and support privacy; Pages are always public
      if (this.targetType === "user") {
        params.privacy = JSON.stringify({ value: privacy ?? "SELF" });
      }

      const response = await fetch(`${GRAPH_API_BASE}/${this.targetId}/live_videos`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params).toString(),
      });
      const data = (await response.json()) as FacebookLiveVideoResponse;
      if (!response.ok) throw this.parseGraphError(data);

      if (!data.id || !data.stream_url) {
        throw new PlatformError("BROADCAST_CREATE_FAILED", "Facebook returned incomplete live video data");
      }

      this.currentVideoId = data.id;
      // Facebook stream_url is a full RTMP URL; split into base URL and stream key
      const lastSlash = data.stream_url.lastIndexOf("/");
      const streamUrl = data.stream_url.substring(0, lastSlash);
      const streamKey = data.stream_url.substring(lastSlash + 1);

      logger.info("Facebook broadcast created", { context: { broadcastId: data.id } });
      return { broadcastId: data.id, rtmpUrl: data.stream_url, streamUrl, streamKey };
    } catch (error) {
      if (error instanceof PlatformError) throw error;
      throw this.wrapError(error, "BROADCAST_CREATE_FAILED", "Failed to create Facebook broadcast");
    }
  }

  async endBroadcast(broadcastId: string): Promise<void> {
    try {
      const body = new URLSearchParams({ end_live_video: "true", access_token: this.accessToken });
      const response = await fetch(`${GRAPH_API_BASE}/${broadcastId}`, { method: "POST", body });
      const data = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        // Already ended — treat as success
        const errorData = data as FacebookErrorResponse;
        if (errorData.error?.code === 100) {
          logger.info("Facebook broadcast already ended", { context: { broadcastId } });
          this.currentVideoId = null;
          return;
        }
        throw this.parseGraphError(data);
      }
      this.currentVideoId = null;
      logger.info("Facebook broadcast ended", { context: { broadcastId } });
    } catch (error) {
      if (error instanceof PlatformError) throw error;
      throw this.wrapError(error, "BROADCAST_END_FAILED", "Failed to end Facebook broadcast");
    }
  }

  async getBroadcastStatus(broadcastId: string): Promise<string> {
    try {
      const url = `${GRAPH_API_BASE}/${broadcastId}?fields=status&access_token=${this.accessToken}`;
      const response = await fetch(url);
      const data = (await response.json()) as { status?: string };
      if (!response.ok) throw this.parseGraphError(data);
      return data.status ?? "unknown";
    } catch (error) {
      if (error instanceof PlatformError) throw error;
      throw this.wrapError(error, "HEALTH_POLL_FAILED", "Failed to get Facebook broadcast status");
    }
  }

  async pollHealth(): Promise<PlatformHealthDetails> {
    if (!this.currentVideoId) return { healthy: false, streamHealth: "noVideo" };
    try {
      const url = `${GRAPH_API_BASE}/${this.currentVideoId}?fields=status,live_views&access_token=${this.accessToken}`;
      const response = await fetch(url);
      const data = (await response.json()) as { status?: string; live_views?: number };
      if (!response.ok) throw this.parseGraphError(data);
      const result: PlatformHealthDetails = {
        healthy: data.status === "LIVE",
        streamHealth: data.status ?? "unknown",
      };
      if (data.live_views !== undefined) result.viewerCount = data.live_views;
      return result;
    } catch (error) {
      if (error instanceof PlatformError) throw error;
      throw this.wrapError(error, "HEALTH_POLL_FAILED", "Failed to poll Facebook health");
    }
  }

  async refreshToken(): Promise<TokenInfo> {
    // Facebook page tokens are long-lived and don't require refresh
    return { accessToken: this.accessToken };
  }

  async validateToken(): Promise<boolean> {
    try {
      const url = `${GRAPH_API_BASE}/${this.targetId}?fields=id&access_token=${this.accessToken}`;
      const response = await fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  }

  private parseGraphError(data: unknown): PlatformError {
    const errorData = data as FacebookErrorResponse;
    const graphError = errorData?.error;
    if (!graphError) return new PlatformError("NETWORK_ERROR", "Unknown Facebook API error");

    if (graphError.code === 190) return new PlatformError("TOKEN_EXPIRED", `Facebook token expired: ${graphError.message}`);
    if (graphError.code === 10 || graphError.code === 200) {
      return new PlatformError("PAGE_INACCESSIBLE", `Facebook page inaccessible: ${graphError.message}`);
    }
    return new PlatformError("NETWORK_ERROR", `Facebook API error ${graphError.code}: ${graphError.message}`);
  }

  private wrapError(error: unknown, code: PlatformError["code"], message: string): PlatformError {
    const detail = error instanceof Error ? error.message : String(error);
    return new PlatformError(code, `${message}: ${detail}`);
  }
}

interface FacebookLiveVideoResponse {
  id?: string;
  stream_url?: string;
}

interface FacebookErrorResponse {
  error?: { message: string; code: number; type?: string };
}
