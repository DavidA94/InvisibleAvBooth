import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildTestServer, resetServer, destroyServer, loginAsAdmin } from "../harness.js";
import type { TestServer } from "../harness.js";

let s: TestServer;

beforeAll(async () => {
  s = await buildTestServer();
});
afterAll(() => destroyServer(s));
beforeEach(() => resetServer(s));

const seedActor = { sub: "seed", username: "seed", role: "ADMIN" as const, iat: 0, exp: 9999999999 };

function getCookie(res: { headers: Record<string, unknown> }): string {
  return (res.headers["set-cookie"] as string[])?.[0] ?? "";
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  it("returns 200 and sets HttpOnly cookie on valid credentials", async () => {
    await s.ctx.authService.createUser({ username: "alice", password: "pass", role: "AvVolunteer" }, seedActor);
    const res = await s.agent.post("/api/auth/login").send({ username: "alice", password: "pass" });
    expect(res.status).toBe(200);
    expect(getCookie(res)).toContain("HttpOnly");
    expect(res.body.user).toBeDefined();
  });

  it("sets a longer Max-Age when rememberMe is true", async () => {
    await s.ctx.authService.createUser({ username: "alice", password: "pass", role: "AvVolunteer" }, seedActor);
    const res = await s.agent.post("/api/auth/login").send({ username: "alice", password: "pass", rememberMe: true });
    expect(res.status).toBe(200);
    expect(getCookie(res)).toContain("Max-Age=");
  });

  it("returns 401 on wrong password", async () => {
    await s.ctx.authService.createUser({ username: "alice", password: "pass", role: "AvVolunteer" }, seedActor);
    const res = await s.agent.post("/api/auth/login").send({ username: "alice", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when username is missing", async () => {
    const res = await s.agent.post("/api/auth/login").send({ password: "pass" });
    expect(res.status).toBe(400);
  });
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────

describe("POST /api/auth/logout", () => {
  it("clears the token cookie", async () => {
    const res = await s.agent.post("/api/auth/logout");
    expect(res.status).toBe(200);
    expect(getCookie(res)).toContain("token=;");
  });
});

// ── POST /api/auth/change-password ────────────────────────────────────────────

describe("POST /api/auth/change-password (self-service)", () => {
  it("allows user to change own password", async () => {
    await s.ctx.authService.createUser({ username: "alice", password: "old", role: "AvVolunteer" }, seedActor);
    const loginRes = await s.agent.post("/api/auth/login").send({ username: "alice", password: "old" });
    const cookie = getCookie(loginRes);
    const res = await s.agent.post("/api/auth/change-password").set("Cookie", cookie).send({ newPassword: "new123" });
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("returns 400 when newPassword is missing", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.post("/api/auth/change-password").set("Cookie", cookie).send({});
    expect(res.status).toBe(400);
  });
});

// ── requiresPasswordChange enforcement ────────────────────────────────────────

describe("requiresPasswordChange enforcement", () => {
  it("blocks access to protected routes when requiresPasswordChange is set", async () => {
    await s.ctx.authService.createUser({ username: "newuser", password: "pass", role: "AvVolunteer" }, seedActor);
    const loginRes = await s.agent.post("/api/auth/login").send({ username: "newuser", password: "pass" });
    const cookie = getCookie(loginRes);
    const res = await s.agent.get("/api/session/manifest").set("Cookie", cookie);
    expect(res.status).toBe(403);
  });

  it("allows access after changing password", async () => {
    await s.ctx.authService.createUser({ username: "newuser", password: "pass", role: "AvVolunteer" }, seedActor);
    const loginRes = await s.agent.post("/api/auth/login").send({ username: "newuser", password: "pass" });
    const oldCookie = getCookie(loginRes);
    const changeRes = await s.agent.post("/api/auth/change-password").set("Cookie", oldCookie).send({ newPassword: "newpass" });
    const newCookie = getCookie(changeRes);
    const res = await s.agent.get("/api/session/manifest").set("Cookie", newCookie);
    expect(res.status).toBe(200);
  });
});

// ── POST /api/admin/users/:id/change-password ─────────────────────────────────

describe("POST /api/admin/users/:id/change-password", () => {
  it("changes password and re-issues cookie", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const listRes = await s.agent.get("/api/admin/users").set("Cookie", cookie);
    const adminUser = (listRes.body as Array<{ id: string }>)[0]!;
    const res = await s.agent.post(`/api/admin/users/${adminUser.id}/change-password`).set("Cookie", cookie).send({ newPassword: "newpass123" });
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("returns 400 when newPassword is missing", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const listRes = await s.agent.get("/api/admin/users").set("Cookie", cookie);
    const adminUser = (listRes.body as Array<{ id: string }>)[0]!;
    const res = await s.agent.post(`/api/admin/users/${adminUser.id}/change-password`).set("Cookie", cookie).send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown user id", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.post("/api/admin/users/nonexistent/change-password").set("Cookie", cookie).send({ newPassword: "p" });
    expect(res.status).toBe(404);
  });

  it("returns 403 when non-ADMIN tries to change another user's password", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    await s.ctx.authService.createUser({ username: "vol", password: "pass", role: "AvVolunteer" }, seedActor);
    const volLogin = await s.agent.post("/api/auth/login").send({ username: "vol", password: "pass" });
    const volCookie = getCookie(volLogin);
    const adminId = ((await s.agent.get("/api/admin/users").set("Cookie", cookie)).body as Array<{ id: string; username: string }>).find(
      (u) => u.username === "admin",
    )!.id;
    const res = await s.agent.post(`/api/admin/users/${adminId}/change-password`).set("Cookie", volCookie).send({ newPassword: "hack" });
    expect(res.status).toBe(403);
  });
});
