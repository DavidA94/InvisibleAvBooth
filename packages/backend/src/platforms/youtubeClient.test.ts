import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PlatformConfig } from "./platformClient.js";
import { PlatformError } from "./platformClient.js";
import { YouTubeClient } from "./youtubeClient.js";

// Mock googleapis — intercept all YouTube API calls
const mockLiveBroadcastsInsert = vi.fn();
const mockLiveBroadcastsBind = vi.fn();
const mockLiveBroadcastsTransition = vi.fn();
const mockLiveBroadcastsList = vi.fn();
const mockLiveStreamsInsert = vi.fn();
const mockLiveStreamsList = vi.fn();
const mockRefreshAccessToken = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class MockOAuth2 {
        setCredentials = vi.fn();
        refreshAccessToken = mockRefreshAccessToken;
      },
    },
    youtube: () => ({
      liveBroadcasts: {
        insert: mockLiveBroadcastsInsert,
        bind: mockLiveBroadcastsBind,
        transition: mockLiveBroadcastsTransition,
        list: mockLiveBroadcastsList,
      },
      liveStreams: {
        insert: mockLiveStreamsInsert,
        list: mockLiveStreamsList,
      },
    }),
  },
}));

const BASE_CONFIG: PlatformConfig = {
  id: "yt-1",
  platformType: "youtube",
  label: "Main YouTube",
  enabled: true,
  accessToken: "access-token",
  refreshToken: "refresh-token",
  tokenExpiresAt: null,
  metadata: { clientId: "client-id", clientSecret: "client-secret" },
  createdAt: "2026-01-01T00:00:00Z",
};

function makeClient(overrides: Partial<PlatformConfig> = {}): YouTubeClient {
  return new YouTubeClient({ ...BASE_CONFIG, ...overrides });
}

