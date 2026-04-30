import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildTestServer, resetServer, destroyServer, loginAsAdmin, loginAs } from "../harness.js";
import type { TestServer } from "../harness.js";

let s: TestServer;

beforeAll(async () => { s = await buildTestServer(); });
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
    const res = await s.agent.put("/api/admin/platforms/youtube").set("Cookie", cookie).send({
      enabled: true, metadata: { privacy: "unlisted" }, label: "My YouTube", accessToken: "test-token",
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
    const res = await s.agent.get("/api/auth/callback/youtube");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Missing");
  });

  it("rejects callback with invalid state", async () => {
    const res = await s.agent.get("/api/auth/callback/youtube?state=invalid&code=abc");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid");
  });

  it("accepts callback with valid state", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const stateRes = await s.agent.post("/api/admin/platforms/youtube/oauth-start").set("Cookie", cookie);
    expect(stateRes.status).toBe(200);
    const { state } = stateRes.body;

    const res = await s.agent.get(`/api/auth/callback/youtube?state=${state}&code=test-code`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const row = s.ctx.database.prepare("SELECT * FROM oauth_states WHERE state = ?").get(state);
    expect(row).toBeUndefined();
  });

  it("rejects expired state", async () => {
    s.ctx.database.prepare("INSERT INTO oauth_states (state, platformType, createdAt) VALUES (?, ?, ?)").run("old-state", "youtube", new Date(Date.now() - 10 * 60 * 1000).toISOString());
    const res = await s.agent.get("/api/auth/callback/youtube?state=old-state&code=abc");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("expired");
  });
});
