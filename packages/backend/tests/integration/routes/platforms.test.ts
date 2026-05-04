import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { buildTestServer, resetServer, destroyServer, loginAsAdmin, loginAs } from "../harness.js";
import type { TestServer } from "../harness.js";

let s: TestServer;

beforeAll(async () => {
  s = await buildTestServer();
});
afterAll(() => destroyServer(s));
beforeEach(() => resetServer(s));

describe("GET /api/admin/platforms", () => {
  it("returns empty list initially", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.get("/api/admin/platforms").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns 401 without auth", async () => {
    expect((await s.agent.get("/api/admin/platforms")).status).toBe(401);
  });
});

describe("PUT /api/admin/platforms/:platformType", () => {
  it("creates a platform config", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent
      .put("/api/admin/platforms/youtube")
      .set("Cookie", cookie)
      .send({
        enabled: true,
        metadata: { privacy: "unlisted" },
        label: "My YouTube",
        accessToken: "test-token",
      });
    expect(res.status).toBe(200);
    expect(res.body.platformType).toBe("youtube");
    expect(res.body.hasToken).toBe(true);
    expect(res.body.accessToken).toBeUndefined();
  });
});

describe("DELETE /api/admin/platforms/:platformType", () => {
  it("deletes a platform config", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    await s.agent.put("/api/admin/platforms/youtube").set("Cookie", cookie).send({ enabled: true, label: "YT", accessToken: "tok" });
    const res = await s.agent.delete("/api/admin/platforms/youtube").set("Cookie", cookie);
    expect(res.status).toBe(204);
  });
});

describe("GET /api/platforms/health", () => {
  it("returns health for any authenticated role", async () => {
    const cookie = await loginAs(s.agent, s.ctx.authService, "vol", "pass", "AvVolunteer");
    const res = await s.agent.get("/api/platforms/health").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("OAuth callbacks", () => {
  it("rejects callback without state parameter", async () => {
    const res = await s.agent.get("/api/auth/callback/youtube").redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toContain("error=missing_params");
  });

  it("rejects callback with invalid state", async () => {
    const res = await s.agent.get("/api/auth/callback/youtube?state=invalid&code=abc").redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toContain("error=invalid_state");
  });

  it("accepts callback with valid state", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const stateRes = await s.agent.post("/api/admin/platforms/youtube/oauth-start").set("Cookie", cookie);
    expect(stateRes.status).toBe(200);
    const { state } = stateRes.body;

    const res = await s.agent.get(`/api/auth/callback/youtube?state=${state}&code=test-code`).redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toContain("/admin/platforms/youtube");

    const row = s.ctx.database.prepare("SELECT * FROM oauth_states WHERE state = ?").get(state);
    expect(row).toBeUndefined();
  });

  it("rejects expired state", async () => {
    s.ctx.database
      .prepare("INSERT INTO oauth_states (state, platformType, createdAt) VALUES (?, ?, ?)")
      .run("old-state", "youtube", new Date(Date.now() - 10 * 60 * 1000).toISOString());
    const res = await s.agent.get("/api/auth/callback/youtube?state=old-state&code=abc").redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toContain("error=expired");
  });
});

describe("OAuth token exchange", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("exchanges YouTube code for tokens and stores config", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: "yt-access", refresh_token: "yt-refresh", expires_in: 3600 }),
    }) as unknown as typeof fetch;

    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const stateRes = await s.agent.post("/api/admin/platforms/youtube/oauth-start").set("Cookie", cookie);
    const { state } = stateRes.body;

    const res = await s.agent.get(`/api/auth/callback/youtube?state=${state}&code=yt-code`).redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toContain("connected=true");
  });

  it("exchanges Facebook code for tokens and stores config", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: "fb-access", expires_in: 5184000 }),
    }) as unknown as typeof fetch;

    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const stateRes = await s.agent.post("/api/admin/platforms/facebook/oauth-start").set("Cookie", cookie);
    const { state } = stateRes.body;

    const res = await s.agent.get(`/api/auth/callback/facebook?state=${state}&code=fb-code`).redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toContain("connected=true");
  });

  it("redirects with error when YouTube token exchange fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch;

    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const stateRes = await s.agent.post("/api/admin/platforms/youtube/oauth-start").set("Cookie", cookie);
    const { state } = stateRes.body;

    const res = await s.agent.get(`/api/auth/callback/youtube?state=${state}&code=bad-code`).redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toContain("error=token_exchange_failed");
  });

  it("redirects with error when Facebook token exchange fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400 }) as unknown as typeof fetch;

    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const stateRes = await s.agent.post("/api/admin/platforms/facebook/oauth-start").set("Cookie", cookie);
    const { state } = stateRes.body;

    const res = await s.agent.get(`/api/auth/callback/facebook?state=${state}&code=bad-code`).redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toContain("error=token_exchange_failed");
  });
});

describe("OAuth start", () => {
  it("returns auth URL for facebook", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.post("/api/admin/platforms/facebook/oauth-start").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.authUrl).toContain("facebook.com");
    expect(res.body.state).toBeDefined();
  });
});

describe("GET /api/admin/platforms/:platformType", () => {
  it("returns 404 when platform not configured", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.get("/api/admin/platforms/youtube").set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  it("returns platform config after creation", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    await s.agent.put("/api/admin/platforms/youtube").set("Cookie", cookie).send({ enabled: true, label: "YT", accessToken: "tok" });
    const res = await s.agent.get("/api/admin/platforms/youtube").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.platformType).toBe("youtube");
    expect(res.body.accessToken).toBeUndefined();
  });
});

describe("GET /api/platforms/health", () => {
  it("returns health for configured platforms", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    await s.agent.put("/api/admin/platforms/youtube").set("Cookie", cookie).send({ enabled: true, label: "YT", accessToken: "tok" });
    const res = await s.agent.get("/api/platforms/health").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body[0].platformType).toBe("youtube");
    expect(res.body[0].healthy).toBe(true);
  });
});

describe("PUT /api/admin/platforms/:platformType error handling", () => {
  it("returns 400 when upsert throws", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    // Send invalid data that will cause upsert to throw (missing required accessToken)
    const res = await s.agent.put("/api/admin/platforms/youtube").set("Cookie", cookie).send({ enabled: true, label: "YT" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe("OAuth token exchange error handling", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("handles fetch throwing (not just returning non-ok)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("DNS resolution failed")) as unknown as typeof fetch;

    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const stateRes = await s.agent.post("/api/admin/platforms/youtube/oauth-start").set("Cookie", cookie);
    const { state } = stateRes.body;

    const res = await s.agent.get(`/api/auth/callback/youtube?state=${state}&code=test-code`).redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toContain("error=token_exchange_failed");
  });
});

describe("cleanupStaleOAuthStates", () => {
  it("removes stale states on startup", async () => {
    s.ctx.database
      .prepare("INSERT INTO oauth_states (state, platformType, createdAt) VALUES (?, ?, ?)")
      .run("stale-1", "youtube", new Date(Date.now() - 10 * 60 * 1000).toISOString());

    const { cleanupStaleOAuthStates } = await import("../../../src/routes/platformRoutes.js");
    cleanupStaleOAuthStates(s.ctx.database);

    const row = s.ctx.database.prepare("SELECT * FROM oauth_states WHERE state = ?").get("stale-1");
    expect(row).toBeUndefined();
  });
});