describe("YouTubeClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createBroadcast", () => {
    it("creates broadcast, stream, and binds them", async () => {
      mockLiveBroadcastsInsert.mockResolvedValue({ data: { id: "broadcast-123" } });
      mockLiveStreamsInsert.mockResolvedValue({
        data: {
          id: "stream-456",
          cdn: { ingestionInfo: { ingestionAddress: "rtmp://yt.example.com/live", streamName: "key-abc" } },
        },
      });
      mockLiveBroadcastsBind.mockResolvedValue({});

      const result = await makeClient().createBroadcast("Sunday Service", "Weekly service");

      expect(result).toEqual({
        broadcastId: "broadcast-123",
        rtmpUrl: "rtmp://yt.example.com/live/key-abc",
        streamUrl: "rtmp://yt.example.com/live",
        streamKey: "key-abc",
      });
      expect(mockLiveBroadcastsInsert).toHaveBeenCalledOnce();
      expect(mockLiveStreamsInsert).toHaveBeenCalledOnce();
      expect(mockLiveBroadcastsBind).toHaveBeenCalledWith(
        expect.objectContaining({ id: "broadcast-123", streamId: "stream-456" }),
      );
    });

    it("passes privacy setting to broadcast insert", async () => {
      mockLiveBroadcastsInsert.mockResolvedValue({ data: { id: "b-1" } });
      mockLiveStreamsInsert.mockResolvedValue({
        data: { id: "s-1", cdn: { ingestionInfo: { ingestionAddress: "rtmp://x", streamName: "k" } } },
      });
      mockLiveBroadcastsBind.mockResolvedValue({});

      await makeClient().createBroadcast("Title", "Desc", "public");

      expect(mockLiveBroadcastsInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({ status: { privacyStatus: "public" } }),
        }),
      );
    });

    it("throws BROADCAST_CREATE_FAILED when broadcast insert returns no id", async () => {
      mockLiveBroadcastsInsert.mockResolvedValue({ data: {} });

      await expect(makeClient().createBroadcast("T", "D")).rejects.toThrow(PlatformError);
      await expect(makeClient().createBroadcast("T", "D")).rejects.toMatchObject({ code: "BROADCAST_CREATE_FAILED" });
    });

    it("throws QUOTA_EXCEEDED on 403 quota error", async () => {
      mockLiveBroadcastsInsert.mockRejectedValue({ code: 403, message: "quota exceeded" });

      await expect(makeClient().createBroadcast("T", "D")).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
    });

    it("throws TOKEN_EXPIRED on 401 error", async () => {
      mockLiveBroadcastsInsert.mockRejectedValue({ code: 401, message: "invalid credentials" });

      await expect(makeClient().createBroadcast("T", "D")).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
    });
  });

  describe("endBroadcast", () => {
    it("transitions broadcast to complete", async () => {
      mockLiveBroadcastsTransition.mockResolvedValue({});

      await makeClient().endBroadcast("broadcast-123");

      expect(mockLiveBroadcastsTransition).toHaveBeenCalledWith(
        expect.objectContaining({ broadcastStatus: "complete", id: "broadcast-123" }),
      );
    });

    it("treats 403 (already ended) as success", async () => {
      mockLiveBroadcastsTransition.mockRejectedValue({ code: 403, message: "redundantTransition" });

      await expect(makeClient().endBroadcast("broadcast-123")).resolves.toBeUndefined();
    });

    it("throws BROADCAST_END_FAILED on other errors", async () => {
      mockLiveBroadcastsTransition.mockRejectedValue({ code: 500, message: "server error" });

      await expect(makeClient().endBroadcast("b-1")).rejects.toMatchObject({ code: "BROADCAST_END_FAILED" });
    });
  });

  describe("getBroadcastStatus", () => {
    it("returns lifeCycleStatus", async () => {
      mockLiveBroadcastsList.mockResolvedValue({ data: { items: [{ status: { lifeCycleStatus: "live" } }] } });

      const status = await makeClient().getBroadcastStatus("b-1");
      expect(status).toBe("live");
    });

    it("returns 'unknown' when no status found", async () => {
      mockLiveBroadcastsList.mockResolvedValue({ data: { items: [{}] } });

      const status = await makeClient().getBroadcastStatus("b-1");
      expect(status).toBe("unknown");
    });
  });

  describe("pollHealth", () => {
    it("returns unhealthy when no stream is bound", async () => {
      const health = await makeClient().pollHealth();
      expect(health).toEqual({ healthy: false, streamHealth: "noStream" });
    });

    it("returns health status after broadcast creation", async () => {
      // Create a broadcast first to set boundStreamId
      mockLiveBroadcastsInsert.mockResolvedValue({ data: { id: "b-1" } });
      mockLiveStreamsInsert.mockResolvedValue({
        data: { id: "s-1", cdn: { ingestionInfo: { ingestionAddress: "rtmp://x", streamName: "k" } } },
      });
      mockLiveBroadcastsBind.mockResolvedValue({});
      mockLiveStreamsList.mockResolvedValue({
        data: { items: [{ status: { healthStatus: { status: "good" } } }] },
      });

      const client = makeClient();
      await client.createBroadcast("T", "D");
      const health = await client.pollHealth();

      expect(health).toEqual({ healthy: true, streamHealth: "good" });
    });
  });

  describe("refreshToken", () => {
    it("returns new token info", async () => {
      mockRefreshAccessToken.mockResolvedValue({
        credentials: { access_token: "new-access", refresh_token: "new-refresh", expiry_date: 1735689600000 },
      });

      const result = await makeClient().refreshToken();
      expect(result.accessToken).toBe("new-access");
      expect(result.refreshToken).toBe("new-refresh");
      expect(result.expiresAt).toBeTruthy();
    });

    it("throws TOKEN_REFRESH_FAILED on error", async () => {
      mockRefreshAccessToken.mockRejectedValue(new Error("refresh failed"));

      await expect(makeClient().refreshToken()).rejects.toMatchObject({ code: "TOKEN_REFRESH_FAILED" });
    });
  });

  describe("validateToken", () => {
    it("returns true when API call succeeds", async () => {
      mockLiveBroadcastsList.mockResolvedValue({ data: { items: [] } });

      expect(await makeClient().validateToken()).toBe(true);
    });

    it("returns false when API call fails", async () => {
      mockLiveBroadcastsList.mockRejectedValue(new Error("unauthorized"));

      expect(await makeClient().validateToken()).toBe(false);
    });
  });
});
