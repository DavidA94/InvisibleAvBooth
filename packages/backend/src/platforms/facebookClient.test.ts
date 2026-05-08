import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PlatformConfig } from "./platformClient.js";
import { PlatformError } from "./platformClient.js";
import { FacebookClient } from "./facebookClient.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const BASE_CONFIG: PlatformConfig = {
  id: "fb-1",
  platformType: "facebook",
  label: "Church Page",
  enabled: true,
  accessToken: "page-access-token",
  tokenExpiresAt: null,
  metadata: { targetType: "page", pageId: "123456" },
  createdAt: "2026-01-01T00:00:00Z",
};

function makeClient(overrides: Partial<PlatformConfig> = {}): FacebookClient {
  return new FacebookClient({ ...BASE_CONFIG, ...overrides });
}

function mockResponse(data: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(data) } as Response;
}

describe("FacebookClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws PAGE_INACCESSIBLE when pageId is missing", () => {
    expect(() => makeClient({ metadata: {} })).toThrow(PlatformError);
  });

  describe("createBroadcast", () => {
    it("creates a live video and splits stream URL", async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: "video-789", stream_url: "rtmp://live.facebook.com/rtmp/stream-key-abc" }));

      const result = await makeClient().createBroadcast("Sunday Service", "Weekly service");

      expect(result).toEqual({
        broadcastId: "video-789",
        rtmpUrl: "rtmp://live.facebook.com/rtmp/stream-key-abc",
        streamUrl: "rtmp://live.facebook.com/rtmp",
        streamKey: "stream-key-abc",
      });
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("/123456/live_videos"), expect.objectContaining({ method: "POST" }));
    });

    it("throws BROADCAST_CREATE_FAILED on incomplete response", async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: "v-1" })); // missing stream_url

      await expect(makeClient().createBroadcast("T", "D")).rejects.toMatchObject({ code: "BROADCAST_CREATE_FAILED" });
    });

    it("throws TOKEN_EXPIRED on error code 190", async () => {
      mockFetch.mockResolvedValue(mockResponse({ error: { message: "token expired", code: 190 } }, false, 401));

      await expect(makeClient().createBroadcast("T", "D")).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
    });

    it("throws PAGE_INACCESSIBLE on error code 10", async () => {
      mockFetch.mockResolvedValue(mockResponse({ error: { message: "page not accessible", code: 10 } }, false, 403));

      await expect(makeClient().createBroadcast("T", "D")).rejects.toMatchObject({ code: "PAGE_INACCESSIBLE" });
    });
  });

  describe("endBroadcast", () => {
    it("ends a live video", async () => {
      mockFetch.mockResolvedValue(mockResponse({ success: true }));

      await expect(makeClient().endBroadcast("video-789")).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("/video-789"), expect.objectContaining({ method: "POST" }));
    });

    it("treats error code 100 (already ended) as success", async () => {
      mockFetch.mockResolvedValue(mockResponse({ error: { message: "already ended", code: 100 } }, false, 400));

      await expect(makeClient().endBroadcast("video-789")).resolves.toBeUndefined();
    });

    it("throws BROADCAST_END_FAILED on other errors", async () => {
      mockFetch.mockResolvedValue(mockResponse({ error: { message: "server error", code: 500 } }, false, 500));

      await expect(makeClient().endBroadcast("v-1")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    });
  });

  describe("getBroadcastStatus", () => {
    it("returns status from Graph API", async () => {
      mockFetch.mockResolvedValue(mockResponse({ status: "LIVE" }));

      const status = await makeClient().getBroadcastStatus("v-1");
      expect(status).toBe("LIVE");
    });

    it("returns 'unknown' when status is missing", async () => {
      mockFetch.mockResolvedValue(mockResponse({}));

      const status = await makeClient().getBroadcastStatus("v-1");
      expect(status).toBe("unknown");
    });
  });

  describe("pollHealth", () => {
    it("returns unhealthy when no video is active", async () => {
      const health = await makeClient().pollHealth();
      expect(health).toEqual({ healthy: false, streamHealth: "noVideo" });
    });

    it("returns health after broadcast creation", async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse({ id: "v-1", stream_url: "rtmp://fb.example.com/rtmp/key" }))
        .mockResolvedValueOnce(mockResponse({ status: "LIVE", live_views: 42 }));

      const client = makeClient();
      await client.createBroadcast("T", "D");
      const health = await client.pollHealth();

      expect(health).toEqual({ healthy: true, viewerCount: 42, streamHealth: "LIVE" });
    });
  });

  it("throws HEALTH_POLL_FAILED on network error", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ id: "v-1", stream_url: "rtmp://fb.example.com/rtmp/key" })).mockRejectedValue("network timeout");

    const client = makeClient();
    await client.createBroadcast("T", "D");
    await expect(client.pollHealth()).rejects.toMatchObject({ code: "HEALTH_POLL_FAILED" });
  });

  describe("validateToken", () => {
    it("returns true when page is accessible", async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: "123456" }));

      expect(await makeClient().validateToken()).toBe(true);
    });

    it("returns false when page is not accessible", async () => {
      mockFetch.mockResolvedValue(mockResponse({}, false, 401));

      expect(await makeClient().validateToken()).toBe(false);
    });

    it("returns false on network error", async () => {
      mockFetch.mockRejectedValue(new Error("network error"));

      expect(await makeClient().validateToken()).toBe(false);
    });
  });

  describe("refreshToken", () => {
    it("returns current access token (Facebook tokens are long-lived)", async () => {
      const result = await makeClient().refreshToken();
      expect(result).toEqual({ accessToken: "page-access-token" });
    });
  });
});
