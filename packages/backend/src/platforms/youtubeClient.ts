/**
 * YouTube Live Streaming API client.
 *
 * Uses googleapis to manage broadcasts via the YouTube Data API v3.
 * Each instance is bound to a single OAuth2 credential set from PlatformConfig.
 * The service layer handles token refresh scheduling — this client just executes.
 */
import { google } from "googleapis";
import type { youtube_v3 } from "googleapis";
import { logger } from "../logger.js";
import type { StreamingPlatformClient, BroadcastInfo, PlatformHealthDetails, TokenInfo, PlatformConfig } from "./platformClient.js";
import { PlatformError } from "./platformClient.js";

export class YouTubeClient implements StreamingPlatformClient {
  private readonly oauth2;
  private readonly youtube: youtube_v3.Youtube;
  /** Stored so pollHealth can look up the bound stream after createBroadcast. */
  private boundStreamId: string | null = null;

  constructor(private readonly config: PlatformConfig) {
    const clientId = process.env["YOUTUBE_CLIENT_ID"] ?? "";
    const clientSecret = process.env["YOUTUBE_CLIENT_SECRET"] ?? "";
    this.oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    const credentials: { access_token: string; refresh_token?: string } = { access_token: config.accessToken };
    if (config.refreshToken) credentials.refresh_token = config.refreshToken;
    this.oauth2.setCredentials(credentials);
    this.youtube = google.youtube({ version: "v3", auth: this.oauth2 });
  }

  async createBroadcast(title: string, description: string, privacy = "unlisted"): Promise<BroadcastInfo> {
    try {
      // Step 1: create the liveBroadcast resource
      const broadcastResponse = await this.youtube.liveBroadcasts.insert({
        part: ["snippet", "contentDetails", "status"],
        requestBody: {
          snippet: { title, description, scheduledStartTime: new Date().toISOString() },
          contentDetails: { enableAutoStart: true, enableAutoStop: true },
          status: { privacyStatus: privacy },
        },
      });
      const broadcastId = broadcastResponse.data.id;
      if (!broadcastId) throw new PlatformError("BROADCAST_CREATE_FAILED", "YouTube returned no broadcast ID");

      // Step 2: create a liveStream resource (ingestion point)
      const streamResponse = await this.youtube.liveStreams.insert({
        part: ["snippet", "cdn"],
        requestBody: {
          snippet: { title: `${title} - stream` },
          cdn: { frameRate: "variable", ingestionType: "rtmp", resolution: "variable" },
        },
      });
      const streamId = streamResponse.data.id;
      const ingestionInfo = streamResponse.data.cdn?.ingestionInfo;
      if (!streamId || !ingestionInfo?.ingestionAddress || !ingestionInfo.streamName) {
        throw new PlatformError("BROADCAST_CREATE_FAILED", "YouTube returned incomplete stream info");
      }

      // Step 3: bind the stream to the broadcast
      await this.youtube.liveBroadcasts.bind({ id: broadcastId, part: ["id"], streamId });
      this.boundStreamId = streamId;

      logger.info("YouTube broadcast created", { context: { broadcastId, streamId } });
      return {
        broadcastId,
        rtmpUrl: `${ingestionInfo.ingestionAddress}/${ingestionInfo.streamName}`,
        streamUrl: ingestionInfo.ingestionAddress,
        streamKey: ingestionInfo.streamName,
      };
    } catch (error) {
      if (error instanceof PlatformError) throw error;
      throw this.wrapError(error, "BROADCAST_CREATE_FAILED", "Failed to create YouTube broadcast");
    }
  }

  async endBroadcast(broadcastId: string): Promise<void> {
    try {
      await this.youtube.liveBroadcasts.transition({
        broadcastStatus: "complete",
        id: broadcastId,
        part: ["id"],
      });
      this.boundStreamId = null;
      logger.info("YouTube broadcast ended", { context: { broadcastId } });
    } catch (error) {
      // YouTube returns 403 redundantTransition if already ended — treat as success
      if (isGoogleApiError(error) && error.code === 403) {
        logger.info("YouTube broadcast already ended", { context: { broadcastId } });
        this.boundStreamId = null;
        return;
      }
      throw this.wrapError(error, "BROADCAST_END_FAILED", "Failed to end YouTube broadcast");
    }
  }

  async getBroadcastStatus(broadcastId: string): Promise<string> {
    try {
      const response = await this.youtube.liveBroadcasts.list({ id: [broadcastId], part: ["status"] });
      const status = response.data.items?.[0]?.status?.lifeCycleStatus;
      return status ?? "unknown";
    } catch (error) {
      throw this.wrapError(error, "HEALTH_POLL_FAILED", "Failed to get YouTube broadcast status");
    }
  }

  async pollHealth(): Promise<PlatformHealthDetails> {
    if (!this.boundStreamId) {
      return { healthy: false, streamHealth: "noStream" };
    }
    try {
      const response = await this.youtube.liveStreams.list({ id: [this.boundStreamId], part: ["status"] });
      const status = response.data.items?.[0]?.status;
      const health = status?.healthStatus?.status ?? "noData";
      return {
        healthy: health === "good",
        streamHealth: health,
      };
    } catch (error) {
      throw this.wrapError(error, "HEALTH_POLL_FAILED", "Failed to poll YouTube stream health");
    }
  }

  async refreshToken(): Promise<TokenInfo> {
    try {
      const { credentials } = await this.oauth2.refreshAccessToken();
      this.oauth2.setCredentials(credentials);
      const result: TokenInfo = { accessToken: credentials.access_token ?? "" };
      if (credentials.refresh_token) result.refreshToken = credentials.refresh_token;
      if (credentials.expiry_date) result.expiresAt = new Date(credentials.expiry_date).toISOString();
      return result;
    } catch (error) {
      throw this.wrapError(error, "TOKEN_REFRESH_FAILED", "Failed to refresh YouTube token");
    }
  }

  async validateToken(): Promise<boolean> {
    try {
      // Lightweight call to verify the token works
      await this.youtube.liveBroadcasts.list({ part: ["id"], mine: true, maxResults: 1 });
      return true;
    } catch {
      return false;
    }
  }

  private wrapError(error: unknown, code: PlatformError["code"], message: string): PlatformError {
    if (isGoogleApiError(error) && error.code === 403 && String(error.message).includes("quota")) {
      return new PlatformError("QUOTA_EXCEEDED", `YouTube quota exceeded: ${error.message}`);
    }
    if (isGoogleApiError(error) && error.code === 401) {
      return new PlatformError("TOKEN_EXPIRED", `YouTube token expired: ${error.message}`);
    }
    const detail = error instanceof Error ? error.message : String(error);
    return new PlatformError(code, `${message}: ${detail}`);
  }
}

interface GoogleApiError {
  code: number;
  message: string;
}

function isGoogleApiError(error: unknown): error is GoogleApiError {
  return typeof error === "object" && error !== null && "code" in error && "message" in error;
}
